import os
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.services.project_service import (
    create_survey,
    process_survey_pipeline,
    get_survey_by_id,
)

router = APIRouter(prefix="/api/survey", tags=["Survey"])


@router.post("/upload")
async def upload_survey_imagery(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    survey_area: Optional[str] = Form(None),
    district: Optional[str] = Form(None),
    state: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """
    Receives drone/orthomosaic imagery upload, validates file type,
    creates project record, and saves file.
    """
    # Validate extension
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".tif", ".tiff", ".jpg", ".jpeg", ".png"]:
        raise HTTPException(400, "Unsupported file format. Provide GeoTIFF, JPEG, or PNG.")

    contents = await file.read()
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # Create survey in DB
    survey = create_survey(
        {
            "name": name or "Cadastral Survey Project",
            "survey_area": survey_area or "Survey Area",
            "district": district or "Unassigned",
            "state": state or "Unassigned",
        },
        db=db,
    )

    return {
        "status": "uploaded",
        "survey_id": survey["id"],
        "filename": file.filename,
        "size_bytes": len(contents),
        "message": "Imagery received successfully. Ready for AI deep-learning analysis.",
    }


@router.post("/analyze")
async def analyze_survey_imagery(
    file: Optional[UploadFile] = File(None),
    survey_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """
    Executes the End-to-End Deep Learning + GIS feature extraction pipeline:
    Image => Preprocessing => PyTorch U-Net => Vectorization => GeoJSON => Cadastral Comparison => Conflict Analysis.
    """
    if not file:
        raise HTTPException(
            status_code=400,
            detail="Required ORI (orthomosaic) raster is missing. Please upload a valid GeoTIFF/image file.",
        )

    contents = await file.read()
    filename = file.filename

    result = process_survey_pipeline(
        image_bytes=contents,
        filename=filename,
        project_id=survey_id,
        db=db,
    )

    return result


@router.get("/{id}")
def get_survey(id: str, db: Session = Depends(get_db)):
    """Retrieves survey details by ID."""
    survey = get_survey_by_id(id, db)
    if not survey:
        raise HTTPException(status_code=404, detail="Survey project not found.")
    return survey
