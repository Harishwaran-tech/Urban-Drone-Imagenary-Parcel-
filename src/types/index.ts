export type ParcelStatus =
  | 'AI_GENERATED'
  | 'NEEDS_ANALYST_REVIEW'
  | 'ANALYST_CORRECTED'
  | 'READY_FOR_SURVEY_REVIEW'
  | 'FIELD_CHECK_REQUIRED'
  | 'CORRECTION_REQUESTED'
  | 'REJECTED'
  | 'VERIFIED'
  | 'verified'
  | 'ai_preliminary'
  | 'requires_review'
  | 'field_verification'
  | 'rejected'
  | 'corrected';

export type FeatureStatus =
  | 'AI_GENERATED'
  | 'NEEDS_ANALYST_REVIEW'
  | 'ANALYST_CORRECTED'
  | 'READY_FOR_SURVEY_REVIEW'
  | 'FIELD_CHECK_REQUIRED'
  | 'CORRECTION_REQUESTED'
  | 'REJECTED'
  | 'VERIFIED';

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ConflictType =
  | 'boundary_mismatch'
  | 'area_mismatch'
  | 'overlap'
  | 'gap'
  | 'self_intersection'
  | 'missing_parcel'
  | 'new_structure'
  | 'building_encroachment'
  | 'boundary_displacement';

export type ThreeDViewMode = 'survey' | 'analysis' | 'presentation';

export type TopologyStatus = 'valid' | 'invalid';

export type VerificationStatus =
  | 'not_reviewed'
  | 'under_review'
  | 'verified'
  | 'field_verification_required';

export type ProjectStatus =
  | 'created'
  | 'data_uploaded'
  | 'ai_processing'
  | 'analysis_complete'
  | 'under_review'
  | 'field_verification'
  | 'completed';

export type ConfidenceLevel = 'very_high' | 'high' | 'medium' | 'low';

// Coordinate systems
export type LocalPoint = { x: number; y: number; lat?: number; lng?: number };
export type Polygon = LocalPoint[];
export type GeoCoordinate = [number, number]; // [longitude, latitude] as per GeoJSON standard
export type GeoPolygonCoordinates = GeoCoordinate[][]; // Outer ring + holes

export interface GeoJSONGeometry {
  type: 'Point' | 'LineString' | 'Polygon' | 'MultiPolygon';
  coordinates: any;
}

export interface GeoJSONFeature<P = Record<string, any>> {
  type: 'Feature';
  id?: string | number;
  geometry: GeoJSONGeometry;
  properties: P;
}

export interface GeoJSONFeatureCollection<P = Record<string, any>> {
  type: 'FeatureCollection';
  features: GeoJSONFeature<P>[];
  crs?: {
    type: string;
    properties: { name: string };
  };
}

export interface Parcel {
  id: string;
  surveyNumber: string;
  ward: string;
  zone: string;
  existingGeometry: Polygon;
  aiGeometry: Polygon;
  existingArea: number; // m²
  aiArea: number; // m²
  confidence: number; // 0-100
  boundaryConfidence: number;
  buildingConfidence: number;
  perimeter: number; // m
  boundaryDisplacement: number; // m
  status: ParcelStatus;
  conflictType: ConflictType | null;
  priority: Priority;
  topologyStatus: TopologyStatus;
  verificationStatus: VerificationStatus;
  topologyIssues: string[];
  notes: string;
  recommendation: string;
  conflictReasons: string[];
  assignedSurveyor: string | null;
  // field verification checklist
  checklist: {
    boundaryVerified: boolean;
    existingRecordChecked: boolean;
    gnssCollected: boolean;
    buildingChecked: boolean;
    neighborChecked: boolean;
  };
  hasBuilding: boolean;
  gnssPointIds: string[];
  // 3D Digital Twin properties
  elevation?: number; // Ground elevation in meters ASL
  buildingHeight?: number; // Extrusion height in meters
  floors?: number;
  roofColor?: string;
  buildingType?: 'residential' | 'commercial' | 'industrial' | 'civic';
  landUse?: string;
  predictedBy?: string;
  createdOn?: string;
  isIssue?: boolean;
  hasExistingBoundary?: boolean;
  hasAiBoundary?: boolean;
  overlapArea?: number; // m²
  encroachmentDistance?: number; // m
  gapDistance?: number; // m
}

