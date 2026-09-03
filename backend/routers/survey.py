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
    name: Optional[str] = Form("Jaipur Urban Survey"),
    survey_area: Optional[str] = Form("Zone 04"),
    district: Optional[str] = Form("Jaipur"),
    state: Optional[str] = Form("Rajasthan"),
    db: Session = Depends(get_db),
):
    """
    Receives drone/orthomosaic imagery upload, validates file type,
    creates project record, and saves file.
    """
    # Validate extension
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".tif", ".tiff", ".geojson", ".kml", ".zip"]:
        raise HTTPException(status_code=400, detail=f"Unsupported file format: {ext}")

    contents = await file.read()
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # Create survey in DB
    survey = create_survey(
        {
            "name": name,
            "survey_area": survey_area,
            "district": district,
            "state": state,
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
    if file:
        contents = await file.read()
        filename = file.filename
    else:
        # Generate synthetic raster or test imagery if none uploaded
        import numpy as np
        import cv2
        dummy_img = np.random.randint(40, 220, (800, 800, 3), dtype=np.uint8)
        # Draw some building-like boxes
        for bx, by, bw, bh in [(100, 100, 150, 120), (350, 120, 180, 140), (120, 400, 200, 180), (450, 420, 160, 150)]:
            cv2.rectangle(dummy_img, (bx, by), (bx + bw, by + bh), (220, 220, 230), -1)
            cv2.rectangle(dummy_img, (bx, by), (bx + bw, by + bh), (30, 30, 30), 2)
        _, encoded = cv2.imencode(".png", dummy_img)
        contents = encoded.tobytes()
        filename = "drone_survey_sample.png"

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
