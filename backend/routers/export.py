"""
Export, Ground Truth Validation & Surveyor Verification Router for CadastraAI.
Provides:
  - Multi-format GIS exports: GeoJSON, ESRI Shapefile (.zip), KML, DXF, Official Survey PDF Report.
  - GNSS/CORS control points evaluation (RMSE, boundary distance, tolerance).
  - Ground truth comparison (IoU, Hausdorff distance, centroid displacement).
  - Official surveyor verification workflow (verify, correct, reject, audit trail).
"""

import os
import json
import logging
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.db_models import SurveyProject, Parcel as DBParcel, GNSSControlPoint, Verification
from backend.services.export_service import (
    export_to_geojson,
    export_to_shapefile_zip,
    export_to_kml,
    export_to_dxf,
    generate_cadastral_pdf_report,
)
from backend.services.survey_validation_service import (
    validate_against_ground_truth,
    validate_against_gnss_control_points,
    parse_gnss_csv,
    update_parcel_survey_status,
)
from backend.routers.projects import PROJECT_STAGES, STORAGE_ROOT

logger = logging.getLogger("cadastra.export_router")

router = APIRouter(prefix="/api/projects", tags=["Export & Survey Verification"])


class VerificationPayload(BaseModel):
    action: str  # 'verify' | 'correct' | 'reject' | 'mark_review'
    surveyor_name: str = "Licensed Surveyor"
    notes: str = ""
    checklist: Optional[Dict[str, bool]] = None
    corrected_coords: Optional[List[List[float]]] = None


def get_parcels_for_project(project_id: str, db: Session) -> List[Dict[str, Any]]:
    """Retrieves parcel records for a project either from memory stage cache or DB."""
    # 1. Check live results cache
    stage_info = PROJECT_STAGES.get(project_id)
    if stage_info and "results" in stage_info:
        res = stage_info["results"]
        if "raw_parcels" in res and res["raw_parcels"]:
            return res["raw_parcels"]

    # 2. Query DB
    db_parcels = db.query(DBParcel).filter(DBParcel.project_id == project_id).all()
    parcels = []
    for p in db_parcels:
        # Prefer corrected geometry if surveyor edited it, else active/ai geometry
        geo_str = p.corrected_geometry_json or p.current_geometry_json or p.ai_geometry_json
        try:
            coords = json.loads(geo_str) if geo_str else []
        except Exception:
            coords = []

        parcels.append({
            "id": p.id,
            "surveyNumber": p.survey_number,
            "ward": p.ward,
            "zone": p.zone,
            "geo_coords": coords,
            "aiArea": p.ai_area,
            "existingArea": p.existing_area,
            "perimeter": p.perimeter,
            "confidence": p.confidence,
            "status": p.status,
            "topologyStatus": p.topology_status,
            "conflictType": p.conflict_type,
            "notes": p.notes,
        })
    return parcels


@router.get("/{project_id}/export/geojson")
def export_geojson(project_id: str, db: Session = Depends(get_db)):
    """Exports cadastral parcels as standard EPSG:4326 GeoJSON FeatureCollection."""
    parcels = get_parcels_for_project(project_id, db)
    if not parcels:
        raise HTTPException(status_code=404, detail="No parcel boundaries found for this project.")

    fc = export_to_geojson(parcels)
    return fc


@router.get("/{project_id}/export/shapefile")
def export_shapefile(project_id: str, db: Session = Depends(get_db)):
    """Generates and downloads an ESRI Shapefile bundle (.zip with .shp, .shx, .dbf, .prj)."""
    parcels = get_parcels_for_project(project_id, db)
    if not parcels:
        raise HTTPException(status_code=404, detail="No parcel boundaries found to generate shapefile.")

    zip_bytes = export_to_shapefile_zip(parcels, base_name=f"cadastral_{project_id.replace('-', '_')}")
    filename = f"cadastral_parcels_{project_id}.zip"

    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{project_id}/export/kml")
