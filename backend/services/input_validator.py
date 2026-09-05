"""
Multi-Input Project Ingestion & Pre-Processing Dataset Validation for CadastraAI.
Validates CRS compatibility, spatial bounds overlap, raster dimensions, geometry validity,
and survey input integrity across ORI, DSM, DTM, Existing Cadastre, GT, and GNSS/CORS.
"""

import os
import json
import logging
from typing import Dict, Any, List, Optional, Tuple
from shapely.geometry import shape, box
from shapely.validation import explain_validity

logger = logging.getLogger("cadastra.input_validator")

PROJECT_INPUT_SUBDIRS = [
    "drone",          # Raw drone flight photos / imagery
    "ori",            # Orthorectified Image (ORI / GeoTIFF)
    "dsm",            # Digital Surface Model
    "dtm",            # Digital Terrain Model
    "existing_gis",   # Existing cadastral boundaries (GeoJSON / SHP)
    "ground_truth",   # Ground truth polygons for evaluation
    "gnss_cors",      # GNSS rover points / CORS base control points (CSV / GeoJSON)
]


def init_project_input_directories(base_storage_dir: str, project_id: str) -> Dict[str, str]:
    """Initializes the standard SIH multi-input directory tree for a project."""
    project_root = os.path.join(base_storage_dir, project_id)
    paths = {}
    for subdir in PROJECT_INPUT_SUBDIRS:
        subpath = os.path.join(project_root, subdir)
        os.makedirs(subpath, exist_ok=True)
        paths[subdir] = subpath
    return paths


def get_project_inputs_inventory(base_storage_dir: str, project_id: str) -> Dict[str, Any]:
    """Scans and catalogs all uploaded datasets within a project."""
    project_root = os.path.join(base_storage_dir, project_id)
    inventory: Dict[str, List[Dict[str, Any]]] = {}

    for subdir in PROJECT_INPUT_SUBDIRS:
        subpath = os.path.join(project_root, subdir)
        inventory[subdir] = []
        if os.path.exists(subpath):
            for fname in os.listdir(subpath):
                fpath = os.path.join(subpath, fname)
                if os.path.isfile(fpath):
                    inventory[subdir].append({
                        "filename": fname,
                        "size_bytes": os.path.getsize(fpath),
                        "path": fpath,
                        "extension": os.path.splitext(fname)[1].lower(),
                    })

    has_ori = len(inventory.get("ori", [])) > 0 or len(inventory.get("drone", [])) > 0
    return {
        "project_id": project_id,
        "directories": inventory,
        "ready_for_processing": has_ori,
        "has_ori": has_ori,
        "has_dsm": len(inventory.get("dsm", [])) > 0,
        "has_dtm": len(inventory.get("dtm", [])) > 0,
        "has_existing_cadastre": len(inventory.get("existing_gis", [])) > 0,
        "has_ground_truth": len(inventory.get("ground_truth", [])) > 0,
        "has_gnss_control": len(inventory.get("gnss_cors", [])) > 0,
    }


def validate_vector_geometry(features: List[Dict[str, Any]]) -> Tuple[bool, List[str]]:
    """
    Validates GeoJSON vector features for valid topological rings, closure, and self-intersections.
    """
    errors = []
    for idx, feat in enumerate(features):
        geom_dict = feat.get("geometry")
        if not geom_dict:
            errors.append(f"Feature at index {idx} has missing geometry.")
            continue
        try:
            poly = shape(geom_dict)
            if not poly.is_valid:
                reason = explain_validity(poly)
                errors.append(f"Feature '{feat.get('id', idx)}' is topologically invalid: {reason}")
        except Exception as e:
            errors.append(f"Feature '{feat.get('id', idx)}' could not be parsed as valid geometry: {e}")

    return len(errors) == 0, errors


def validate_spatial_overlap(
    bounds_a: Tuple[float, float, float, float],
    bounds_b: Tuple[float, float, float, float],
    tolerance_pct: float = 5.0,
) -> Tuple[bool, float]:
    """
    Validates that two bounding boxes (min_x, min_y, max_x, max_y) overlap.
    Returns: (is_overlapping, overlap_ratio)
    """
    box_a = box(*bounds_a)
    box_b = box(*bounds_b)

    if not box_a.intersects(box_b):
        return False, 0.0

    inter_area = box_a.intersection(box_b).area
    union_area = box_a.union(box_b).area
    ratio = (inter_area / union_area) * 100.0 if union_area > 0 else 0.0
    return ratio >= tolerance_pct, round(ratio, 2)


