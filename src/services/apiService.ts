/**
 * CadastraAI API Service
 * Manages HTTP communication between React Frontend and FastAPI Backend.
 */

export const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000';

export interface BackendHealthResponse {
  status: string;
  service: string;
  version: string;
  database: {
    type: string;
    connected: boolean;
  };
  deep_learning: {
    torch_available: boolean;
    cuda_available: boolean;
    device: string;
    model_loaded: boolean;
    inference_mode: string;
  };
  georeferencing: {
    default_crs: string;
    anchor_city: string;
    anchor_coordinates: [number, number];
  };
}

export interface BackendUploadResponse {
  status: string;
  survey_id: string;
  filename: string;
  size_bytes: number;
  message: string;
}

export interface BackendAnalysisResponse {
  survey_id: string;
  inference_mode: string;
  device: string;
  parcels_geojson: any;
  buildings_geojson: any;
  conflicts: any[];
  stats: {
    total_parcels: number;
    high_confidence: number;
    review_required: number;
    field_verification: number;
    topology_errors: number;
    buildings_detected: number;
    avg_confidence: number;
  };
  processing_steps: { step: string; status: string; detail: string }[];
  raw_parcels?: any[];
  raw_buildings?: any[];
  disclaimer: string;
}

export const apiService = {
  /**
   * Health check to detect if FastAPI is running and whether PyTorch / PostGIS is active.
   */
  async checkHealth(): Promise<BackendHealthResponse> {
    const res = await fetch(`${API_BASE_URL}/api/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Backend returned status ${res.status}`);
    }
    return res.json();
  },

  /**
   * Uploads aerial/orthomosaic drone imagery via multipart form data.
   */
  async uploadSurveyImagery(
    file: File,
    metadata?: { name?: string; survey_area?: string; district?: string; state?: string }
  ): Promise<BackendUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (metadata?.name) formData.append('name', metadata.name);
    if (metadata?.survey_area) formData.append('survey_area', metadata.survey_area);
    if (metadata?.district) formData.append('district', metadata.district);
    if (metadata?.state) formData.append('state', metadata.state);

    const res = await fetch(`${API_BASE_URL}/api/survey/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
      throw new Error(err.detail || 'Failed to upload imagery to backend');
    }
    return res.json();
  },

  /**
   * Triggers the full End-to-End AI Deep Learning & GIS Vectorization pipeline.
   */
  async runAIAnalysis(file?: File, surveyId?: string): Promise<BackendAnalysisResponse> {
    const formData = new FormData();
    if (file) {
      formData.append('file', file);
    }
    if (surveyId) {
      formData.append('survey_id', surveyId);
    }

    const res = await fetch(`${API_BASE_URL}/api/survey/analyze`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Analysis failed' }));
      throw new Error(err.detail || 'AI Analysis failed on backend');
    }
    return res.json();
  },

  /**
   * Submits surveyor field verification record for a feature.
   */
  async verifyFeature(
    featureId: string,
    surveyorName = 'Ravi Kumar',
    notes = '',
    checklist?: Record<string, boolean>
  ) {
    const res = await fetch(`${API_BASE_URL}/api/features/${featureId}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        surveyor_name: surveyorName,
        status: 'verified',
        notes,
        checklist,
      }),
    });
    if (!res.ok) {
      throw new Error(`Failed to verify feature ${featureId}`);
    }
    return res.json();
  },

  /**
   * Rejects an AI predicted boundary proposal.
   */
  async rejectFeature(featureId: string, reason = '', surveyorName = 'Ravi Kumar') {
    const res = await fetch(`${API_BASE_URL}/api/features/${featureId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason,
        surveyor_name: surveyorName,
      }),
    });
    if (!res.ok) {
      throw new Error(`Failed to reject feature ${featureId}`);
    }
    return res.json();
  },

  /**
   * Fetches detected cadastral conflicts.
   */
  async getConflicts(projectId?: string) {
    const url = new URL(`${API_BASE_URL}/api/conflicts`);
    if (projectId) url.searchParams.append('project_id', projectId);

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      throw new Error('Failed to fetch conflicts');
    }
    return res.json();
  },
};
