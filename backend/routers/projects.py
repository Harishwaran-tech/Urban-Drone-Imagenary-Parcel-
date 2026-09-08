"""
Project Lifecycle, Multi-Input Dataset Ingestion, Preflight Validation,
and Processing Run Management Router for CadastraAI.

Endpoints:
  GET    /api/projects                             - List all survey projects
  POST   /api/projects                             - Create a new survey project
  GET    /api/projects/{id}                        - Get project metadata & dataset overview
  GET    /api/projects/{id}/settings               - Get project validation tolerances
  PATCH  /api/projects/{id}/settings               - Update project validation tolerances
  POST   /api/projects/{id}/datasets               - Ingest input dataset (ORI, DSM, DTM, GIS, GT, GNSS)
  GET    /api/projects/{id}/datasets               - List uploaded datasets with validation status
  POST   /api/projects/{id}/inputs                 - Backward compatible dataset upload
  GET    /api/projects/{id}/inputs                 - Backward compatible dataset inventory
  POST   /api/projects/{id}/validate-inputs        - Run cross-dataset preflight validation
  POST   /api/projects/{id}/process                - Trigger processing run with honest model status
  GET    /api/projects/{id}/status                 - Real-time pipeline stage progress
  GET    /api/projects/{id}/results                - Full analysis outputs and summary metrics
  GET    /api/projects/{id}/parcels                - GeoJSON parcels for project
  GET    /api/projects/{id}/buildings              - GeoJSON buildings with height provenance
  GET    /api/projects/{id}/roads                  - GeoJSON roads
  GET    /api/projects/{id}/issues                 - Topology and conflict issues with suggested repairs
  POST   /api/projects/{id}/issues/{issue_id}/apply-fix - Commit suggested repair geometry
"""

import os
import json
import uuid
import datetime
import logging
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.db_models import (
    SurveyProject,
    ProjectDataset,
    ProcessingRun,
    ProjectValidationSettings,
    Parcel as DBParcel,
    ParcelHistory,
    Building as DBBuilding,
    Road as DBRoad,
    TopologyIssue as DBTopologyIssue,
    Conflict as DBConflict,
    GNSSControlPoint as DBGNSSControlPoint,
    ProjectMember,
    User,
)
from backend.services.auth_service import (
    get_current_user,
    require_role,
    create_audit_log,
)
from backend.services.input_validation_service import (
    validate_raster_dataset,
    validate_vector_dataset,
    validate_survey_points_csv,
    validate_project_dataset_compatibility,
)
from backend.services.project_service import process_survey_pipeline, get_survey_by_id
from backend.services.topology_service import apply_suggested_repair

logger = logging.getLogger("cadastra.projects_api")
router = APIRouter(prefix="/api/projects", tags=["Projects"])

STORAGE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads", "projects"))
os.makedirs(STORAGE_ROOT, exist_ok=True)

# In-memory stage progress cache for asynchronous status polling
PROJECT_STAGES: Dict[str, Dict[str, Any]] = {}

VALID_INPUT_TYPES = {
    "orthomosaic": "ORTHOMOSAIC",
    "ori": "ORTHOMOSAIC",
    "drone_image": "DRONE_IMAGE",
    "drone": "DRONE_IMAGE",
    "dsm": "DSM",
    "dtm": "DTM",
    "existing_parcels": "EXISTING_PARCELS",
    "existing_gis": "EXISTING_PARCELS",
    "cadastre": "EXISTING_PARCELS",
    "ground_truth": "GROUND_TRUTH",
    "gt": "GROUND_TRUTH",
    "gnss_points": "GNSS_POINTS",
    "gnss": "GNSS_POINTS",
    "gnss_cors": "GNSS_POINTS",
}


@router.get("")
def list_projects(db: Session = Depends(get_db)):
    """List all projects in the database with assigned team members."""
    projects = db.query(SurveyProject).order_by(SurveyProject.created_at.desc()).all()
    out = []
    for p in projects:
        ds_count = db.query(ProjectDataset).filter(ProjectDataset.project_id == p.id).count()
        parcel_count = db.query(DBParcel).filter(DBParcel.project_id == p.id).count()

        # Assigned members
        members = db.query(ProjectMember).filter(ProjectMember.project_id == p.id).all()
        analyst = next((m for m in members if m.role == "GIS_ANALYST"), None)
        surveyor = next((m for m in members if m.role == "SURVEYOR"), None)

        analyst_user = db.query(User).filter(User.id == analyst.user_id).first() if analyst else None
        surveyor_user = db.query(User).filter(User.id == surveyor.user_id).first() if surveyor else None

        out.append({
            "id": p.id,
            "name": p.name,
            "survey_area": p.survey_area,
            "district": p.district,
            "state": p.state,
            "survey_date": p.survey_date,
            "status": p.status,
            "progress": p.progress,
            "area_km2": p.area_km2,
            "working_crs": p.working_crs,
            "source_crs": p.source_crs,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "dataset_count": ds_count,
            "parcel_count": parcel_count,
            "assigned_analyst": {
                "user_id": analyst_user.id,
                "name": analyst_user.full_name,
                "email": analyst_user.email,
            } if analyst_user else None,
            "assigned_surveyor": {
                "user_id": surveyor_user.id,
                "name": surveyor_user.full_name,
                "email": surveyor_user.email,
            } if surveyor_user else None,
        })
    return out


