import os
import uuid
import json
import datetime
import logging
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from backend.utils.image_utils import load_and_preprocess_image
from backend.services.inference import run_inference, get_model_status
from backend.services.gis_service import vectorize_segmentation
from backend.services.cadastral_service import compare_with_cadastral_records
from backend.services.conflict_service import detect_conflicts
from backend.models.db_models import SurveyProject, SurveyImage, Parcel as DBParcel, DetectedFeature, Conflict as DBConflict, Verification
from backend.models.schemas import AnalysisResponse, StatsSummary, GeoJSONFeatureCollection

logger = logging.getLogger("cadastra.pipeline")
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def create_survey(data: Dict[str, Any], db: Session) -> Dict[str, Any]:
    """Creates a new Survey project in the database."""
    survey_id = f"PRJ-{str(uuid.uuid4())[:8].upper()}"
    project = SurveyProject(
        id=survey_id,
        name=data.get("name", "Urban Parcel Survey"),
        survey_area=data.get("survey_area", "Zone 04"),
        district=data.get("district", "Jaipur"),
        state=data.get("state", "Rajasthan"),
        survey_date=data.get("survey_date", datetime.date.today().isoformat()),
        status="created",
        progress=10,
        area_km2=float(data.get("area_km2", 1.85)),
    )
    db.add(project)
    db.commit()
    db.refresh(project)
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
    }


def process_survey_pipeline(
    image_bytes: bytes,
    filename: str,
    project_id: Optional[str],
    db: Optional[Session] = None,
) -> Dict[str, Any]:
    """
    Executes the complete End-to-End AI Cadastral Processing Pipeline:
    1. Preprocessing image
    2. Deep Learning inference (PyTorch U-Net or CV fallback)
    3. GIS vectorization (Mask -> Contours -> Polygons -> GeoJSON)
    4. Cadastral spatial comparison
    5. Conflict detection and risk scoring
    6. Database persistence
    """
    steps = []
    
    # 1. Image Ingestion & Storage
    steps.append({"step": "Ingestion", "status": "completed", "detail": f"Decoded {filename} ({len(image_bytes)} bytes)"})
    file_id = str(uuid.uuid4())[:8]
    save_path = os.path.join(UPLOAD_DIR, f"{file_id}_{filename}")
    with open(save_path, "wb") as f:
        f.write(image_bytes)

    # 2. Preprocessing
    img_rgb, (orig_w, orig_h) = load_and_preprocess_image(image_bytes, target_size=(1024, 1024))
    steps.append({"step": "Preprocessing", "status": "completed", "detail": f"Normalized to 1024x1024 (Original: {orig_w}x{orig_h})"})

    # 3. DL Segmentation Inference
    boundary_mask, building_mask, inference_mode = run_inference(img_rgb)
    model_status = get_model_status()
    steps.append({
        "step": "DL Inference",
        "status": "completed",
        "detail": f"Mode: {inference_mode} on {model_status['device']}",
    })

    # 4. GIS Vectorization
    parcels_geojson, buildings_geojson, raw_parcels, raw_buildings = vectorize_segmentation(
        boundary_mask, building_mask, img_shape=(1024, 1024)
    )
    steps.append({
        "step": "Vectorization",
        "status": "completed",
        "detail": f"Extracted {len(raw_parcels)} parcels and {len(raw_buildings)} buildings",
    })

    # 5. Cadastral Spatial Comparison
    compared_parcels = compare_with_cadastral_records(raw_parcels)
    steps.append({
        "step": "Cadastral Comparison",
        "status": "completed",
        "detail": "Computed boundary displacements and area variances against registered records",
    })

    # 6. Conflict Detection & Risk Scoring
    final_parcels, conflicts = detect_conflicts(compared_parcels)
    steps.append({
        "step": "Conflict Analysis",
        "status": "completed",
        "detail": f"Identified {len(conflicts)} potential spatial conflicts",
    })

    # 7. Compute Summary Stats
    high_conf = sum(1 for p in final_parcels if p["confidence"] >= 80)
    review_req = sum(1 for p in final_parcels if p["status"] == "requires_review")
    field_verif = sum(1 for p in final_parcels if p["status"] == "field_verification")
    topology_errors = sum(1 for p in final_parcels if p.get("topologyStatus") == "invalid")
    avg_conf = round(sum(p["confidence"] for p in final_parcels) / max(1, len(final_parcels)), 1)

    stats = {
        "total_parcels": len(final_parcels),
        "high_confidence": high_conf,
        "review_required": review_req,
        "field_verification": field_verif,
        "topology_errors": topology_errors,
        "buildings_detected": len(raw_buildings),
        "avg_confidence": avg_conf,
    }

    # 8. Optional Database Persistence
    proj_id = project_id or f"PRJ-{file_id.upper()}"
    if db:
        try:
            # Ensure project exists
            proj = db.query(SurveyProject).filter(SurveyProject.id == proj_id).first()
            if not proj:
                proj = SurveyProject(
                    id=proj_id,
                    name=f"Survey {filename}",
                    survey_area="Zone 04, Jaipur",
                    status="analysis_complete",
                    progress=100,
                )
                db.add(proj)
            else:
                proj.status = "analysis_complete"
                proj.progress = 100

            # Store Image Record
            img_record = SurveyImage(
                id=f"IMG-{file_id}",
                project_id=proj_id,
                filename=filename,
                file_path=save_path,
                width=orig_w,
                height=orig_h,
            )
            db.add(img_record)

            # Store Parcels
            for p in final_parcels:
                db_p = DBParcel(
                    id=p["id"],
                    project_id=proj_id,
                    survey_number=p["surveyNumber"],
                    ward=p["ward"],
                    zone=p["zone"],
                    existing_geometry_json=json.dumps(p.get("existingGeometry", [])),
                    ai_geometry_json=json.dumps(p.get("geo_coords", [])),
                    existing_area=p.get("existingArea", 0.0),
                    ai_area=p.get("aiArea", 0.0),
                    confidence=p.get("confidence", 0.0),
                    boundary_displacement=p.get("boundaryDisplacement", 0.0),
                    status=p.get("status", "ai_preliminary"),
                    conflict_type=p.get("conflictType"),
                    priority=p.get("priority", "LOW"),
                    topology_status=p.get("topologyStatus", "valid"),
                    recommendation=p.get("recommendation", ""),
                    conflict_reasons_json=json.dumps(p.get("conflictReasons", [])),
                )
                db.merge(db_p)

            # Store Conflicts
            for c in conflicts:
                db_c = DBConflict(
                    id=c["id"],
                    project_id=proj_id,
                    parcel_id=c["parcel_id"],
                    conflict_type=c["conflict_type"],
                    severity=c["severity"],
                    description=c["description"],
                    status="unresolved",
                )
                db.merge(db_c)

            db.commit()
            steps.append({"step": "Database Sync", "status": "completed", "detail": f"Persisted features to PostGIS/Database for project {proj_id}"})
        except Exception as e:
            logger.error(f"Error persisting to DB: {e}")
            db.rollback()

    return {
        "survey_id": proj_id,
        "inference_mode": inference_mode,
        "device": model_status["device"],
        "parcels_geojson": parcels_geojson,
        "buildings_geojson": buildings_geojson,
        "conflicts": conflicts,
        "stats": stats,
        "processing_steps": steps,
        "raw_parcels": final_parcels,
        "raw_buildings": raw_buildings,
        "disclaimer": (
            "Legal Notice: AI-extracted boundaries are preliminary geometric detections from visual imagery. "
            "They do NOT constitute authoritative legal cadastral determinations until reviewed and verified by a licensed cadastral surveyor."
        ),
    }


