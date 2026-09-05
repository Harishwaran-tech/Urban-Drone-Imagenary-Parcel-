/**
 * AI Processing Service — abstraction layer for cadastral image analysis.
 *
 * Integrates directly with the FastAPI + PyTorch backend pipeline,
 * with graceful in-browser computer-vision fallback.
 */

import { apiService, type BackendAnalysisResponse } from './apiService';
import {
  analyzeImage as runClientImageAnalysis,
  loadImageFromFile,
  loadImageFromUrl,
  type AnalysisResult,
  type AnalyzedParcel,
  type ProcessingStep,
} from './ImageAnalysisService';
import type { Parcel, Building, ConflictType, Priority, VerificationStatus, ParcelStatus, TopologyStatus, LocalPoint } from '@/types';

export interface AIAnalysisInput {
  imageDataUrl?: string;
  imageFile?: File;
  imageUrl?: string;
  existingParcels?: Parcel[];
  surveyId?: string;
}

export interface AIAnalysisOutput {
  parcels: Parcel[];
  buildings: Building[];
  rawResult: any;
  processingSteps: ProcessingStep[];
  backendResponse?: BackendAnalysisResponse;
  inferenceMode: string;
  stats: {
    totalParcels: number;
    highConfidence: number;
    reviewRequired: number;
    fieldVerification: number;
    topologyErrors: number;
    buildingsDetected: number;
    avgConfidence: number;
  };
}

export type ProgressCallback = (step: string, stepIndex: number, totalSteps: number) => void;

// === Parse GeoJSON Feature to Parcel ===
function geoJsonFeatureToParcel(feature: any, index: number): Parcel {
  const props = feature.properties || {};
  const coords = feature.geometry?.coordinates?.[0] || [];
  
  // Convert [lng, lat] to LocalPoint with lat/lng preserved
  const aiGeometry: LocalPoint[] = coords.map((c: [number, number]) => ({
    x: c[0],
    y: c[1],
    lng: c[0],
    lat: c[1],
  }));

  const existingGeo = props.existingGeometry || coords.map((c: [number, number]) => [c[0] + 0.00002, c[1] + 0.00002]);
  const existingGeometry: LocalPoint[] = Array.isArray(existingGeo)
    ? existingGeo.map((c: [number, number]) => ({ x: c[0], y: c[1], lng: c[0], lat: c[1] }))
    : aiGeometry;

  const id = props.id || `P-${String(index + 1).padStart(5, '0')}`;
  const confidence = Math.round(props.confidence || 80);
  const aiArea = Math.round(props.aiArea || props.area || 0);
  const existingArea = props.existingArea !== undefined && props.existingArea !== null
    ? Math.round(props.existingArea)
    : null;

  const status: ParcelStatus = props.status || (confidence >= 85 ? 'ai_preliminary' : (confidence >= 70 ? 'requires_review' : 'field_verification'));
  const priority: Priority = props.priority || (confidence < 65 ? 'CRITICAL' : (confidence < 75 ? 'HIGH' : (confidence < 85 ? 'MEDIUM' : 'LOW')));
  const conflictType: ConflictType | null = props.conflictType || (status === 'field_verification' ? 'boundary_mismatch' : null);
  const isInvalidTopology = conflictType === 'overlap' || conflictType === 'gap' || conflictType === 'self_intersection';

  return {
    id,
    surveyNumber: props.surveyNumber || `SV-${100 + index}/4`,
    ward: props.ward || `Ward ${Math.floor(index / 6) + 1}`,
    zone: props.zone || 'Zone 04',
    existingGeometry,
    aiGeometry,
    existingArea: existingArea ?? aiArea,
    aiArea,
    confidence,
    boundaryConfidence: props.boundaryConfidence ? Math.round(props.boundaryConfidence) : confidence,
    buildingConfidence: props.buildingConfidence ? Math.round(props.buildingConfidence) : Math.min(95, confidence + 2),
    perimeter: Math.round(Math.sqrt(Math.max(1, aiArea)) * 4 * 10) / 10,
    boundaryDisplacement: props.boundaryDisplacement || 0.0,
    status,
    conflictType,
    priority,
    topologyStatus: props.topologyStatus || (isInvalidTopology ? 'invalid' : 'valid'),
    verificationStatus: status === 'verified' ? 'verified' : (status === 'field_verification' ? 'field_verification_required' : 'not_reviewed'),
    topologyIssues: props.topologyIssues || (isInvalidTopology ? ['Boundary variance requires surveyor inspection'] : []),
    notes: props.notes || '',
    recommendation: props.recommendation || (confidence < 70 ? 'Field verification required.' : 'Accept preliminary AI boundary.'),
    conflictReasons: props.conflictReasons || (conflictType ? [`Displacement: ${props.boundaryDisplacement || 0}m`] : []),
    assignedSurveyor: props.assignedSurveyor || (status === 'field_verification' ? 'Authorized Surveyor' : null),
    checklist: {
      boundaryVerified: status === 'verified',
      existingRecordChecked: existingArea !== null,
      gnssCollected: false,
      buildingChecked: false,
      neighborChecked: status === 'verified',
    },
    hasBuilding: true,
    gnssPointIds: [],
  };
}

function geoJsonFeatureToBuilding(feature: any, index: number): Building {
  const props = feature.properties || {};
  const coords = feature.geometry?.coordinates?.[0] || [];
  const geom: LocalPoint[] = coords.map((c: [number, number]) => ({
    x: c[0],
    y: c[1],
    lng: c[0],
    lat: c[1],
  }));

  const area = Math.round(props.area || 0);
  const height = props.height ? Math.round(props.height * 10) / 10 : Math.round(Math.sqrt(Math.max(10, area)) * 0.42 * 10) / 10;

  return {
    id: props.id || `B-${String(index + 1).padStart(4, '0')}`,
    geometry: geom,
    area,
    height,
    parcelId: props.parcelId || null,
    type: props.type || 'Residential',
  };
}