export interface Building {
  id: string;
  geometry: Polygon;
  area: number;
  height: number; // m
  parcelId: string | null;
  type: string;
  floors?: number;
  roofColor?: string;
  elevation?: number;
  roofType?: 'flat_parapet' | 'gable' | 'hip' | 'shed' | 'flat';
  isHeightEstimated?: boolean;
  levels?: number;
  wallMaterial?: string;
  facadeColor?: string;
  heightProvenance?: 'measured' | 'estimated' | 'inferred';
  floorsProvenance?: 'measured' | 'estimated' | 'inferred';
  roofProvenance?: 'measured' | 'estimated' | 'inferred';
}

export interface Road {
  id: string;
  path: LocalPoint[];
  name: string;
  width: number;
}

export interface GNSSPoint {
  id: string;
  x: number;
  y: number;
  latitude: number;
  longitude: number;
  accuracy: number; // cm
  surveyDate: string;
  parcelId: string;
}

export interface GTPoint {
  id: string;
  x: number;
  y: number;
  latitude: number;
  longitude: number;
  type: 'boundary_corner' | 'monument' | 'control_benchmark';
  verifiedBy: string;
  parcelId?: string;
}

export interface TopologyIssue {
  id: string;
  type: 'overlap' | 'gap' | 'self_intersection' | 'unclosed';
  parcelIds: string[];
  description: string;
  repaired: boolean;
}

export interface Project {
  id: string;
  name: string;
  surveyArea: string;
  district: string;
  state: string;
  surveyDate: string;
  status: ProjectStatus;
  progress: number;
  areaKm2: number;
  parcelsDetected: number;
  highConfidence: number;
  reviewRequired: number;
  fieldVerification: number;
  topologyErrors: number;
  avgConfidence: number;
  totalParcels: number;
  verifiedParcels: number;
  createdAt: string;
  gnssPointsCount: number;
  center?: [number, number]; // [lat, lng]
  zoom?: number;
  droneImage?: string | null;
}

export type UserRole = 'ADMIN' | 'GIS_ANALYST' | 'SURVEYOR';

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  organization: string;
  isActive: boolean;
  lastLogin?: string | null;
  createdAt?: string;
  avatar?: string;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  name: string;
  email: string;
  role: 'GIS_ANALYST' | 'SURVEYOR';
  assignedAt?: string;
  assignedBy?: string;
}

export interface AuditLogRecord {
  id: string;
  timestamp: string;
  userId?: string | null;
  userName: string;
  role: string;
  projectId?: string | null;
  featureId?: string | null;
  action: string;
  previousState?: string | null;
  newState?: string | null;
  reasonNotes?: string | null;
}

export interface Surveyor {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string;
}

export interface VerificationRecord {
  id: string;
  parcelId: string;
  surveyor: string;
  date: string;
  status: VerificationStatus;
  notes: string;
}

export interface AppNotification {
  id: string;
  type: 'info' | 'warning' | 'success' | 'error';
  title: string;
  message: string;
  time: string;
  read: boolean;
}

export interface LayerState {
  droneOrthomosaic: boolean;
  satelliteImagery: boolean;
  streetMap: boolean;
  aiParcelBoundaries: boolean;
  existingCadastralParcels: boolean;
  buildings: boolean;
  roads: boolean;
  dsm: boolean;
  dtm: boolean;
  gnssPoints: boolean;
  conflictAreas: boolean;
  lulc?: boolean;
  // 3D Specific layers
  threeDBuildings?: boolean;
  threeDTerrain?: boolean;
  lotLabels?: boolean;
  sunShadows?: boolean;
  waterCanal?: boolean;
}

export type WebGISViewMode = 'webgis' | 'cad_inspector' | 'split_compare' | '3d_twin';

export type PageId =
  | 'dashboard'
  | 'projects'
  | 'users'
  | 'audit-logs'
  | 'new-survey'
  | 'ai-processing'
  | 'cadastral-map'
  | 'conflicts'
  | 'field-verification'
  | 'topology'
  | 'reports'
  | 'settings'
  | 'outputs';
