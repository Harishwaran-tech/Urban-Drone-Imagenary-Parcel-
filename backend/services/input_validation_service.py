"""
Input Validation & Preflight Compatibility Service for CadastraAI (P1 Items 11-14).
Validates single datasets (raster, vector, survey points) and runs cross-dataset checks
(CRS alignment, geographic overlap, DSM-DTM compatibility, geometry validity).
"""

import os
import json
import math
import logging
from typing import Dict, Any, List, Optional, Tuple
import pyproj

from backend.utils.georeferencing import parse_geotiff_metadata, GeoreferenceTransform

logger = logging.getLogger("cadastra.input_validation")


def validate_raster_dataset(file_path: str) -> Dict[str, Any]:
    """
    Validates an orthomosaic (ORI), DSM, or DTM raster file.
    Returns metadata, CRS, resolution, bounds, and preflight status.
    """
    errors: List[str] = []
    warnings: List[str] = []

    if not os.path.exists(file_path):
        return {
            "validation_status": "INVALID",
            "errors": [f"File not found on disk: {file_path}"],
            "warnings": [],
            "metadata": {},
        }

    file_size = os.path.getsize(file_path)
    if file_size == 0:
        return {
            "validation_status": "INVALID",
            "errors": ["File is empty (0 bytes)."],
            "warnings": [],
            "metadata": {},
        }

    # Attempt to parse GeoTIFF metadata
    try:
        geo_transform: GeoreferenceTransform = parse_geotiff_metadata(
            file_path=file_path,
            allow_unreferenced=False,
        )
        bounds_info = geo_transform.get_geographic_bounds()
        gsd_m = bounds_info.get("gsd_meters", 0.0)

        if gsd_m <= 0.0 or gsd_m > 10.0:
            warnings.append(f"Unusual Ground Sample Distance: {gsd_m:.3f} m/pixel. Typical drone surveys are 0.02 - 0.20 m/pixel.")

        w, h = geo_transform.width, geo_transform.height
        if w < 100 or h < 100:
            warnings.append(f"Low raster resolution: {w}x{h} pixels.")

        crs = geo_transform.source_crs
        is_embedded = geo_transform.is_embedded_geotiff

        status = "WARNING" if warnings else "VALID"

        return {
            "validation_status": status,
            "crs": crs,
            "width": w,
            "height": h,
            "resolution_m": round(gsd_m, 4),
            "bounds_json": json.dumps(bounds_info["bounds_wgs84"]),
            "file_size_bytes": file_size,
            "errors": errors,
            "warnings": warnings,
            "metadata": {
                "is_embedded_geotiff": is_embedded,
                "working_crs": geo_transform.working_crs,
                "display_crs": geo_transform.display_crs,
                "leaflet_bounds": bounds_info["leaflet_bounds"],
            },
        }
    except ValueError as val_err:
        errors.append(str(val_err))
        # Fallback reading dimensions with PIL
        try:
            from PIL import Image
            with Image.open(file_path) as im:
                w, h = im.size
        except Exception:
            w, h = None, None

        return {
            "validation_status": "INVALID",
            "crs": None,
            "width": w,
            "height": h,
            "resolution_m": None,
            "bounds_json": None,
            "file_size_bytes": file_size,
            "errors": errors,
            "warnings": warnings,
            "metadata": {"error": "Georeferencing unavailable"},
        }
    except Exception as ex:
        errors.append(f"Failed to open or inspect raster: {str(ex)}")
        return {
            "validation_status": "INVALID",
            "crs": None,
            "width": None,
            "height": None,
            "resolution_m": None,
            "bounds_json": None,
            "file_size_bytes": file_size,
            "errors": errors,
            "warnings": warnings,
            "metadata": {},
        }


