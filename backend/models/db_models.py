import datetime
import json
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from backend.database import Base

class SurveyProject(Base):
    __tablename__ = "survey_projects"

    id = Column(String(64), primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    survey_area = Column(String(255), nullable=False)
    district = Column(String(128), default="Jaipur")
    state = Column(String(128), default="Rajasthan")
    survey_date = Column(String(64), default=lambda: datetime.date.today().isoformat())
    status = Column(String(64), default="created")  # created, data_uploaded, ai_processing, analysis_complete, completed
    progress = Column(Integer, default=0)
    area_km2 = Column(Float, default=1.85)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    images = relationship("SurveyImage", back_populates="project", cascade="all, delete-orphan")
    parcels = relationship("Parcel", back_populates="project", cascade="all, delete-orphan")
    features = relationship("DetectedFeature", back_populates="project", cascade="all, delete-orphan")
    conflicts = relationship("Conflict", back_populates="project", cascade="all, delete-orphan")


class SurveyImage(Base):
    __tablename__ = "survey_images"

    id = Column(String(64), primary_key=True, index=True)
    project_id = Column(String(64), ForeignKey("survey_projects.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(512), nullable=False)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    crs = Column(String(64), default="EPSG:4326")
    bounds_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    project = relationship("SurveyProject", back_populates="images")


class Parcel(Base):
    __tablename__ = "parcels"

    id = Column(String(64), primary_key=True, index=True)
    project_id = Column(String(64), ForeignKey("survey_projects.id"), nullable=False)
    survey_number = Column(String(128), nullable=False)
    ward = Column(String(64), default="Ward 01")
    zone = Column(String(64), default="Zone 04")
    
    # Geometries stored as JSON string for cross-database compatibility (PostGIS geometry can map to this)
    existing_geometry_json = Column(Text, nullable=False)
    ai_geometry_json = Column(Text, nullable=False)
    
    existing_area = Column(Float, default=0.0)
    ai_area = Column(Float, default=0.0)
    confidence = Column(Float, default=0.0)
    boundary_confidence = Column(Float, default=0.0)
    building_confidence = Column(Float, default=0.0)
    perimeter = Column(Float, default=0.0)
    boundary_displacement = Column(Float, default=0.0)
    
    status = Column(String(64), default="ai_preliminary")  # verified, ai_preliminary, requires_review, field_verification, rejected
    conflict_type = Column(String(64), nullable=True)  # boundary_mismatch, area_mismatch, overlap, gap, self_intersection, missing_parcel, new_structure
    priority = Column(String(32), default="LOW")  # LOW, MEDIUM, HIGH, CRITICAL
    topology_status = Column(String(32), default="valid")  # valid, invalid
    verification_status = Column(String(64), default="not_reviewed")
    
    notes = Column(Text, default="")
    recommendation = Column(Text, default="")
    conflict_reasons_json = Column(Text, default="[]")
    assigned_surveyor = Column(String(128), nullable=True)
    checklist_json = Column(Text, default='{"boundaryVerified":false,"existingRecordChecked":false,"gnssCollected":false,"buildingChecked":false,"neighborChecked":false}')
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    project = relationship("SurveyProject", back_populates="parcels")


class DetectedFeature(Base):
    __tablename__ = "detected_features"

    id = Column(String(64), primary_key=True, index=True)
    project_id = Column(String(64), ForeignKey("survey_projects.id"), nullable=False)
    feature_type = Column(String(64), nullable=False)  # building, road, parcel_boundary, fence
    confidence = Column(Float, default=0.0)
    area = Column(Float, default=0.0)
    geometry_json = Column(Text, nullable=False)
    status = Column(String(64), default="pending")  # pending, verified, edited, rejected
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    project = relationship("SurveyProject", back_populates="features")


class Conflict(Base):
    __tablename__ = "conflicts"

    id = Column(String(64), primary_key=True, index=True)
    project_id = Column(String(64), ForeignKey("survey_projects.id"), nullable=False)
    parcel_id = Column(String(64), nullable=False)
    conflict_type = Column(String(64), nullable=False)
    severity = Column(String(32), default="MEDIUM")
    description = Column(Text, nullable=False)
    status = Column(String(64), default="unresolved")  # unresolved, in_review, resolved
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    project = relationship("SurveyProject", back_populates="conflicts")


class Verification(Base):
    __tablename__ = "verifications"

    id = Column(String(64), primary_key=True, index=True)
    project_id = Column(String(64), ForeignKey("survey_projects.id"), nullable=False)
    parcel_id = Column(String(64), nullable=False)
    surveyor_name = Column(String(128), nullable=False)
    status = Column(String(64), default="verified")  # verified, edited, rejected
    notes = Column(Text, default="")
    checklist_json = Column(Text, default="{}")
    verified_at = Column(DateTime, default=datetime.datetime.utcnow)
