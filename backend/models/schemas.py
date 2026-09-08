from typing import List, Dict, Any, Optional, Union
from pydantic import BaseModel, Field

# --- GeoJSON Schemas ---
class GeoJSONGeometry(BaseModel):
    type: str  # "Polygon", "MultiPolygon", "Point", "LineString"
    coordinates: Any

class GeoJSONFeature(BaseModel):
    type: str = "Feature"
    id: Optional[Union[str, int]] = None
    geometry: GeoJSONGeometry
    properties: Dict[str, Any] = Field(default_factory=dict)

class GeoJSONFeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: List[GeoJSONFeature] = Field(default_factory=list)
    crs: Optional[Dict[str, Any]] = None

# --- Survey & Project Schemas ---
class SurveyCreate(BaseModel):
    name: str
    survey_area: str
    district: str = "Unassigned"
    state: str = "Unassigned"
    survey_date: Optional[str] = None

class SurveyResponse(BaseModel):
    id: str
    name: str
    survey_area: str
    district: str
    state: str
    survey_date: str
    status: str
    progress: int
    area_km2: float
    total_parcels: int = 0
    verified_parcels: int = 0

# --- Feature & Verification Schemas ---
class FeatureItem(BaseModel):
    id: str
    project_id: str
    feature_type: str
    confidence: float
    area: float
    status: str
    geometry: Optional[Dict[str, Any]] = None
    properties: Optional[Dict[str, Any]] = None

class FeatureUpdateRequest(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    geometry: Optional[Dict[str, Any]] = None
    properties: Optional[Dict[str, Any]] = None

class VerificationRequest(BaseModel):
    surveyor_name: str = "Ravi Kumar"
    status: str = "verified"  # verified, edited, rejected
    notes: Optional[str] = None
    checklist: Optional[Dict[str, bool]] = None

# --- Conflict Schemas ---
class ConflictItem(BaseModel):
    id: str
    project_id: str
    parcel_id: str
    conflict_type: str
    severity: str
    description: str
    status: str

# --- Pipeline Analysis Response ---
class StatsSummary(BaseModel):
    total_parcels: int
    high_confidence: int
    review_required: int
    field_verification: int
    topology_errors: int
    buildings_detected: int
    avg_confidence: float

class AnalysisResponse(BaseModel):
    survey_id: str
    inference_mode: str  # "pytorch_unet" or "development_cv_fallback"
    device: str  # "cuda" or "cpu"
    parcels_geojson: GeoJSONFeatureCollection
    buildings_geojson: GeoJSONFeatureCollection
    conflicts: List[ConflictItem]
    stats: StatsSummary
    processing_steps: List[Dict[str, Any]]
    disclaimer: str = (
        "Legal Notice: AI-extracted boundaries are preliminary geometric detections from visual imagery. "
        "They do NOT constitute authoritative legal cadastral determinations until reviewed and verified by a licensed cadastral surveyor."
    )
