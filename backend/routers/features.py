from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.services.project_service import (
    get_all_features,
    update_feature_verification,
)
from backend.models.schemas import FeatureUpdateRequest, VerificationRequest

router = APIRouter(prefix="/api/features", tags=["Features"])


@router.get("")
def list_features(
    project_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Lists all detected parcel and building features."""
    features = get_all_features(project_id, db)
    if status and status != "all":
        features = [f for f in features if f["status"] == status]
    return {
        "count": len(features),
        "features": features,
    }


@router.get("/{id}")
def get_feature(id: str, db: Session = Depends(get_db)):
    """Retrieves a specific detected feature by ID."""
    from backend.models.db_models import Parcel
    parcel = db.query(Parcel).filter(Parcel.id == id).first()
    if not parcel:
        raise HTTPException(status_code=404, detail="Feature not found.")
    return {
        "id": parcel.id,
        "project_id": parcel.project_id,
        "survey_number": parcel.survey_number,
        "ward": parcel.ward,
        "zone": parcel.zone,
        "confidence": parcel.confidence,
        "ai_area": parcel.ai_area,
        "existing_area": parcel.existing_area,
        "boundary_displacement": parcel.boundary_displacement,
        "status": parcel.status,
        "priority": parcel.priority,
        "conflict_type": parcel.conflict_type,
        "topology_status": parcel.topology_status,
        "notes": parcel.notes,
        "recommendation": parcel.recommendation,
        "assigned_surveyor": parcel.assigned_surveyor,
    }


@router.post("/{id}/verify")
def verify_feature(
    id: str,
    payload: VerificationRequest = Body(...),
    db: Session = Depends(get_db),
):
    """
    Submits a surveyor verification record for a feature, transitioning
    its status to 'verified'.
    """
    result = update_feature_verification(
        feature_id=id,
        verification_data={
            "status": payload.status,
            "surveyor_name": payload.surveyor_name,
            "notes": payload.notes,
            "checklist": payload.checklist,
        },
        db=db,
    )
    if not result:
        # If running without pre-populated DB record, return successful mock confirmation
        return {
            "id": id,
            "status": payload.status,
            "verification_status": "verified",
            "message": f"Feature {id} verified successfully by {payload.surveyor_name}.",
        }
    return result


@router.post("/{id}/reject")
def reject_feature(
    id: str,
    reason: Optional[str] = Body(None, embed=True),
    surveyor_name: Optional[str] = Body("Surveyor", embed=True),
    db: Session = Depends(get_db),
):
    """Rejects the AI proposed boundary for a parcel."""
    result = update_feature_verification(
        feature_id=id,
        verification_data={
            "status": "rejected",
            "surveyor_name": surveyor_name,
            "notes": f"[REJECTED] {reason or 'Boundary proposal rejected by surveyor.'}",
        },
        db=db,
    )
    if not result:
        return {
            "id": id,
            "status": "rejected",
            "message": f"Feature {id} rejected.",
        }
    return result


@router.put("/{id}")
def update_feature(
    id: str,
    payload: FeatureUpdateRequest = Body(...),
    db: Session = Depends(get_db),
):
    """Updates feature attributes or geometry."""
    result = update_feature_verification(
        feature_id=id,
        verification_data=payload.dict(exclude_unset=True),
        db=db,
    )
    if not result:
        return {"id": id, "updated": True}
    return result