def get_survey_by_id(survey_id: str, db: Session) -> Optional[Dict[str, Any]]:
    """Retrieves survey project metadata and associated parcels from DB."""
    proj = db.query(SurveyProject).filter(SurveyProject.id == survey_id).first()
    if not proj:
        return None
    
    total_parcels = db.query(DBParcel).filter(DBParcel.project_id == survey_id).count()
    verified = db.query(DBParcel).filter(DBParcel.project_id == survey_id, DBParcel.status == "verified").count()
    
    return {
        "id": proj.id,
        "name": proj.name,
        "survey_area": proj.survey_area,
        "district": proj.district,
        "state": proj.state,
        "survey_date": proj.survey_date,
        "status": proj.status,
        "progress": proj.progress,
        "area_km2": proj.area_km2,
        "total_parcels": total_parcels,
        "verified_parcels": verified,
    }


def get_all_features(project_id: Optional[str], db: Session) -> List[Dict[str, Any]]:
    """Retrieves all detected parcel features."""
    query = db.query(DBParcel)
    if project_id:
        query = query.filter(DBParcel.project_id == project_id)
    
    parcels = query.all()
    results = []
    for p in parcels:
        results.append({
            "id": p.id,
            "project_id": p.project_id,
            "survey_number": p.survey_number,
            "ward": p.ward,
            "zone": p.zone,
            "confidence": p.confidence,
            "ai_area": p.ai_area,
            "existing_area": p.existing_area,
            "status": p.status,
            "priority": p.priority,
            "conflict_type": p.conflict_type,
            "topology_status": p.topology_status,
            "recommendation": p.recommendation,
            "assigned_surveyor": p.assigned_surveyor,
        })
    return results


def update_feature_verification(
    feature_id: str,
    verification_data: Dict[str, Any],
    db: Session,
) -> Optional[Dict[str, Any]]:
    """Updates the verification status of a detected feature."""
    parcel = db.query(DBParcel).filter(DBParcel.id == feature_id).first()
    if not parcel:
        return None

    new_status = verification_data.get("status", "verified")
    parcel.status = new_status
    parcel.verification_status = "verified" if new_status == "verified" else ("under_review" if new_status == "edited" else "not_reviewed")
    
    if "notes" in verification_data and verification_data["notes"]:
        parcel.notes = f"{parcel.notes}\n{verification_data['notes']}".strip()
    
    if "surveyor_name" in verification_data:
        parcel.assigned_surveyor = verification_data["surveyor_name"]

    # Record verification audit trail
    verif = Verification(
        id=f"VERIF-{str(uuid.uuid4())[:8]}",
        project_id=parcel.project_id,
        parcel_id=feature_id,
        surveyor_name=verification_data.get("surveyor_name", "Surveyor"),
        status=new_status,
        notes=verification_data.get("notes", ""),
        checklist_json=json.dumps(verification_data.get("checklist", {})),
    )
    db.add(verif)
    db.commit()
    db.refresh(parcel)

    return {
        "id": parcel.id,
        "status": parcel.status,
        "verification_status": parcel.verification_status,
        "notes": parcel.notes,
        "assigned_surveyor": parcel.assigned_surveyor,
    }