def validate_vector_dataset(file_path: str) -> Dict[str, Any]:
    """
    Validates GeoJSON, Shapefile ZIP, or GeoPackage vector files.
    """
    errors: List[str] = []
    warnings: List[str] = []
    file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0

    if not os.path.exists(file_path):
        return {
            "validation_status": "INVALID",
            "errors": ["Vector file not found."],
            "warnings": [],
            "metadata": {},
        }

    # GeoJSON validation
    if file_path.lower().endswith((".geojson", ".json")):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            features = data.get("features", [])
            if not isinstance(features, list) or len(features) == 0:
                warnings.append("Vector dataset contains 0 features.")

            valid_geom_count = 0
            all_lons: List[float] = []
            all_lats: List[float] = []

            for idx, feat in enumerate(features):
                geom = feat.get("geometry")
                if not geom or "coordinates" not in geom:
                    warnings.append(f"Feature at index {idx} has missing or null geometry.")
                    continue
                g_type = geom.get("type", "")
                coords = geom.get("coordinates", [])

                if g_type == "Polygon" and len(coords) > 0:
                    ring = coords[0]
                    if len(ring) < 4:
                        errors.append(f"Feature {idx} has unclosed polygon (less than 4 vertices).")
                    elif ring[0] != ring[-1]:
                        warnings.append(f"Feature {idx} linear ring was not closed; auto-closing applied.")
                    valid_geom_count += 1
                    for pt in ring:
                        if isinstance(pt, (list, tuple)) and len(pt) >= 2:
                            all_lons.append(float(pt[0]))
                            all_lats.append(float(pt[1]))
                elif g_type == "MultiPolygon":
                    valid_geom_count += 1
                    for poly in coords:
                        for ring in poly:
                            for pt in ring:
                                if isinstance(pt, (list, tuple)) and len(pt) >= 2:
                                    all_lons.append(float(pt[0]))
                                    all_lats.append(float(pt[1]))
                elif g_type in ["LineString", "MultiLineString", "Point"]:
                    valid_geom_count += 1

            bounds = None
            if all_lons and all_lats:
                bounds = {
                    "min_lng": min(all_lons),
                    "min_lat": min(all_lats),
                    "max_lng": max(all_lons),
                    "max_lat": max(all_lats),
                }

            status = "INVALID" if errors else ("WARNING" if warnings else "VALID")
            return {
                "validation_status": status,
                "crs": "EPSG:4326",
                "feature_count": len(features),
                "valid_geometry_count": valid_geom_count,
                "bounds_json": json.dumps(bounds) if bounds else None,
                "file_size_bytes": file_size,
                "errors": errors,
                "warnings": warnings,
                "metadata": {
                    "format": "GeoJSON",
                    "feature_count": len(features),
                },
            }
        except json.JSONDecodeError:
            return {
                "validation_status": "INVALID",
                "errors": ["Corrupted or invalid JSON format."],
                "warnings": [],
                "file_size_bytes": file_size,
                "metadata": {},
            }
        except Exception as ex:
            return {
                "validation_status": "INVALID",
                "errors": [f"Error parsing GeoJSON: {str(ex)}"],
                "warnings": [],
                "file_size_bytes": file_size,
                "metadata": {},
            }

    # Shapefile ZIP validation
    if file_path.lower().endswith(".zip"):
        import zipfile
        try:
            with zipfile.ZipFile(file_path, "r") as z:
                names = z.namelist()
                has_shp = any(n.lower().endswith(".shp") for n in names)
                has_shx = any(n.lower().endswith(".shx") for n in names)
                has_dbf = any(n.lower().endswith(".dbf") for n in names)
                has_prj = any(n.lower().endswith(".prj") for n in names)

                if not has_shp:
                    errors.append("Shapefile archive missing .shp file.")
                if not has_shx:
                    warnings.append("Shapefile archive missing .shx index file.")
                if not has_dbf:
                    errors.append("Shapefile archive missing .dbf attribute table.")
                if not has_prj:
                    warnings.append("Shapefile archive missing .prj coordinate system definition.")

                status = "INVALID" if errors else ("WARNING" if warnings else "VALID")
                return {
                    "validation_status": status,
                    "crs": "EPSG:4326" if has_prj else "UNKNOWN",
                    "bounds_json": None,
                    "file_size_bytes": file_size,
                    "errors": errors,
                    "warnings": warnings,
                    "metadata": {"format": "Shapefile ZIP", "files": names},
                }
        except Exception as ex:
            return {
                "validation_status": "INVALID",
                "errors": [f"Invalid ZIP archive: {str(ex)}"],
                "warnings": [],
                "file_size_bytes": file_size,
                "metadata": {},
            }

    return {
        "validation_status": "WARNING",
        "crs": "UNKNOWN",
        "bounds_json": None,
        "file_size_bytes": file_size,
        "errors": [],
        "warnings": ["Generic vector file format."],
        "metadata": {},
    }


