import datetime
import json
import uuid
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from backend.database import Base


class SurveyProject(Base):
    __tablename__ = "survey_projects"

    id = Column(String(64), primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    survey_area = Column(String(255), nullable=False)
    district = Column(String(128), default="Survey District")
    state = Column(String(128), default="Survey State")
    survey_date = Column(String(64), default=lambda: datetime.date.today().isoformat())
    status = Column(String(64), default="created")  # created, data_uploaded, processing, verified, completed
    progress = Column(Integer, default=0)
    area_km2 = Column(Float, default=0.0)
    working_crs = Column(String(64), nullable=True, default=None)  # Determined from project metadata or input raster CRS
    source_crs = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    images = relationship("SurveyImage", back_populates="project", cascade="all, delete-orphan")
    datasets = relationship("ProjectDataset", back_populates="project", cascade="all, delete-orphan")
    processing_runs = relationship("ProcessingRun", back_populates="project", cascade="all, delete-orphan")
    validation_settings = relationship("ProjectValidationSettings", back_populates="project", uselist=False, cascade="all, delete-orphan")
    parcels = relationship("Parcel", back_populates="project", cascade="all, delete-orphan")
    buildings = relationship("Building", back_populates="project", cascade="all, delete-orphan")
    roads = relationship("Road", back_populates="project", cascade="all, delete-orphan")
    features = relationship("DetectedFeature", back_populates="project", cascade="all, delete-orphan")
    conflicts = relationship("Conflict", back_populates="project", cascade="all, delete-orphan")
    gnss_points = relationship("GNSSControlPoint", back_populates="project", cascade="all, delete-orphan")
    topology_issues = relationship("TopologyIssue", back_populates="project", cascade="all, delete-orphan")
    members = relationship("ProjectMember", back_populates="project", cascade="all, delete-orphan")


class ProjectDataset(Base):
    """
    Tracks each uploaded input dataset role and preflight validation status (P1 Item 11 & 12).
    """
    __tablename__ = "project_datasets"

    id = Column(String(64), primary_key=True, default=lambda: f"DS-{uuid.uuid4().hex[:8]}")
    project_id = Column(String(64), ForeignKey("survey_projects.id"), nullable=False, index=True)
    input_type = Column(String(64), nullable=False)  # ORTHOMOSAIC, DRONE_IMAGE, DSM, DTM, EXISTING_PARCELS, GROUND_TRUTH, GNSS_POINTS
    filename = Column(String(255), nullable=False)
    storage_path = Column(String(512), nullable=False)
    crs = Column(String(64), nullable=True)
    bounds_json = Column(Text, nullable=True)  # [min_lng, min_lat, max_lng, max_lat]
    resolution_m = Column(Float, nullable=True)  # GSD in meters/pixel
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    file_size_bytes = Column(Integer, nullable=True)
    validation_status = Column(String(32), default="PENDING")  # VALID, WARNING, INVALID, PENDING
    validation_errors_json = Column(Text, default="[]")
    metadata_json = Column(Text, default="{}")
    uploaded_at = Column(DateTime, default=datetime.datetime.utcnow)

    project = relationship("SurveyProject", back_populates="datasets")


class ProcessingRun(Base):
    """
    Tracks distinct AI inference / GIS processing executions (P3 Item 24 & P4 Item 27).
    """
    __tablename__ = "processing_runs"

    id = Column(String(64), primary_key=True, default=lambda: f"RUN-{uuid.uuid4().hex[:8]}")
    project_id = Column(String(64), ForeignKey("survey_projects.id"), nullable=False, index=True)
    run_number = Column(Integer, default=1)
    status = Column(String(64), default="VALIDATING_INPUTS")
    # Status progression: VALIDATING_INPUTS, PREPROCESSING, MODEL_NOT_CONFIGURED, VECTORIZING, TOPOLOGY_VALIDATION, GIS_COMPARISON, COMPLETE, FAILED
    parcel_model_version = Column(String(64), default="unet-cadastral-pending")
    feature_model_version = Column(String(64), default="segformer-bld-pending")
    road_model_version = Column(String(64), default="deeplab-road-pending")
    parameters_json = Column(Text, default="{}")
    warnings_json = Column(Text, default="[]")
    errors_json = Column(Text, default="[]")
    outputs_json = Column(Text, default="{}")
    started_at = Column(DateTime, default=datetime.datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    project = relationship("SurveyProject", back_populates="processing_runs")


class ProjectValidationSettings(Base):
    """
    Configurable metric survey tolerances per project (P2 Item 18).
    """
    __tablename__ = "project_validation_settings"

    id = Column(String(64), primary_key=True, default=lambda: f"SET-{uuid.uuid4().hex[:8]}")
    project_id = Column(String(64), ForeignKey("survey_projects.id"), nullable=False, unique=True)
    snap_tolerance_m = Column(Float, default=0.15)  # Snapping tolerance in meters
    gnss_tolerance_m = Column(Float, default=0.30)  # Max allowed GNSS RTK RMSE
    min_overlap_sqm = Column(Float, default=2.0)    # Overlap area threshold
    min_gap_m = Column(Float, default=0.20)          # Minimum gap distance threshold
    sliver_threshold_sqm = Column(Float, default=12.0)  # Maximum sliver polygon area
    boundary_displacement_warning_m = Column(Float, default=0.30)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    project = relationship("SurveyProject", back_populates="validation_settings")


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
    project_id = Column(String(64), ForeignKey("survey_projects.id"), nullable=False, index=True)
    survey_number = Column(String(128), nullable=False)
    ward = Column(String(64), default="Ward 01")
    zone = Column(String(64), default="Zone 01")
    
    # Geometries: ai_geometry is raw AI output; corrected is surveyor edit; current is active
    existing_geometry_json = Column(Text, nullable=False)
    ai_geometry_json = Column(Text, nullable=False)
    corrected_geometry_json = Column(Text, nullable=True)
    current_geometry_json = Column(Text, nullable=True)
    ground_truth_geometry_json = Column(Text, nullable=True)
    validation_metrics_json = Column(Text, default="{}")
    
    existing_area = Column(Float, default=0.0)
    ai_area = Column(Float, default=0.0)
    confidence = Column(Float, default=0.0)
    boundary_confidence = Column(Float, default=0.0)
    building_confidence = Column(Float, default=0.0)
    perimeter = Column(Float, default=0.0)
    boundary_displacement = Column(Float, default=0.0)
    
    status = Column(String(64), default="ai_preliminary")  # verified, ai_preliminary, requires_review, field_verification, rejected, corrected
    conflict_type = Column(String(64), nullable=True)
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
    history = relationship("ParcelHistory", back_populates="parcel", cascade="all, delete-orphan")


class ParcelHistory(Base):
    """
    Immutable versioned audit trail for cadastral parcels (P3 Item 25 & P5 Item 33).
    """
    __tablename__ = "parcel_history"

    id = Column(String(64), primary_key=True, default=lambda: f"AUD-{uuid.uuid4().hex[:8]}")
    parcel_id = Column(String(64), ForeignKey("parcels.id"), nullable=False, index=True)
    project_id = Column(String(64), nullable=False, index=True)
    version_number = Column(Integer, default=1)
    stage = Column(String(64), nullable=False)  # AI_GENERATED, REVIEW_STARTED, GEOMETRY_EDITED, FIELD_CHECKED, VERIFIED
    changed_by = Column(String(128), nullable=False)
    geometry_json = Column(Text, nullable=False)
    area_sqm = Column(Float, default=0.0)
    change_reason = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    parcel = relationship("Parcel", back_populates="history")


class Building(Base):
    """
    Dedicated structural building model separated from generic features (P3 Item 22).
    Attributes remain null/unknown unless actually measured, calculated, or inferred.
    """
    __tablename__ = "buildings"

    id = Column(String(64), primary_key=True, index=True)
    project_id = Column(String(64), ForeignKey("survey_projects.id"), nullable=False, index=True)
    parcel_id = Column(String(64), nullable=True, index=True)
    structure_type = Column(String(64), nullable=True, default=None)
    height_m = Column(Float, nullable=True, default=None)
    height_provenance = Column(String(32), default="unknown")  # unknown, measured, estimated, inferred
    floors = Column(Integer, nullable=True, default=None)
    floors_provenance = Column(String(32), default="unknown")
    roof_style = Column(String(64), nullable=True, default=None)
    roof_provenance = Column(String(32), default="unknown")
    footprint_area_sqm = Column(Float, default=0.0)
    elevation_asl_m = Column(Float, nullable=True, default=None)
    confidence = Column(Float, nullable=True, default=None)
    has_encroachment = Column(Boolean, default=False)
    encroachment_distance_m = Column(Float, default=0.0)
    geometry_json = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    project = relationship("SurveyProject", back_populates="buildings")


class Road(Base):
    """
    Dedicated road infrastructure corridor model (P3 Item 22).
    Attributes remain null/unknown unless measured from input data.
    """
    __tablename__ = "roads"

    id = Column(String(64), primary_key=True, index=True)
    project_id = Column(String(64), ForeignKey("survey_projects.id"), nullable=False, index=True)
    road_name = Column(String(255), nullable=True, default=None)
    width_m = Column(Float, nullable=True, default=None)
    surface_type = Column(String(64), nullable=True, default=None)
    length_m = Column(Float, default=0.0)
    geometry_json = Column(Text, nullable=False)  # LineString coordinates
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    project = relationship("SurveyProject", back_populates="roads")


class TopologyIssue(Base):
    """
    Explicit topology validation issue with severity and proposed fix (P7 Item 41).
    """
    __tablename__ = "topology_issues"

    id = Column(String(64), primary_key=True, default=lambda: f"TOP-{uuid.uuid4().hex[:8]}")
    project_id = Column(String(64), ForeignKey("survey_projects.id"), nullable=False, index=True)
    parcel_id = Column(String(64), nullable=True)
    related_parcel_id = Column(String(64), nullable=True)
    issue_type = Column(String(64), nullable=False)  # overlap, gap, sliver, self_intersection, unclosed_ring, encroachment
    severity = Column(String(32), default="WARNING")  # INFO, WARNING, HIGH, CRITICAL
    description = Column(Text, nullable=False)
    geometry_json = Column(Text, nullable=False)
    suggested_fix_json = Column(Text, nullable=True)
    status = Column(String(32), default="unresolved")  # unresolved, in_review, resolved
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    project = relationship("SurveyProject", back_populates="topology_issues")


class DetectedFeature(Base):
    __tablename__ = "detected_features"

    id = Column(String(64), primary_key=True, index=True)
    project_id = Column(String(64), ForeignKey("survey_projects.id"), nullable=False)
    feature_type = Column(String(64), nullable=False)  # building, road, parcel_boundary, fence
    confidence = Column(Float, default=0.0)
    area = Column(Float, default=0.0)
    geometry_json = Column(Text, nullable=False)
    layer_name = Column(String(64), default="features")
    source_model = Column(String(64), nullable=True)
    properties_json = Column(Text, default="{}")
    status = Column(String(64), default="pending")
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
    status = Column(String(64), default="unresolved")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    project = relationship("SurveyProject", back_populates="conflicts")


class GNSSControlPoint(Base):
    __tablename__ = "gnss_control_points"

    id = Column(String(64), primary_key=True, index=True)
    project_id = Column(String(64), ForeignKey("survey_projects.id"), nullable=False)
    point_id = Column(String(64), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    elevation_m = Column(Float, default=0.0)
    point_type = Column(String(64), default="CORS_RTK")
    surveyed_lat = Column(Float, nullable=True)
    surveyed_lng = Column(Float, nullable=True)
    horizontal_error_m = Column(Float, nullable=True)
    nearest_parcel_id = Column(String(64), nullable=True)
    status = Column(String(32), default="PENDING")  # PASSED, FAILED, PENDING
    network_name = Column(String(128), default="TN-CORS-RTK")
    description = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    project = relationship("SurveyProject", back_populates="gnss_points")


class Verification(Base):
    __tablename__ = "verifications"

    id = Column(String(64), primary_key=True, index=True)
    project_id = Column(String(64), ForeignKey("survey_projects.id"), nullable=False)
    parcel_id = Column(String(64), nullable=False)
    surveyor_name = Column(String(128), nullable=False)
    status = Column(String(64), default="verified")
    notes = Column(Text, default="")
    checklist_json = Column(Text, default="{}")
    verified_at = Column(DateTime, default=datetime.datetime.utcnow)


class User(Base):
    """
    User account model supporting strictly 3 roles: ADMIN, GIS_ANALYST, SURVEYOR.
    """
    __tablename__ = "users"

    id = Column(String(64), primary_key=True, default=lambda: f"USR-{uuid.uuid4().hex[:8]}")
    full_name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(32), nullable=False, default="SURVEYOR")  # ADMIN, GIS_ANALYST, SURVEYOR
    organization = Column(String(255), default="Tamil Nadu Survey & Land Records")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    last_login = Column(DateTime, nullable=True)

    memberships = relationship("ProjectMember", back_populates="user", cascade="all, delete-orphan")


class ProjectMember(Base):
    """
    Association between users and specific survey projects with assigned role.
    """
    __tablename__ = "project_members"

    id = Column(String(64), primary_key=True, default=lambda: f"MEM-{uuid.uuid4().hex[:8]}")
    project_id = Column(String(64), ForeignKey("survey_projects.id"), nullable=False, index=True)
    user_id = Column(String(64), ForeignKey("users.id"), nullable=False, index=True)
    role = Column(String(32), nullable=False)  # GIS_ANALYST, SURVEYOR
    assigned_at = Column(DateTime, default=datetime.datetime.utcnow)
    assigned_by = Column(String(64), default="system")

    project = relationship("SurveyProject", back_populates="members")
    user = relationship("User", back_populates="memberships")


class AuditLog(Base):
    """
    Immutable audit trail for all cadastral and platform operations.
    """
    __tablename__ = "audit_logs"

    id = Column(String(64), primary_key=True, default=lambda: f"LOG-{uuid.uuid4().hex[:8]}")
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    user_id = Column(String(64), nullable=True)
    user_name = Column(String(255), nullable=False, default="System")
    role = Column(String(32), nullable=False, default="ADMIN")
    project_id = Column(String(64), nullable=True, index=True)
    feature_id = Column(String(128), nullable=True)
    action = Column(String(128), nullable=False)
    previous_state = Column(Text, nullable=True)
    new_state = Column(Text, nullable=True)
    reason_notes = Column(Text, nullable=True)