@router.post("")
def create_project(
    data: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["ADMIN", "GIS_ANALYST"])),
):
    """Create a new survey project record with initialized validation settings."""
    proj_id = data.get("id") or f"PRJ-{uuid.uuid4().hex[:8].upper()}"
    existing = db.query(SurveyProject).filter(SurveyProject.id == proj_id).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Project with ID '{proj_id}' already exists.")

    project = SurveyProject(
        id=proj_id,
        name=data.get("name", "Cadastral Survey Project"),
        survey_area=data.get("survey_area", "Unassigned Sector"),
        district=data.get("district", ""),
        state=data.get("state", ""),
        survey_date=data.get("survey_date", datetime.date.today().isoformat()),
        status="created",
        progress=0,
        area_km2=float(data.get("area_km2", 0.0)),
        source_crs=data.get("source_crs", "EPSG:4326"),
        working_crs=data.get("working_crs", "EPSG:32643"),
    )
    db.add(project)

    # Initialize default validation settings
    settings = ProjectValidationSettings(
        project_id=proj_id,
        snap_tolerance_m=float(data.get("snap_tolerance_m", 0.15)),
        gnss_tolerance_m=float(data.get("gnss_tolerance_m", 0.30)),
        min_overlap_sqm=float(data.get("min_overlap_sqm", 2.0)),
        min_gap_m=float(data.get("min_gap_m", 0.20)),
        sliver_threshold_sqm=float(data.get("sliver_threshold_sqm", 12.0)),
        boundary_displacement_warning_m=float(data.get("boundary_displacement_warning_m", 0.30)),
    )
    db.add(settings)

    # Automatically assign creating analyst if applicable
    if current_user.role == "GIS_ANALYST":
        member = ProjectMember(
            id=f"MEM-{uuid.uuid4().hex[:8].upper()}",
            project_id=proj_id,
            user_id=current_user.id,
            role="GIS_ANALYST",
            assigned_by=current_user.id,
        )
        db.add(member)

    db.commit()
    db.refresh(project)

    # Create storage directory for project datasets
    proj_dir = os.path.join(STORAGE_ROOT, proj_id)
    os.makedirs(proj_dir, exist_ok=True)

    create_audit_log(
        db=db,
        action="PROJECT_CREATED",
        user=current_user,
        project_id=project.id,
        reason_notes=f"Project '{project.name}' created by {current_user.full_name} ({current_user.role})",
    )

    return {
        "id": project.id,
        "name": project.name,
        "survey_area": project.survey_area,
        "district": project.district,
        "state": project.state,
        "status": project.status,
        "working_crs": project.working_crs,
    }


@router.get("/{project_id}/members")
def get_project_members(project_id: str, db: Session = Depends(get_db)):
    """List assigned team members for this project."""
    members = db.query(ProjectMember).filter(ProjectMember.project_id == project_id).all()
    results = []
    for m in members:
        u = db.query(User).filter(User.id == m.user_id).first()
        results.append({
            "id": m.id,
            "project_id": m.project_id,
            "user_id": m.user_id,
            "name": u.full_name if u else "Unknown",
            "email": u.email if u else "",
            "role": m.role,
            "assigned_at": m.assigned_at.isoformat() if m.assigned_at else None,
            "assigned_by": m.assigned_by,
        })
    return results