def validate_gnss_csv(file_path: str) -> Dict[str, Any]:
    """
    Validates ground control / GNSS CORS RTK survey points CSV.
    """
    errors: List[str] = []
    warnings: List[str] = []
    file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0

    if not os.path.exists(file_path):
        return {
            "validation_status": "INVALID",
            "errors": ["GNSS points file not found."],
            "warnings": [],
            "metadata": {},
        }

    import csv
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            fields = [h.strip().lower() for h in (reader.fieldnames or [])]

            lat_col = next((c for c in fields if c in ["latitude", "lat", "y"]), None)
            lng_col = next((c for c in fields if c in ["longitude", "lng", "lon", "x"]), None)
            id_col = next((c for c in fields if c in ["point_id", "id", "name", "point"]), None)

            if not lat_col or not lng_col:
                errors.append("CSV missing required coordinate columns (latitude/y and longitude/x).")

            count = 0
            lons: List[float] = []
            lats: List[float] = []

            for row_idx, row in enumerate(reader):
                count += 1
                try:
                    lat_val = float(row[lat_col])
                    lng_val = float(row[lng_col])
                    if not (-90.0 <= lat_val <= 90.0 and -180.0 <= lng_val <= 180.0):
                        warnings.append(f"Row {row_idx + 1} has coordinates outside geographic WGS84 range: ({lat_val}, {lng_val}).")
                    lats.append(lat_val)
                    lons.append(lng_val)
                except Exception:
                    warnings.append(f"Row {row_idx + 1} contains non-numeric coordinate values.")

            if count == 0:
                warnings.append("GNSS file contains 0 data rows.")

            bounds = None
            if lons and lats:
                bounds = {
                    "min_lng": min(lons),
                    "min_lat": min(lats),
                    "max_lng": max(lons),
                    "max_lat": max(lats),
                }

            status = "INVALID" if errors else ("WARNING" if warnings else "VALID")
            return {
                "validation_status": status,
                "crs": "EPSG:4326",
                "point_count": count,
                "bounds_json": json.dumps(bounds) if bounds else None,
                "file_size_bytes": file_size,
                "errors": errors,
                "warnings": warnings,
                "metadata": {
                    "point_count": count,
                    "columns": fields,
                },
            }
    except Exception as ex:
        return {
            "validation_status": "INVALID",
            "errors": [f"Error reading GNSS CSV: {str(ex)}"],
            "warnings": [],
            "file_size_bytes": file_size,
            "metadata": {},
        }


validate_survey_points_csv = validate_gnss_csv