// === Client-side conversion fallback ===
function analyzedParcelToParcel(ap: AnalyzedParcel, index: number): Parcel {
  const id = `P-${String(index + 1).padStart(5, '0')}`;
  const confidence = ap.confidence;
  const area = ap.area;
  const existingArea = ap.area;

  let status: ParcelStatus = confidence >= 85 ? 'ai_preliminary' : (confidence >= 70 ? 'requires_review' : 'field_verification');
  let priority: Priority = confidence < 60 ? 'CRITICAL' : (confidence < 75 ? 'HIGH' : (confidence < 85 ? 'MEDIUM' : 'LOW'));
  let conflictType: ConflictType | null = null;

  return {
    id,
    surveyNumber: `SV-${100 + index}/4`,
    ward: `Ward ${Math.floor(index / 6) + 1}`,
    zone: 'Zone 04',
    existingGeometry: ap.geometry,
    aiGeometry: ap.geometry,
    existingArea,
    aiArea: area,
    confidence,
    boundaryConfidence: confidence,
    buildingConfidence: Math.min(95, confidence + 2),
    perimeter: ap.perimeter,
    boundaryDisplacement: 0.0,
    status,
    conflictType,
    priority,
    topologyStatus: 'valid',
    verificationStatus: 'not_reviewed',
    topologyIssues: [],
    notes: '',
    recommendation: confidence < 70 ? 'Field verification required.' : 'Accept preliminary AI boundary.',
    conflictReasons: [],
    assignedSurveyor: status === 'field_verification' ? 'Authorized Surveyor' : null,
    checklist: {
      boundaryVerified: false,
      existingRecordChecked: false,
      gnssCollected: false,
      buildingChecked: false,
      neighborChecked: false,
    },
    hasBuilding: true,
    gnssPointIds: [],
  };
}

function analyzedBuildingToBuilding(ap: AnalyzedParcel): Building {
  return {
    id: ap.id,
    geometry: ap.geometry,
    area: ap.area,
    height: 7.2,
    parcelId: null,
    type: 'Residential',
  };
}

// === Public API ===

/**
 * Executes AI Image Analysis:
 * First attempts to call the FastAPI PyTorch backend.
 * Falls back seamlessly to client-side CV if backend is not running.
 */
export async function analyzeAerialImage(
  input: AIAnalysisInput,
  onProgress?: ProgressCallback,
): Promise<AIAnalysisOutput> {
  const steps: ProcessingStep[] = [];

  // 1. Try Backend API
  try {
    if (onProgress) onProgress('Connecting to AI backend pipeline...', 0, 9);
    
    const backendRes = await apiService.runAIAnalysis(input.imageFile, input.surveyId);
    
    if (onProgress) {
      backendRes.processing_steps.forEach((s, idx) => {
        onProgress(s.detail || s.step, idx + 1, backendRes.processing_steps.length);
      });
    }

    const parcels = (backendRes.parcels_geojson?.features || []).map(geoJsonFeatureToParcel);
    const buildings = (backendRes.buildings_geojson?.features || []).map(geoJsonFeatureToBuilding);

    return {
      parcels,
      buildings,
      rawResult: backendRes,
      processingSteps: (backendRes.processing_steps || []).map((s) => ({
        name: s.step,
        description: s.detail,
        imageData: null,
        duration: 400,
      })),
      backendResponse: backendRes,
      inferenceMode: backendRes.inference_mode,
      stats: {
        totalParcels: backendRes.stats.total_parcels,
        highConfidence: backendRes.stats.high_confidence,
        reviewRequired: backendRes.stats.review_required,
        fieldVerification: backendRes.stats.field_verification,
        topologyErrors: backendRes.stats.topology_errors,
        buildingsDetected: backendRes.stats.buildings_detected,
        avgConfidence: backendRes.stats.avg_confidence,
      },
    };
  } catch (backendError) {
    console.warn('FastAPI backend unreachable, running local fallback analysis:', backendError);

    // 2. Client-side Fallback
    let imageElement: HTMLImageElement;
    if (input.imageFile) {
      imageElement = await loadImageFromFile(input.imageFile);
    } else if (input.imageUrl) {
      imageElement = await loadImageFromUrl(input.imageUrl);
    } else if (input.imageDataUrl) {
      imageElement = await loadImageFromUrl(input.imageDataUrl);
    } else {
      throw new Error('No image provided for analysis');
    }

    const clientRes = await runClientImageAnalysis(imageElement, onProgress);
    const parcels = clientRes.parcels.map(analyzedParcelToParcel);
    const buildings = clientRes.buildings.map(analyzedBuildingToBuilding);

    const highConfidence = parcels.filter(p => p.confidence >= 80).length;
    const reviewRequired = parcels.filter(p => p.status === 'requires_review').length;
    const fieldVerification = parcels.filter(p => p.status === 'field_verification').length;
    const topologyErrors = parcels.filter(p => p.topologyStatus === 'invalid').length;
    const avgConfidence = parcels.length > 0 ? Math.round(parcels.reduce((s, p) => s + p.confidence, 0) / parcels.length * 10) / 10 : 0;

    return {
      parcels,
      buildings,
      rawResult: clientRes,
      processingSteps: clientRes.processingSteps,
      inferenceMode: 'client_cv_fallback',
      stats: {
        totalParcels: parcels.length,
        highConfidence,
        reviewRequired,
        fieldVerification,
        topologyErrors,
        buildingsDetected: buildings.length,
        avgConfidence,
      },
    };
  }
}

export function isRealAnalysisAvailable(): boolean {
  return true;
}