@router.post("/{project_id}/assign")
def assign_project_member(
    project_id: str,
    payload: Dict[str, str] = Body(...),
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_role(["ADMIN"])),
):
    """Assign a GIS Analyst or Surveyor to a project (Admin only)."""
    user_id = payload.get("user_id")
    assigned_role = payload.get("role", "").upper().strip()

    if assigned_role not in ["GIS_ANALYST", "SURVEYOR"]:
        raise HTTPException(
            status_code=400,
            detail="Role must be 'GIS_ANALYST' or 'SURVEYOR'",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found.")

    project = db.query(SurveyProject).filter(SurveyProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found.")

    # Remove any previous user assigned to this specific role on this project
    existing_for_role = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.role == assigned_role,
    ).all()
    for e in existing_for_role:
        db.delete(e)

    member = ProjectMember(
        id=f"MEM-{uuid.uuid4().hex[:8].upper()}",
        project_id=project_id,
        user_id=user.id,
        role=assigned_role,
        assigned_by=admin_user.id,
    )
    db.add(member)
    db.commit()

    create_audit_log(
        db=db,
        action="PROJECT_ASSIGNMENT",
        user=admin_user,
        project_id=project_id,
        reason_notes=f"Admin {admin_user.full_name} assigned {user.full_name} as {assigned_role} to project '{project.name}'.",
    )

    return {
        "status": "success",
        "message": f"Assigned {user.full_name} as {assigned_role} to {project.name}",
        "member_id": member.id,
    }


@router.delete("/{project_id}/members/{user_id}")
def remove_project_member(
    project_id: str,
    user_id: str,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_role(["ADMIN"])),
):
    """Remove project membership assignment (Admin only)."""
    member = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Project member assignment not found.")

    db.delete(member)
    db.commit()

    create_audit_log(
        db=db,
        action="PROJECT_UNASSIGNMENT",
        user=admin_user,
        project_id=project_id,
        reason_notes=f"Admin {admin_user.full_name} removed user '{user_id}' from project '{project_id}'.",
    )

    return {"status": "success", "message": "Assignment removed"}


@router.get("/{project_id}")
def get_project(project_id: str, db: Session = Depends(get_db)):
    """Retrieve full project details, datasets, settings, and processing runs."""
    project = db.query(SurveyProject).filter(SurveyProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found.")

    datasets = db.query(ProjectDataset).filter(ProjectDataset.project_id == project_id).all()
    settings = db.query(ProjectValidationSettings).filter(ProjectValidationSettings.project_id == project_id).first()
    latest_run = (
        db.query(ProcessingRun)
        .filter(ProcessingRun.project_id == project_id)
        .order_by(ProcessingRun.started_at.desc())
        .first()
    )

    return {
        "id": project.id,
        "name": project.name,
        "survey_area": project.survey_area,
        "district": project.district,
        "state": project.state,
        "survey_date": project.survey_date,
        "status": project.status,
        "progress": project.progress,
        "area_km2": project.area_km2,
        "working_crs": project.working_crs,
        "source_crs": project.source_crs,
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "datasets": [
            {
                "id": ds.id,
                "input_type": ds.input_type,
                "filename": ds.filename,
                "crs": ds.crs,
                "resolution_m": ds.resolution_m,
                "bounds": json.loads(ds.bounds_json) if ds.bounds_json else None,
                "file_size_bytes": ds.file_size_bytes,
                "validation_status": ds.validation_status,
                "uploaded_at": ds.uploaded_at.isoformat() if ds.uploaded_at else None,
            }
            for ds in datasets
        ],
        "validation_settings": {
            "snap_tolerance_m": settings.snap_tolerance_m if settings else 0.15,
            "gnss_tolerance_m": settings.gnss_tolerance_m if settings else 0.30,
            "min_overlap_sqm": settings.min_overlap_sqm if settings else 2.0,
            "min_gap_m": settings.min_gap_m if settings else 0.20,
            "sliver_threshold_sqm": settings.sliver_threshold_sqm if settings else 12.0,
            "boundary_displacement_warning_m": settings.boundary_displacement_warning_m if settings else 0.30,
        },
        "latest_run": {
            "id": latest_run.id,
            "status": latest_run.status,
            "started_at": latest_run.started_at.isoformat() if latest_run.started_at else None,
            "completed_at": latest_run.completed_at.isoformat() if latest_run.completed_at else None,
            "warnings": json.loads(latest_run.warnings_json) if latest_run.warnings_json else [],
        } if latest_run else None,
    }


@router.get("/{project_id}/settings")
def get_project_settings(project_id: str, db: Session = Depends(get_db)):
    """Get project validation settings."""
    settings = db.query(ProjectValidationSettings).filter(ProjectValidationSettings.project_id == project_id).first()
    if not settings:
        raise HTTPException(status_code=404, detail=f"Validation settings for project '{project_id}' not found.")
    return {
        "project_id": settings.project_id,
        "snap_tolerance_m": settings.snap_tolerance_m,
        "gnss_tolerance_m": settings.gnss_tolerance_m,
        "min_overlap_sqm": settings.min_overlap_sqm,
        "min_gap_m": settings.min_gap_m,
        "sliver_threshold_sqm": settings.sliver_threshold_sqm,
        "boundary_displacement_warning_m": settings.boundary_displacement_warning_m,
    }


@router.patch("/{project_id}/settings")
def update_project_settings(
    project_id: str,
    updates: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_role(["ADMIN"])),
):
    """Update project validation settings (Admin only)."""
    settings = db.query(ProjectValidationSettings).filter(ProjectValidationSettings.project_id == project_id).first()
    if not settings:
        settings = ProjectValidationSettings(project_id=project_id)
        db.add(settings)

    for field in [
        "snap_tolerance_m", "gnss_tolerance_m", "min_overlap_sqm",
        "min_gap_m", "sliver_threshold_sqm", "boundary_displacement_warning_m"
    ]:
        if field in updates:
            setattr(settings, field, float(updates[field]))

    db.commit()
    db.refresh(settings)

    create_audit_log(
        db=db,
        action="SETTINGS_UPDATED",
        user=admin_user,
        project_id=project_id,
        reason_notes=f"Admin {admin_user.full_name} updated project tolerances: {updates}",
    )

    return {
        "status": "updated",
        "project_id": settings.project_id,
        "snap_tolerance_m": settings.snap_tolerance_m,
        "gnss_tolerance_m": settings.gnss_tolerance_m,
        "min_overlap_sqm": settings.min_overlap_sqm,
        "min_gap_m": settings.min_gap_m,
        "sliver_threshold_sqm": settings.sliver_threshold_sqm,
        "boundary_displacement_warning_m": settings.boundary_displacement_warning_m,
    }