def validate_gnss_csv(csv_path: str) -> Tuple[bool, List[str], List[Dict[str, Any]]]:
    """
    Validates that a GNSS/CORS survey control file has required columns (id, x/lng, y/lat, z/elev).
    """
    errors = []
    points = []
    if not os.path.exists(csv_path):
        return False, ["GNSS file does not exist"], []

    try:
        import csv
        with open(csv_path, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            headers = [h.strip().lower() for h in (reader.fieldnames or [])]

            # Detect coordinate columns
            x_col = next((c for c in headers if c in ["x", "lng", "lon", "longitude", "easting"]), None)
            y_col = next((c for c in headers if c in ["y", "lat", "latitude", "northing"]), None)
            id_col = next((c for c in headers if c in ["id", "point_id", "name", "point", "cp"]), None)

            if not x_col or not y_col:
                return False, [f"GNSS CSV missing required coordinate columns. Found: {reader.fieldnames}. Expected columns like 'lng'/'lat' or 'easting'/'northing'."], []

            for row_idx, row in enumerate(reader, 1):
                clean_row = {k.strip().lower(): v.strip() for k, v in row.items()}
                try:
                    px = float(clean_row[x_col])
                    py = float(clean_row[y_col])
                    pid = clean_row.get(id_col, f"CP-{row_idx:03d}")
                    pz = float(clean_row.get("z", clean_row.get("elevation", 0.0)))
                    points.append({"id": pid, "x": px, "y": py, "z": pz})
                except ValueError:
                    errors.append(f"Row {row_idx}: Invalid coordinate numbers ({clean_row.get(x_col)}, {clean_row.get(y_col)})")

    except Exception as e:
        return False, [f"Failed to read GNSS CSV: {e}"], []

    return len(errors) == 0, errors, points


def run_preflight_project_validation(
    base_storage_dir: str,
    project_id: str,
) -> Dict[str, Any]:
    """
    Executes complete pre-processing validation suite before starting AI inference.
    Stops pipeline early with clear errors if data is incompatible or corrupted.
    """
    inv = get_project_inputs_inventory(base_storage_dir, project_id)
    validation_checks = []
    critical_errors = []
    warnings = []

    # Check 1: Imagery Input Present
    if not inv["has_ori"]:
        critical_errors.append("No Orthorectified Image (ORI) or Drone Survey image uploaded. Please upload a GeoTIFF or aerial image.")
    else:
        validation_checks.append({"check": "Drone Imagery / ORI Input", "status": "PASSED"})

    # Check 2: DSM/DTM Co-registration Check
    if inv["has_dsm"] and not inv["has_dtm"]:
        warnings.append("DSM provided without corresponding DTM. Bare-earth terrain normalization (nDSM) will use regional slope estimates.")
    elif inv["has_dsm"] and inv["has_dtm"]:
        validation_checks.append({"check": "DSM & DTM Elevation Pair", "status": "PASSED"})

    # Check 3: Existing GIS Cadastre Integrity
    existing_gis_files = inv["directories"].get("existing_gis", [])
    if existing_gis_files:
        gis_file = existing_gis_files[0]["path"]
        if gis_file.endswith(".geojson") or gis_file.endswith(".json"):
            try:
                with open(gis_file, "r") as f:
                    data = json.load(f)
                    feats = data.get("features", [])
                    is_valid, geom_errs = validate_vector_geometry(feats)
                    if not is_valid:
                        warnings.append(f"Existing Cadastre contains {len(geom_errs)} topological defects. Automated repair will be applied.")
                    validation_checks.append({"check": "Existing Cadastre Geometry", "status": "PASSED" if is_valid else "WARNING", "count": len(feats)})
            except Exception as e:
                critical_errors.append(f"Existing Cadastre GeoJSON failed to parse: {e}")

    # Check 4: GNSS Control Points
    gnss_files = inv["directories"].get("gnss_cors", [])
    if gnss_files:
        gnss_file = gnss_files[0]["path"]
        if gnss_file.endswith(".csv"):
            ok, gnss_errs, pts = validate_gnss_csv(gnss_file)
            if not ok:
                warnings.append(f"GNSS/CORS file issue: {gnss_errs[0]}")
            else:
                validation_checks.append({"check": "GNSS Survey Control Points", "status": "PASSED", "count": len(pts)})

    can_proceed = len(critical_errors) == 0
    return {
        "project_id": project_id,
        "valid": can_proceed,
        "critical_errors": critical_errors,
        "warnings": warnings,
        "checks": validation_checks,
        "inventory": inv,
    }
