"""
Multi-Format GIS Export & Cadastral Survey PDF Report Engine for CadastraAI.
Generates:
  1. GeoJSON (EPSG:4326 FeatureCollections)
  2. ESRI Shapefile (Zipped bundle containing .shp, .shx, .dbf, .prj using pyshp)
  3. KML (Google Earth Placemarks & Polygons)
  4. DXF (AutoCAD LWPOLYLINE boundary layers)
  5. Official Survey Preparation PDF Report with metadata, GNSS RMSE, topology, and legal certification.
"""

import os
import io
import zipfile
import tempfile
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
import shapefile

import sqlite3
import struct
from shapely.geometry import Polygon
from shapely import wkb

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, A4
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

logger = logging.getLogger("cadastra.export")

WGS84_PRJ = (
    'GEOGCS["GCS_WGS_1984",'
    'DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],'
    'PRIMEM["Greenwich",0.0],'
    'UNIT["Degree",0.0174532925199433]]'
)


def export_to_geopackage(parcels: List[Dict[str, Any]], table_name: str = "cadastral_parcels") -> bytes:
    """
    Builds a valid OGC GeoPackage (.gpkg) file containing survey parcels
    with EPSG:4326 geometry and cadastral attribute columns.
    """
    with tempfile.NamedTemporaryFile(suffix=".gpkg", delete=False) as tmp:
        gpkg_path = tmp.name

    try:
        conn = sqlite3.connect(gpkg_path)
        cur = conn.cursor()

        # OGC GeoPackage application_id = 0x47504B47 ('GPKG')
        cur.execute("PRAGMA application_id = 1196444487;")
        cur.execute("PRAGMA user_version = 10200;")

        # gpkg_spatial_ref_sys
        cur.execute("""
            CREATE TABLE gpkg_spatial_ref_sys (
                srs_name TEXT NOT NULL,
                srs_id INTEGER NOT NULL PRIMARY KEY,
                organization TEXT NOT NULL,
                organization_coordsys_id INTEGER NOT NULL,
                definition TEXT NOT NULL,
                description TEXT
            );
        """)
        cur.execute("""
            INSERT INTO gpkg_spatial_ref_sys VALUES (
                'WGS 84', 4326, 'EPSG', 4326,
                'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]',
                'World Geodetic System 1984'
            );
        """)

        # gpkg_contents
        cur.execute("""
            CREATE TABLE gpkg_contents (
                table_name TEXT NOT NULL PRIMARY KEY,
                data_type TEXT NOT NULL,
                identifier TEXT UNIQUE,
                description TEXT DEFAULT '',
                last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
                min_x REAL, min_y REAL, max_x REAL, max_y REAL,
                srs_id INTEGER,
                CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id)
            );
        """)

        # gpkg_geometry_columns
        cur.execute("""
            CREATE TABLE gpkg_geometry_columns (
                table_name TEXT NOT NULL,
                column_name TEXT NOT NULL,
                geometry_type_name TEXT NOT NULL,
                srs_id INTEGER NOT NULL,
                z TINYINT NOT NULL,
                m TINYINT NOT NULL,
                CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name),
                CONSTRAINT fk_gc_tn FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name),
                CONSTRAINT fk_gc_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id)
            );
        """)

        # User parcels table
        cur.execute(f"""
            CREATE TABLE {table_name} (
                fid INTEGER PRIMARY KEY AUTOINCREMENT,
                geom BLOB,
                parcel_id TEXT,
                survey_number TEXT,
                ward TEXT,
                zone TEXT,
                area_m2 REAL,
                perimeter_m REAL,
                confidence REAL,
                status TEXT,
                topology_status TEXT,
                conflict_type TEXT
            );
        """)

        cur.execute(f"""
            INSERT INTO gpkg_contents (table_name, data_type, identifier, srs_id)
            VALUES ('{table_name}', 'features', '{table_name}', 4326);
        """)

        cur.execute(f"""
            INSERT INTO gpkg_geometry_columns VALUES (
                '{table_name}', 'geom', 'POLYGON', 4326, 0, 0
            );
        """)

        for p in parcels:
            coords = p.get("geo_coords", [])
            if len(coords) < 3:
                continue
            if coords[0] != coords[-1]:
                coords = coords + [coords[0]]

            poly = Polygon(coords)
            if not poly.is_valid:
                poly = poly.buffer(0)

            # GPB header: magic 0x4750, version 0, flags 1 (little-endian, empty envelope), srs_id 4326
            header = b"GP\x00\x01" + struct.pack("<i", 4326)
            geom_blob = header + wkb.dumps(poly, hex=False)

            cur.execute(f"""
                INSERT INTO {table_name} (
                    geom, parcel_id, survey_number, ward, zone, area_m2, perimeter_m, confidence, status, topology_status, conflict_type
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                geom_blob,
                p.get("id", ""),
                p.get("surveyNumber", p.get("survey_number", "")),
                p.get("ward", "Ward 01"),
                p.get("zone", "Zone 01"),
                round(float(p.get("aiArea", p.get("area_m2", 0.0))), 2),
                round(float(p.get("perimeter", 0.0)), 2),
                round(float(p.get("confidence", 0.0)), 1),
                p.get("status", "ai_preliminary"),
                p.get("topologyStatus", "valid"),
                p.get("conflictType", "none"),
            ))

        conn.commit()
        conn.close()

        with open(gpkg_path, "rb") as f:
            data = f.read()

        return data
    finally:
        if os.path.exists(gpkg_path):
            try:
                os.remove(gpkg_path)
            except Exception:
                pass


def export_to_geojson(parcels: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Generates standard GeoJSON FeatureCollection."""
    features = []
    for p in parcels:
        coords = p.get("geo_coords", [])
        if len(coords) < 3:
            continue
        if coords[0] != coords[-1]:
            coords = coords + [coords[0]]

        features.append({
            "type": "Feature",
            "id": p.get("id"),
            "geometry": {
                "type": "Polygon",
                "coordinates": [coords],
            },
            "properties": {
                "id": p.get("id"),
                "survey_num": p.get("surveyNumber", p.get("survey_number", "")),
                "ward": p.get("ward", ""),
                "zone": p.get("zone", ""),
                "area_m2": round(float(p.get("aiArea", p.get("area_m2", 0.0))), 2),
                "perimeter_m": round(float(p.get("perimeter", 0.0)), 2),
                "confidence": round(float(p.get("confidence", 0.0)), 1),
                "status": p.get("status", "ai_preliminary"),
                "topology": p.get("topologyStatus", "valid"),
                "conflict": p.get("conflictType") or "none",
            },
        })

    return {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "features": features,
    }


def export_to_shapefile_zip(parcels: List[Dict[str, Any]], base_name: str = "cadastral_parcels") -> bytes:
    """
    Builds an ESRI Shapefile using pyshp and returns an in-memory ZIP archive
    containing .shp, .shx, .dbf, and .prj.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        shp_base = os.path.join(tmpdir, base_name)

        with shapefile.Writer(shp_base, shapeType=shapefile.POLYGON) as w:
            # Fields (max 10 chars per DBF standard)
            w.field("ID", "C", size=16)
            w.field("SURVEY_NO", "C", size=24)
            w.field("WARD", "C", size=16)
            w.field("ZONE", "C", size=16)
            w.field("AREA_M2", "N", decimal=2)
            w.field("PERIM_M", "N", decimal=2)
            w.field("CONF_PCT", "N", decimal=1)
            w.field("STATUS", "C", size=20)
            w.field("TOPOLOGY", "C", size=16)

            for p in parcels:
                coords = p.get("geo_coords", [])
                if len(coords) < 3:
                    continue
                # Ensure polygon ring
                ring = [[float(pt[0]), float(pt[1])] for pt in coords]
                if ring[0] != ring[-1]:
                    ring.append(ring[0])

                w.poly([ring])
                w.record(
                    ID=str(p.get("id", ""))[:16],
                    SURVEY_NO=str(p.get("surveyNumber", p.get("survey_number", "")))[:24],
                    WARD=str(p.get("ward", "Ward 01"))[:16],
                    ZONE=str(p.get("zone", "Zone 04"))[:16],
                    AREA_M2=round(float(p.get("aiArea", p.get("area_m2", 0.0))), 2),
                    PERIM_M=round(float(p.get("perimeter", 0.0)), 2),
                    CONF_PCT=round(float(p.get("confidence", 0.0)), 1),
                    STATUS=str(p.get("status", "ai_preliminary"))[:20],
                    TOPOLOGY=str(p.get("topologyStatus", "valid"))[:16],
                )

        # Write .prj companion file
        with open(f"{shp_base}.prj", "w", encoding="utf-8") as prj_f:
            prj_f.write(WGS84_PRJ)

        # Pack into ZIP bytes
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for ext in [".shp", ".shx", ".dbf", ".prj"]:
                fpath = f"{shp_base}{ext}"
                if os.path.exists(fpath):
                    zf.write(fpath, arcname=f"{base_name}{ext}")

        zip_buffer.seek(0)
        return zip_buffer.getvalue()


def export_to_kml(parcels: List[Dict[str, Any]], title: str = "CadastraAI Parcels") -> str:
    """Generates KML document for Google Earth visualization."""
    placemarks = []
    for p in parcels:
        pid = p.get("id", "PARCEL")
        snum = p.get("surveyNumber", p.get("survey_number", pid))
        area = round(float(p.get("aiArea", p.get("area_m2", 0.0))), 1)
        conf = round(float(p.get("confidence", 0.0)), 1)
        status = p.get("status", "ai_preliminary")

        coords = p.get("geo_coords", [])
        if len(coords) < 3:
            continue
        if coords[0] != coords[-1]:
            coords = coords + [coords[0]]

        coord_str = " ".join([f"{pt[0]},{pt[1]},0" for pt in coords])

        pm = f"""    <Placemark>
      <name>{snum}</name>
      <description><![CDATA[
        <b>Parcel ID:</b> {pid}<br/>
        <b>Area:</b> {area} m²<br/>
        <b>Confidence:</b> {conf}%<br/>
        <b>Status:</b> {status}
      ]]></description>
      <Style>
        <LineStyle><color>ff0000ff</color><width>2</width></LineStyle>
        <PolyStyle><color>330000ff</color></PolyStyle>
      </Style>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>{coord_str}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>"""
        placemarks.append(pm)

    kml = f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>{title}</name>
    <description>Extracted Cadastral Boundaries from CadastraAI Survey Platform</description>
{chr(10).join(placemarks)}
  </Document>
</kml>"""
    return kml


def export_to_dxf(parcels: List[Dict[str, Any]]) -> str:
    """
    Generates standard ASCII DXF format containing 2D lightweight polylines (LWPOLYLINE).
    Opens natively in AutoCAD, Civil 3D, and QGIS.
    """
    dxf_lines = [
        "0", "SECTION",
        "2", "HEADER",
        "9", "$ACADVER",
        "1", "AC1015",  # AutoCAD 2000 format
        "0", "ENDSEC",
        "0", "SECTION",
        "2", "TABLES",
        "0", "TABLE",
        "2", "LAYER",
        "70", "1",
        "0", "LAYER",
        "2", "CADASTRAL_PARCELS",
        "70", "0",
        "62", "1",  # Color Red
        "6", "CONTINUOUS",
        "0", "ENDTAB",
        "0", "ENDSEC",
        "0", "SECTION",
        "2", "ENTITIES",
    ]

    for p in parcels:
        coords = p.get("geo_coords", [])
        if len(coords) < 3:
            continue

        n_pts = len(coords)
        dxf_lines.extend([
            "0", "LWPOLYLINE",
            "5", f"{hash(p.get('id', 'P')) & 0xFFFF:X}",
            "100", "AcDbEntity",
            "8", "CADASTRAL_PARCELS",
            "100", "AcDbPolyline",
            "90", str(n_pts),
            "70", "1",  # Closed polyline
        ])

        for pt in coords:
            dxf_lines.extend([
                "10", str(pt[0]),  # X / Lng
                "20", str(pt[1]),  # Y / Lat
            ])

    dxf_lines.extend([
        "0", "ENDSEC",
        "0", "EOF",
    ])

    return "\n".join(dxf_lines)


def generate_cadastral_pdf_report(
    project_meta: Dict[str, Any],
    parcels: List[Dict[str, Any]],
    topology_summary: Optional[Dict[str, Any]] = None,
    gnss_summary: Optional[Dict[str, Any]] = None,
    gt_summary: Optional[Dict[str, Any]] = None,
) -> bytes:
    """
    Generates an official Survey Preparation and Verification PDF Report.
    Includes project metadata, GNSS survey precision, topology validation,
    parcel register table, and statutory disclaimer.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Heading1"],
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#0f172a"),
        fontName="Helvetica-Bold",
        alignment=1,
    )
    subtitle_style = ParagraphStyle(
        "ReportSubtitle",
        parent=styles["Normal"],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#475569"),
        alignment=1,
    )
    h2_style = ParagraphStyle(
        "SectionHeading",
        parent=styles["Heading2"],
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#1e293b"),
        fontName="Helvetica-Bold",
        spaceBefore=12,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "ReportBody",
        parent=styles["Normal"],
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#334155"),
    )
    legal_style = ParagraphStyle(
        "LegalNotice",
        parent=styles["Normal"],
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#64748b"),
        fontName="Helvetica-Oblique",
    )

    story = []

    # 1. Header & Title
    story.append(Paragraph("CADASTRAL ANALYSIS & SURVEY PREPARATION REPORT", title_style))
    story.append(Spacer(1, 4))
    story.append(Paragraph("Pre-Survey / Planning / Re-survey Aid. Not a final legal record without surveyor signoff.", subtitle_style))
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#2563eb"), spaceBefore=2, spaceAfter=10))

    # 2. Project Metadata
    proj_id = project_meta.get("id", "PRJ-UNASSIGNED")
    proj_name = project_meta.get("name", "Cadastral Survey Project")
    area_name = project_meta.get("survey_area", "Unassigned Sector")
    date_str = project_meta.get("survey_date", datetime.utcnow().strftime("%Y-%m-%d"))

    meta_data = [
        [
            Paragraph("<b>Project ID:</b>", body_style), Paragraph(proj_id, body_style),
            Paragraph("<b>Survey Date:</b>", body_style), Paragraph(date_str, body_style),
        ],
        [
            Paragraph("<b>Project Name:</b>", body_style), Paragraph(proj_name, body_style),
            Paragraph("<b>GSD Resolution:</b>", body_style), Paragraph("0.05 m / px (5 cm)", body_style),
        ],
        [
            Paragraph("<b>Survey Area:</b>", body_style), Paragraph(area_name, body_style),
            Paragraph("<b>CRS:</b>", body_style), Paragraph("EPSG:4326 (WGS 84)", body_style),
        ],
    ]
    meta_table = Table(meta_data, colWidths=[100, 160, 100, 160])
    meta_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#cbd5e1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("PADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 10))

    # 3. Quality, Survey Precision & Topology Metrics
    story.append(Paragraph("SURVEY ACCURACY & INTEGRITY SUMMARY", h2_style))

    total_parcels = len(parcels)
    total_area_m2 = sum(p.get("aiArea", p.get("area_m2", 0.0)) for p in parcels)
    avg_conf = round(sum(p.get("confidence", 0.0) for p in parcels) / max(1, total_parcels), 1)

    rmse_str = f"{gnss_summary.get('rmse_meters', 0.0):.3f} m" if gnss_summary and gnss_summary.get("has_gnss") else "N/A (No GNSS Points Uploaded)"
    top_errors = topology_summary.get("total_topology_errors", 0) if topology_summary else 0
    gt_iou_str = f"{gt_summary.get('mean_iou', 0.0):.3f}" if gt_summary and gt_summary.get("has_ground_truth") else "N/A (No GT uploaded)"

    kpi_data = [
        [
            Paragraph("<b>Total Parcels:</b>", body_style), Paragraph(str(total_parcels), body_style),
            Paragraph("<b>Total Surveyed Area:</b>", body_style), Paragraph(f"{total_area_m2:,.1f} m²", body_style),
        ],
        [
            Paragraph("<b>Mean Confidence:</b>", body_style), Paragraph(f"{avg_conf}%", body_style),
            Paragraph("<b>GNSS Control RMSE:</b>", body_style), Paragraph(f"<b>{rmse_str}</b>", body_style),
        ],
        [
            Paragraph("<b>Topology Errors:</b>", body_style), Paragraph(f"{top_errors} issues", body_style),
            Paragraph("<b>Ground Truth IoU:</b>", body_style), Paragraph(gt_iou_str, body_style),
        ],
    ]
    kpi_table = Table(kpi_data, colWidths=[110, 150, 110, 150])
    kpi_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f1f5f9")),
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#94a3b8")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("PADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 10))

    # 4. Parcel Register Table (First 15 parcels)
    story.append(Paragraph(f"PARCEL REGISTER (SAMPLE RECORD - TOP {min(15, total_parcels)} OF {total_parcels})", h2_style))

    reg_headers = ["Parcel ID", "Survey No", "Ward / Zone", "Area (m²)", "Perimeter (m)", "Confidence", "Status"]
    reg_rows = [[Paragraph(f"<b>{h}</b>", body_style) for h in reg_headers]]

    for p in parcels[:15]:
        pid = p.get("id", "")
        snum = p.get("surveyNumber", p.get("survey_number", ""))
        w_z = f"{p.get('ward', 'Ward 01')} / {p.get('zone', 'Zone 04')}"
        area = f"{p.get('aiArea', p.get('area_m2', 0.0)):,.1f}"
        perim = f"{p.get('perimeter', 0.0):,.1f}"
        conf = f"{p.get('confidence', 0.0):.1f}%"
        stat = p.get("status", "ai_preliminary")

        reg_rows.append([
            Paragraph(pid, body_style),
            Paragraph(snum, body_style),
            Paragraph(w_z, body_style),
            Paragraph(area, body_style),
            Paragraph(perim, body_style),
            Paragraph(conf, body_style),
            Paragraph(stat, body_style),
        ])

    reg_table = Table(reg_rows, colWidths=[70, 75, 110, 75, 70, 65, 55])
    reg_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("PADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(reg_table)
    story.append(Spacer(1, 14))

    # 5. Survey-Support Disclaimer & Surveyor Certification
    story.append(Paragraph("PRELIMINARY SURVEY-SUPPORT DISCLAIMER & VERIFICATION", h2_style))
    disclaimer_text = (
        "<b>LEGAL NOTICE:</b> This document constitutes an AI-assisted preliminary cadastral/survey-support result "
        "requiring authorized verification. It does NOT constitute a legally admissible or statutory cadastral record on its own. "
        "All AI-assisted boundary delineations, elevation models, and conflict classifications must undergo mandatory "
        "authorized ground-truthing, physical ETS/DGPS field verification, and statutory certification by an authorized Competent "
        "Survey Authority under the applicable Land Revenue Act prior to mutation, registration, or title deed modification."
    )
    story.append(Paragraph(disclaimer_text, legal_style))
    story.append(Spacer(1, 20))

    # Sign-off boxes
    sign_data = [
        [
            Paragraph("<b>Prepared By:</b><br/><br/><br/>_______________________________<br/>AI GIS Processing Specialist", body_style),
            Paragraph("<b>Field Verification By:</b><br/><br/><br/>_______________________________<br/>Licensed Cadastral Surveyor", body_style),
            Paragraph("<b>Approved By:</b><br/><br/><br/>_______________________________<br/>Competent Revenue Authority", body_style),
        ]
    ]
    sign_table = Table(sign_data, colWidths=[170, 170, 180])
    sign_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#94a3b8")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("PADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(KeepTogether([sign_table]))

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()