def export_kml(project_id: str, db: Session = Depends(get_db)):
    """Exports cadastral boundaries as Google Earth KML."""
    parcels = get_parcels_for_project(project_id, db)
    if not parcels:
        raise HTTPException(status_code=404, detail="No parcels found to export as KML.")

    kml_content = export_to_kml(parcels, title=f"CadastraAI - {project_id}")
    filename = f"cadastral_parcels_{project_id}.kml"

    return Response(
        content=kml_content,
        media_type="application/vnd.google-earth.kml+xml",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{project_id}/export/dxf")
def export_dxf(project_id: str, db: Session = Depends(get_db)):
    """Exports parcel boundaries as standard AutoCAD DXF file."""
    parcels = get_parcels_for_project(project_id, db)
    if not parcels:
        raise HTTPException(status_code=404, detail="No parcels found to export as DXF.")

    dxf_content = export_to_dxf(parcels)
    filename = f"cadastral_parcels_{project_id}.dxf"

    return Response(
        content=dxf_content,
        media_type="application/dxf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{project_id}/export/pdf")
def export_pdf(project_id: str, db: Session = Depends(get_db)):
    """Generates official Cadastral AI Survey Preparation & Quality Verification PDF Report."""
    parcels = get_parcels_for_project(project_id, db)
    if not parcels:
        raise HTTPException(status_code=404, detail="No parcel boundaries found to generate PDF report.")

    proj = db.query(SurveyProject).filter(SurveyProject.id == project_id).first()
    project_meta = {
        "id": project_id,
        "name": proj.name if proj else f"Survey Project {project_id}",
        "survey_area": proj.survey_area if proj else "Zone 04, Jaipur",
        "survey_date": proj.survey_date if proj else None,
    }

    # Retrieve GNSS summary if available
    gnss_points = db.query(GNSSControlPoint).filter(GNSSControlPoint.project_id == project_id).all()
    gnss_pts_data = [
        {"latitude": g.latitude, "longitude": g.longitude, "elevation_m": g.elevation_m}
        for g in gnss_points
    ]
    _, gnss_summary = validate_against_gnss_control_points(parcels, gnss_pts_data) if gnss_pts_data else ([], {})

    pdf_bytes = generate_cadastral_pdf_report(
        project_meta=project_meta,
        parcels=parcels,
        gnss_summary=gnss_summary,
    )
    filename = f"cadastral_report_{project_id}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{project_id}/parcels/{parcel_id}/verify")
def verify_parcel(
    project_id: str,
    parcel_id: str,
    payload: VerificationPayload,
    db: Session = Depends(get_db),
):
    """
    Surveyor verification workflow:
    Accepts 'verify', 'correct', 'reject', or 'mark_review'.
    Preserves raw AI boundary in ai_geometry_json while recording corrected geometry in corrected_geometry_json.
    """
    result = update_parcel_survey_status(
        parcel_id=parcel_id,
        action=payload.action,
        surveyor_name=payload.surveyor_name,
        corrected_coords=payload.corrected_coords,
        notes=payload.notes,
        checklist=payload.checklist,
        db=db,
    )

    # Update cache if project is in memory
    stage_info = PROJECT_STAGES.get(project_id)
    if stage_info and "results" in stage_info:
        raw_p = stage_info["results"].get("raw_parcels", [])
        for p in raw_p:
            if p["id"] == parcel_id:
                p["status"] = result["new_status"]
                if payload.action == "correct" and payload.corrected_coords:
                    p["geo_coords"] = payload.corrected_coords
                break

    return {
        "status": "success",
        "message": f"Parcel {parcel_id} successfully updated to '{result['new_status']}'",
        "verification": result,
    }


@router.post("/{project_id}/validate/gnss")
def validate_gnss(
    project_id: str,
    file: Optional[UploadFile] = File(None),
    tolerance_threshold_m: float = Form(0.30),
    db: Session = Depends(get_db),
):
    """
    Calculates survey precision (RMSE, mean/max error) against GNSS / CORS control points.
    Accepts CSV upload or reads existing gnss_cors/ directory.
    """
    parcels = get_parcels_for_project(project_id, db)
    if not parcels:
        raise HTTPException(status_code=400, detail="No parcel boundaries available for validation.")

    points = []
    if file:
        import tempfile
        contents = file.file.read().decode("utf-8-sig", errors="ignore")
        with tempfile.NamedTemporaryFile("w", delete=False, suffix=".csv") as tmp:
            tmp.write(contents)
            tmp_path = tmp.name
        points = parse_gnss_csv(tmp_path)
        try:
            os.remove(tmp_path)
        except Exception:
            pass
    else:
        # Check project folder
        gnss_dir = os.path.join(STORAGE_ROOT, project_id, "gnss_cors")
        if os.path.exists(gnss_dir):
            for fname in os.listdir(gnss_dir):
                if fname.lower().endswith(".csv"):
                    points.extend(parse_gnss_csv(os.path.join(gnss_dir, fname)))

    if not points:
        raise HTTPException(status_code=400, detail="No GNSS control points found to validate against.")

    evaluated, summary = validate_against_gnss_control_points(
        ai_parcels=parcels,
        gnss_points=points,
        tolerance_threshold_m=tolerance_threshold_m,
    )

    # Persist GNSS points to DB
    for pt in evaluated:
        gcp = GNSSControlPoint(
            id=f"GCP-{project_id}-{pt['point_id']}",
            project_id=project_id,
            point_id=pt["point_id"],
            latitude=pt["latitude"],
            longitude=pt["longitude"],
            elevation_m=pt["elevation_m"],
            point_type=pt.get("point_type", "CORS_RTK"),
            error_to_boundary_m=pt.get("error_to_boundary_m"),
            nearest_parcel_id=pt.get("nearest_parcel_id"),
            status=pt.get("status", "VALIDATED"),
            description=pt.get("description", ""),
        )
        db.merge(gcp)
    db.commit()

    return {
        "project_id": project_id,
        "summary": summary,
        "control_points": evaluated,
    }
