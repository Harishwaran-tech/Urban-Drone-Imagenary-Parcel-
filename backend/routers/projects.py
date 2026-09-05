"""
Project Input Ingestion & Multi-Stage Processing Router for CadastraAI.
Implements the SIH multi-input workflow:
POST /api/projects/{id}/inputs    - Upload ORI, DSM, DTM, Existing Cadastre, GT, GNSS
GET  /api/projects/{id}/inputs    - Inventory and preflight validation checks
POST /api/projects/{id}/process   - Trigger multi-stage AI cadastral pipeline
GET  /api/projects/{id}/status    - Real-time pipeline stage progress
GET  /api/projects/{id}/results   - Comprehensive analysis outputs and summary metrics
"""

import os
import shutil
from typing import Optional, Dict, Any
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.services.input_validator import (
    PROJECT_INPUT_SUBDIRS,
    init_project_input_directories,
    get_project_inputs_inventory,
    run_preflight_project_validation,
)
from backend.services.project_service import process_survey_pipeline, get_survey_by_id

router = APIRouter(prefix="/api/projects", tags=["Projects"])

STORAGE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads", "projects"))
os.makedirs(STORAGE_ROOT, exist_ok=True)

# In-memory stage progress cache for asynchronous status polling
PROJECT_STAGES: Dict[str, Dict[str, Any]] = {}


@router.post("/{project_id}/inputs")
async def upload_project_input(
    project_id: str,
    input_type: str = Form(..., description="drone | ori | dsm | dtm | existing_gis | ground_truth | gnss_cors"),
    file: UploadFile = File(...),
):
    """
    Ingests a specific input layer into the structured project repository.
    """
    clean_type = input_type.strip().lower()
    if clean_type not in PROJECT_INPUT_SUBDIRS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid input_type '{input_type}'. Must be one of: {PROJECT_INPUT_SUBDIRS}",
        )

    dirs = init_project_input_directories(STORAGE_ROOT, project_id)
    target_dir = dirs[clean_type]
    target_path = os.path.join(target_dir, file.filename)

    contents = await file.read()
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    with open(target_path, "wb") as f:
        f.write(contents)

    inventory = get_project_inputs_inventory(STORAGE_ROOT, project_id)

    return {
        "status": "success",
        "project_id": project_id,
        "input_type": clean_type,
        "filename": file.filename,
        "size_bytes": len(contents),
        "target_path": target_path,
        "inventory_summary": inventory,
    }


@router.get("/{project_id}/inputs")
def get_project_inputs(project_id: str):
    """
    Returns inventory of all uploaded input files and runs preflight validation.
    """
    dirs = init_project_input_directories(STORAGE_ROOT, project_id)
    validation = run_preflight_project_validation(STORAGE_ROOT, project_id)
    return validation


@router.post("/{project_id}/process")
def process_project(
    project_id: str,
    db: Session = Depends(get_db),
):
    """
    Validates input datasets and runs the complete multi-stage CadastraAI pipeline.
    """
    # 1. Run Preflight Validation
    validation = run_preflight_project_validation(STORAGE_ROOT, project_id)
    if not validation["valid"]:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Input validation failed. Cannot proceed with AI processing.",
                "critical_errors": validation["critical_errors"],
            },
        )

    # 2. Locate Primary Imagery (ORI or Drone Image)
    inv = validation["inventory"]["directories"]
    ori_files = inv.get("ori", []) or inv.get("drone", [])
    if not ori_files:
        raise HTTPException(status_code=400, detail="No imagery found to process.")

    primary_image_path = ori_files[0]["path"]
    with open(primary_image_path, "rb") as f:
        image_bytes = f.read()

    # Track progress stages
    PROJECT_STAGES[project_id] = {
        "stage": "PREPROCESSING",
        "progress_pct": 15,
        "details": f"Ingesting {os.path.basename(primary_image_path)}",
        "status": "in_progress",
    }

    # Execute pipeline
    result = process_survey_pipeline(
        image_bytes=image_bytes,
        filename=os.path.basename(primary_image_path),
        project_id=project_id,
        db=db,
        project_dir=os.path.join(STORAGE_ROOT, project_id),
    )

    PROJECT_STAGES[project_id] = {
        "stage": "COMPLETE",
        "progress_pct": 100,
        "details": "AI cadastral boundary extraction, conflict analysis, and vectorization complete.",
        "status": "completed",
        "results": result,
    }

    return {
        "project_id": project_id,
        "status": "completed",
        "validation": validation,
        "summary": result["stats"],
        "results": result,
    }


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
        raise HTTPException(status_code=404, detail="Project results not found.")
    return survey