@router.post("/{project_id}/datasets")
@router.post("/{project_id}/inputs")
async def upload_project_dataset(
    project_id: str,
    input_type: str = Form(..., description="orthomosaic | dsm | dtm | existing_parcels | ground_truth | gnss_points"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Ingests an input dataset into the project repository, performs preflight validation,
    and updates the database record.
    """
    clean_type_key = input_type.strip().lower()
    if clean_type_key not in VALID_INPUT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid input_type '{input_type}'. Must be one of: {list(VALID_INPUT_TYPES.keys())}",
        )
    standard_type = VALID_INPUT_TYPES[clean_type_key]

    # Ensure project exists
    project = db.query(SurveyProject).filter(SurveyProject.id == project_id).first()
    if not project:
        # Automatically register project if not present
        project = SurveyProject(
            id=project_id,
            name=f"Survey Project {project_id}",
            survey_area="Active Survey Sector",
            status="created",
        )
        db.add(project)
        db.commit()
        db.refresh(project)

    # Prepare storage path
    type_subfolder = standard_type.lower()
    target_dir = os.path.join(STORAGE_ROOT, project_id, type_subfolder)
    os.makedirs(target_dir, exist_ok=True)
    target_path = os.path.join(target_dir, file.filename)

    contents = await file.read()
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty (0 bytes).")

    with open(target_path, "wb") as f:
        f.write(contents)

    # Perform preflight validation based on dataset role
    val_status = "VALID"
    val_errors = []
    val_warnings = []
    val_crs = None
    val_bounds = None
    val_res = None
    val_w = None
    val_h = None
    metadata = {}

    if standard_type in ["ORTHOMOSAIC", "DRONE_IMAGE", "DSM", "DTM"]:
        res = validate_raster_dataset(target_path)
        val_status = res.get("validation_status", "VALID")
        val_errors = res.get("errors", [])
        val_warnings = res.get("warnings", [])
        val_crs = res.get("crs")
        val_bounds = res.get("bounds_json")
        val_res = res.get("gsd_meters")
        val_w = res.get("width")
        val_h = res.get("height")
        metadata = res.get("metadata", {})

        # If this is the orthomosaic, update project working CRS and area
        if standard_type == "ORTHOMOSAIC" and val_crs:
            project.source_crs = val_crs
            if res.get("bounds") and not project.area_km2:
                b = res["bounds"]
                w_m = (b["max_lng"] - b["min_lng"]) * 111319
                h_m = (b["max_lat"] - b["min_lat"]) * 110574
                project.area_km2 = round(abs(w_m * h_m) / 1e6, 3)

    elif standard_type in ["EXISTING_PARCELS", "GROUND_TRUTH"]:
        ext = os.path.splitext(file.filename)[1].lower().strip(".")
        res = validate_vector_dataset(target_path, format_hint=ext)
        val_status = res.get("validation_status", "VALID")
        val_errors = res.get("errors", [])
        val_warnings = res.get("warnings", [])
        val_crs = res.get("crs")
        val_bounds = res.get("bounds_json")
        metadata = res.get("metadata", {})

    elif standard_type == "GNSS_POINTS":
        res = validate_survey_points_csv(target_path)
        val_status = res.get("validation_status", "VALID")
        val_errors = res.get("errors", [])
        val_warnings = res.get("warnings", [])
        val_crs = res.get("crs", "EPSG:4326")
        val_bounds = res.get("bounds_json")
        metadata = res.get("metadata", {})

    # Upsert into ProjectDataset table
    dataset_id = f"DS-{uuid.uuid4().hex[:8]}"
    dataset = ProjectDataset(
        id=dataset_id,
        project_id=project_id,
        input_type=standard_type,
        filename=file.filename,
        storage_path=target_path,
        crs=val_crs,
        bounds_json=val_bounds,
        resolution_m=val_res,
        width=val_w,
        height=val_h,
        file_size_bytes=len(contents),
        validation_status=val_status,
        validation_errors_json=json.dumps(val_errors),
        metadata_json=json.dumps(metadata),
    )
    db.add(dataset)
    project.status = "data_uploaded"
    db.commit()

    return {
        "status": "success",
        "dataset_id": dataset.id,
        "project_id": project_id,
        "input_type": standard_type,
        "filename": file.filename,
        "size_bytes": len(contents),
        "validation_status": val_status,
        "crs": val_crs,
        "resolution_m": val_res,
        "errors": val_errors,
        "warnings": val_warnings,
    }


@router.get("/{project_id}/datasets")
@router.get("/{project_id}/inputs")
def list_project_datasets(project_id: str, db: Session = Depends(get_db)):
    """List all registered datasets for this project with validation status."""
    datasets = db.query(ProjectDataset).filter(ProjectDataset.project_id == project_id).all()
    return [
        {
            "id": ds.id,
            "input_type": ds.input_type,
            "filename": ds.filename,
            "storage_path": ds.storage_path,
            "crs": ds.crs,
            "bounds": json.loads(ds.bounds_json) if ds.bounds_json else None,
            "resolution_m": ds.resolution_m,
            "width": ds.width,
            "height": ds.height,
            "file_size_bytes": ds.file_size_bytes,
            "validation_status": ds.validation_status,
            "validation_errors": json.loads(ds.validation_errors_json) if ds.validation_errors_json else [],
            "uploaded_at": ds.uploaded_at.isoformat() if ds.uploaded_at else None,
        }
        for ds in datasets
    ]


@router.post("/{project_id}/validate-inputs")
def validate_project_inputs(project_id: str, db: Session = Depends(get_db)):
    """Run cross-dataset compatibility checks (ORI presence, spatial bounds, DSM/DTM alignment)."""
    datasets = db.query(ProjectDataset).filter(ProjectDataset.project_id == project_id).all()
    ds_dicts = [
        {
            "id": ds.id,
            "input_type": ds.input_type,
            "filename": ds.filename,
            "storage_path": ds.storage_path,
            "crs": ds.crs,
            "bounds_json": ds.bounds_json,
            "resolution_m": ds.resolution_m,
            "validation_status": ds.validation_status,
            "metadata": json.loads(ds.metadata_json) if ds.metadata_json else {},
        }
        for ds in datasets
    ]

    checks = validate_project_dataset_compatibility(ds_dicts)
    has_critical_failure = any(c["status"] == "fail" for c in checks)

    return {
        "project_id": project_id,
        "valid": not has_critical_failure,
        "total_datasets": len(datasets),
        "checks": checks,
    }


@router.post("/{project_id}/process")
def process_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["ADMIN", "GIS_ANALYST"])),
):
    """
    Validates input datasets and runs the complete multi-stage CadastraAI pipeline:
      - Validates preflight inputs
      - Creates a ProcessingRun audit record
      - Accurately states model calibration status (MODEL_NOT_CONFIGURED / weights pending)
      - Extracts and persists parcels, buildings, roads, topology issues, and conflicts
    """
    project = db.query(SurveyProject).filter(SurveyProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found.")

    create_audit_log(
        db=db,
        action="PROCESSING_STARTED",
        user=current_user,
        project_id=project_id,
        reason_notes=f"User {current_user.full_name} ({current_user.role}) initiated AI pipeline processing run.",
    )

    datasets = db.query(ProjectDataset).filter(ProjectDataset.project_id == project_id).all()
    ds_dicts = [
        {
            "id": ds.id,
            "input_type": ds.input_type,
            "filename": ds.filename,
            "storage_path": ds.storage_path,
            "crs": ds.crs,
            "bounds_json": ds.bounds_json,
            "resolution_m": ds.resolution_m,
            "validation_status": ds.validation_status,
            "metadata": json.loads(ds.metadata_json) if ds.metadata_json else {},
        }
        for ds in datasets
    ]

    # Preflight check
    checks = validate_project_dataset_compatibility(ds_dicts)
    critical_errors = [c["message"] for c in checks if c["status"] == "fail"]
    if critical_errors:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Input validation failed. Cannot proceed with processing.",
                "critical_errors": critical_errors,
            },
        )

    # Locate primary raster
    ori_ds = next((d for d in datasets if d.input_type in ["ORTHOMOSAIC", "DRONE_IMAGE"]), None)
    if not ori_ds or not os.path.exists(ori_ds.storage_path):
        raise HTTPException(status_code=400, detail="Primary orthomosaic raster file is missing.")

    # Create ProcessingRun record
    run_id = f"RUN-{uuid.uuid4().hex[:8]}"
    proc_run = ProcessingRun(
        id=run_id,
        project_id=project_id,
        status="PREPROCESSING",
        parcel_model_version="unet-cadastral-pending",
        feature_model_version="segformer-bld-pending",
        road_model_version="deeplab-road-pending",
        warnings_json=json.dumps([
            "DL segmentation model weights are currently pending post-calibration. "
            "Pipeline Implemented — Heuristic GIS extraction active for surveyor review."
        ]),
    )
    db.add(proc_run)
    project.status = "processing"
    db.commit()

    PROJECT_STAGES[project_id] = {
        "run_id": run_id,
        "stage": "PREPROCESSING",
        "progress_pct": 20,
        "details": f"Ingesting orthomosaic raster {ori_ds.filename}",
        "status": "in_progress",
    }

    try:
        with open(ori_ds.storage_path, "rb") as f:
            image_bytes = f.read()

        PROJECT_STAGES[project_id] = {
            "run_id": run_id,
            "stage": "VECTORIZING",
            "progress_pct": 50,
            "details": "Vectorizing boundaries and performing metric topology validation",
            "status": "in_progress",
        }

        # Run pipeline
        result = process_survey_pipeline(
            image_bytes=image_bytes,
            filename=ori_ds.filename,
            project_id=project_id,
            db=db,
            project_dir=os.path.join(STORAGE_ROOT, project_id),
        )

        proc_run.status = "COMPLETE"
        proc_run.completed_at = datetime.datetime.utcnow()
        proc_run.outputs_json = json.dumps({"parcels_count": len(result.get("parcels", []))})
        project.status = "verified"
        project.progress = 100
        db.commit()

        PROJECT_STAGES[project_id] = {
            "run_id": run_id,
            "stage": "COMPLETE",
            "progress_pct": 100,
            "details": "Cadastral boundary extraction and topology verification complete.",
            "status": "completed",
            "results": result,
        }

        return {
            "project_id": project_id,
            "run_id": run_id,
            "status": "completed",
            "model_status": "Pipeline Implemented — Model Weights Pending Validation",
            "summary": result.get("stats", {}),
            "results": result,
        }

    except Exception as ex:
        proc_run.status = "FAILED"
        proc_run.errors_json = json.dumps([str(ex)])
        project.status = "failed"
        db.commit()
        PROJECT_STAGES[project_id] = {
            "run_id": run_id,
            "stage": "FAILED",
            "progress_pct": 0,
            "details": f"Processing failed: {str(ex)}",
            "status": "failed",
        }
        logger.error(f"Processing project {project_id} failed: {ex}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Pipeline processing failed: {str(ex)}")


@router.get("/{project_id}/status")
def get_project_status(project_id: str):
    """Returns current execution stage and progress percentage."""
    stage_info = PROJECT_STAGES.get(project_id)
    if not stage_info:
        return {
            "project_id": project_id,
            "stage": "IDLE",
            "progress_pct": 0,
            "status": "idle",
            "details": "Ready for input upload and processing",
        }
    return stage_info


@router.get("/{project_id}/results")
def get_project_results(project_id: str, db: Session = Depends(get_db)):
    """Retrieves full analysis results, GeoJSON features, and validation metrics."""
    stage_info = PROJECT_STAGES.get(project_id)
    if stage_info and "results" in stage_info:
        return stage_info["results"]

    survey = get_survey_by_id(project_id, db)
    if not survey:
        raise HTTPException(status_code=404, detail=f"Results for project '{project_id}' not found.")
    return survey


@router.get("/{project_id}/parcels")
def get_project_parcels(project_id: str, db: Session = Depends(get_db)):
    """Returns GeoJSON FeatureCollection of all parcels for the project."""
    parcels = db.query(DBParcel).filter(DBParcel.project_id == project_id).all()
    features = []
    for p in parcels:
        try:
            geom = json.loads(p.current_geometry_json or p.ai_geometry_json or p.existing_geometry_json)
        except Exception:
            geom = {"type": "Polygon", "coordinates": []}

        features.append({
            "type": "Feature",
            "id": p.id,
            "geometry": geom,
            "properties": {
                "id": p.id,
                "survey_number": p.survey_number,
                "ward": p.ward,
                "zone": p.zone,
                "area_m2": p.ai_area,
                "perimeter_m": p.perimeter,
                "confidence": p.confidence,
                "status": p.status,
                "topology_status": p.topology_status,
                "conflict_type": p.conflict_type,
                "priority": p.priority,
            },
        })

    return {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "features": features,
    }


@router.get("/{project_id}/buildings")
def get_project_buildings(project_id: str, db: Session = Depends(get_db)):
    """Returns GeoJSON FeatureCollection of structural buildings with height provenance."""
    buildings = db.query(DBBuilding).filter(DBBuilding.project_id == project_id).all()
    features = []
    for b in buildings:
        try:
            geom = json.loads(b.geometry_json)
        except Exception:
            geom = {"type": "Polygon", "coordinates": []}

        features.append({
            "type": "Feature",
            "id": b.id,
            "geometry": geom,
            "properties": {
                "id": b.id,
                "parcel_id": b.parcel_id,
                "structure_type": b.structure_type,
                "height_m": b.height_m,
                "height_provenance": b.height_provenance,
                "floors": b.floors,
                "roof_style": b.roof_style,
                "footprint_area_sqm": b.footprint_area_sqm,
                "elevation_asl_m": b.elevation_asl_m,
                "confidence": b.confidence,
                "has_encroachment": b.has_encroachment,
            },
        })

    return {
        "type": "FeatureCollection",
        "features": features,
    }


@router.get("/{project_id}/roads")
def get_project_roads(project_id: str, db: Session = Depends(get_db)):
    """Returns GeoJSON FeatureCollection of road network corridors."""
    roads = db.query(DBRoad).filter(DBRoad.project_id == project_id).all()
    features = []
    for r in roads:
        try:
            geom = json.loads(r.geometry_json)
        except Exception:
            geom = {"type": "LineString", "coordinates": []}

        features.append({
            "type": "Feature",
            "id": r.id,
            "geometry": geom,
            "properties": {
                "id": r.id,
                "road_name": r.road_name,
                "width_m": r.width_m,
                "surface_type": r.surface_type,
                "length_m": r.length_m,
            },
        })

    return {
        "type": "FeatureCollection",
        "features": features,
    }


@router.get("/{project_id}/issues")
def get_project_issues(project_id: str, db: Session = Depends(get_db)):
    """Returns all topology and conflict issues for this project with repair preview."""
    issues = db.query(DBTopologyIssue).filter(DBTopologyIssue.project_id == project_id).all()
    out = []
    for iss in issues:
        try:
            geom = json.loads(iss.geometry_json)
        except Exception:
            geom = None
        try:
            sug = json.loads(iss.suggested_fix_json) if iss.suggested_fix_json else None
        except Exception:
            sug = None

        out.append({
            "id": iss.id,
            "parcel_id": iss.parcel_id,
            "related_parcel_id": iss.related_parcel_id,
            "issue_type": iss.issue_type,
            "severity": iss.severity,
            "description": iss.description,
            "status": iss.status,
            "geometry": geom,
            "suggested_fix": sug,
        })
    return out


@router.post("/{project_id}/issues/{issue_id}/apply-fix")
def apply_issue_fix(
    project_id: str,
    issue_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["ADMIN", "GIS_ANALYST"])),
):
    """
    Applies the suggested repair geometry to the targeted parcel and marks the issue resolved.
    Permitted to ADMIN and GIS_ANALYST.
    """
    issue = db.query(DBTopologyIssue).filter(
        DBTopologyIssue.id == issue_id,
        DBTopologyIssue.project_id == project_id,
    ).first()
    if not issue:
        raise HTTPException(status_code=404, detail=f"Issue '{issue_id}' not found.")

    if not issue.suggested_fix_json:
        raise HTTPException(status_code=400, detail="No suggested repair geometry available for this issue.")

    try:
        sug = json.loads(issue.suggested_fix_json)
        coords = sug.get("coordinates")
        target_pid = sug.get("target_parcel_id") or issue.parcel_id

        parcel = db.query(DBParcel).filter(DBParcel.id == target_pid).first()
        if not parcel:
            raise HTTPException(status_code=404, detail=f"Target parcel '{target_pid}' not found.")

        # Record in ParcelHistory
        hist = ParcelHistory(
            parcel_id=parcel.id,
            project_id=project_id,
            stage="GEOMETRY_EDITED",
            changed_by=f"{current_user.full_name} (Topology Repair Commit)",
            geometry_json=json.dumps({"type": "Polygon", "coordinates": coords}),
            change_reason=f"Applied repair for topology issue {issue_id}: {issue.description}",
        )
        db.add(hist)

        # Update parcel active geometry
        parcel.corrected_geometry_json = json.dumps({"type": "Polygon", "coordinates": coords})
        parcel.current_geometry_json = parcel.corrected_geometry_json
        parcel.status = "corrected"
        parcel.topology_status = "valid"

        issue.status = "resolved"
        db.commit()

        create_audit_log(
            db=db,
            action="TOPOLOGY_FIX_APPLIED",
            user=current_user,
            project_id=project_id,
            feature_id=target_pid,
            previous_state="TOPOLOGY_INVALID",
            new_state="TOPOLOGY_VALID",
            reason_notes=f"Applied topology repair for issue {issue_id}: {issue.description}",
        )

        return {
            "status": "success",
            "message": f"Topology issue {issue_id} repaired on parcel {target_pid}.",
            "parcel_id": target_pid,
        }
    except Exception as ex:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to apply fix: {str(ex)}")


@router.post("/{project_id}/parcels/{parcel_id}/correct")
def correct_parcel_boundary(
    project_id: str,
    parcel_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["ADMIN", "GIS_ANALYST"])),
):
    """
    GIS Analyst preliminary geometry correction.
    Preserves original AI geometry, saves corrected geometry, updates version history.
    """
    parcel = db.query(DBParcel).filter(DBParcel.id == parcel_id, DBParcel.project_id == project_id).first()
    if not parcel:
        raise HTTPException(status_code=404, detail=f"Parcel '{parcel_id}' not found.")

    coords = payload.get("coordinates")
    if not coords:
        raise HTTPException(status_code=400, detail="Missing polygon coordinates.")

    reason = payload.get("reason", "Preliminary boundary adjustment by GIS Analyst")

    hist = ParcelHistory(
        parcel_id=parcel.id,
        project_id=project_id,
        stage="ANALYST_CORRECTED",
        changed_by=f"{current_user.full_name} ({current_user.role})",
        geometry_json=json.dumps({"type": "Polygon", "coordinates": coords}),
        change_reason=reason,
    )
    db.add(hist)

    parcel.corrected_geometry_json = json.dumps({"type": "Polygon", "coordinates": coords})
    parcel.current_geometry_json = parcel.corrected_geometry_json
    parcel.status = "ANALYST_CORRECTED"
    parcel.notes = f"{parcel.notes or ''}\nCorrection: {reason}".strip()
    db.commit()

    create_audit_log(
        db=db,
        action="GEOMETRY_CORRECTED",
        user=current_user,
        project_id=project_id,
        feature_id=parcel_id,
        previous_state="AI_GENERATED",
        new_state="ANALYST_CORRECTED",
        reason_notes=reason,
    )

    return {
        "status": "success",
        "message": f"Parcel {parcel_id} geometry corrected.",
        "parcel_id": parcel_id,
        "new_status": "ANALYST_CORRECTED",
    }


@router.post("/{project_id}/parcels/{parcel_id}/submit-review")
def submit_parcel_for_review(
    project_id: str,
    parcel_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["ADMIN", "GIS_ANALYST"])),
):
    """
    Transitions parcel from Analyst review to Surveyor review queue (READY_FOR_SURVEY_REVIEW).
    """
    parcel = db.query(DBParcel).filter(DBParcel.id == parcel_id, DBParcel.project_id == project_id).first()
    if not parcel:
        raise HTTPException(status_code=404, detail=f"Parcel '{parcel_id}' not found.")

    notes = payload.get("notes", "Technical geospatial checks complete. Submitted for licensed surveyor review.")

    hist = ParcelHistory(
        parcel_id=parcel.id,
        project_id=project_id,
        stage="READY_FOR_SURVEY_REVIEW",
        changed_by=f"{current_user.full_name} ({current_user.role})",
        geometry_json=parcel.current_geometry_json or parcel.ai_geometry_json,
        change_reason=notes,
    )
    db.add(hist)

    parcel.status = "READY_FOR_SURVEY_REVIEW"
    parcel.verification_status = "under_review"
    if notes:
        parcel.notes = f"{parcel.notes or ''}\nAnalyst Review Note: {notes}".strip()
    db.commit()

    create_audit_log(
        db=db,
        action="SUBMITTED_FOR_REVIEW",
        user=current_user,
        project_id=project_id,
        feature_id=parcel_id,
        previous_state=parcel.status,
        new_state="READY_FOR_SURVEY_REVIEW",
        reason_notes=notes,
    )

    return {
        "status": "success",
        "message": f"Parcel {parcel_id} submitted for surveyor review.",
        "parcel_id": parcel_id,
        "new_status": "READY_FOR_SURVEY_REVIEW",
    }