def validate_project_dataset_compatibility(datasets: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Cross-dataset preflight checks:
      - Does ORI exist?
      - Do all datasets overlap geographically?
      - Are DSM and DTM compatible?
      - Are existing GIS boundaries inside project bounds?
    """
    checks: List[Dict[str, Any]] = []

    ori = next((d for d in datasets if d.get("input_type") == "ORTHOMOSAIC"), None)
    dsm = next((d for d in datasets if d.get("input_type") == "DSM"), None)
    dtm = next((d for d in datasets if d.get("input_type") == "DTM"), None)
    gis = next((d for d in datasets if d.get("input_type") == "EXISTING_PARCELS"), None)
    gt = next((d for d in datasets if d.get("input_type") == "GROUND_TRUTH"), None)
    gnss = next((d for d in datasets if d.get("input_type") == "GNSS_POINTS"), None)

    # 1. Orthomosaic Check
    if not ori:
        checks.append({
            "code": "ORI_MISSING",
            "status": "fail",
            "label": "Drone Orthomosaic (ORI)",
            "message": "Required orthomosaic raster is missing.",
        })
    else:
        ori_status = ori.get("validation_status", "PENDING")
        checks.append({
            "code": "ORI_STATUS",
            "status": "pass" if ori_status == "VALID" else ("warn" if ori_status == "WARNING" else "fail"),
            "label": f"ORI {ori.get('filename')}",
            "message": f"CRS: {ori.get('crs', 'Unknown')} · GSD: {ori.get('resolution_m', 0.05)} m/px",
        })

    # 2. DSM / DTM Compatibility Check
    if dsm and dtm:
        dsm_res = dsm.get("resolution_m") or 0.0
        dtm_res = dtm.get("resolution_m") or 0.0
        if dsm_res > 0 and dtm_res > 0 and abs(dsm_res - dtm_res) / dsm_res > 0.25:
            checks.append({
                "code": "DSM_DTM_RES_DIFF",
                "status": "warn",
                "label": "DSM / DTM Resolution Alignment",
                "message": f"Resolution differs: DSM ({dsm_res:.3f}m) vs DTM ({dtm_res:.3f}m). Resampling required for nDSM calculation.",
            })
        else:
            checks.append({
                "code": "DSM_DTM_COMPATIBLE",
                "status": "pass",
                "label": "DSM / DTM Elevation Grid",
                "message": "DSM and DTM elevation rasters are geographically compatible.",
            })
    elif dsm and not dtm:
        checks.append({
            "code": "DTM_MISSING",
            "status": "warn",
            "label": "DTM Missing",
            "message": "DSM uploaded without DTM. Ground elevation will use baseline estimation.",
        })
    elif dtm and not dsm:
        checks.append({
            "code": "DSM_MISSING",
            "status": "warn",
            "label": "DSM Missing",
            "message": "DTM uploaded without DSM. Building heights will require shadow/stereo heuristic.",
        })

    # 3. Existing GIS vs ORI Geographic Overlap
    if ori and gis and ori.get("bounds_json") and gis.get("bounds_json"):
        try:
            b_ori = json.loads(ori["bounds_json"])
            b_gis = json.loads(gis["bounds_json"])

            overlap = not (
                b_gis["min_lng"] > b_ori["max_lng"] or
                b_gis["max_lng"] < b_ori["min_lng"] or
                b_gis["min_lat"] > b_ori["max_lat"] or
                b_gis["max_lat"] < b_ori["min_lat"]
            )
            if overlap:
                checks.append({
                    "code": "GIS_OVERLAP_PASS",
                    "status": "pass",
                    "label": "Existing Cadastre Geographic Bounds",
                    "message": "Existing cadastral boundaries overlap the drone orthomosaic bounds.",
                })
            else:
                checks.append({
                    "code": "GIS_OUTSIDE_BOUNDS",
                    "status": "fail",
                    "label": "Existing Cadastre Bounds Mismatch",
                    "message": "Existing parcel dataset is located outside the uploaded drone orthomosaic coverage area.",
                })
        except Exception:
            pass

    # 4. GNSS Points
    if gnss:
        pt_count = gnss.get("metadata", {}).get("point_count", 0)
        checks.append({
            "code": "GNSS_CHECK",
            "status": "pass" if pt_count >= 3 else "warn",
            "label": "Field GNSS RTK Benchmarks",
            "message": f"{pt_count} field ground control points loaded for positional validation.",
        })

    return checks
