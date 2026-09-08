/**
 * CadastraAI API Service
 * Manages HTTP communication between React Frontend and FastAPI Backend.
 */

export const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8001';

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

  /**
   * Triggers processing on standard SIH project inputs directory.
   */
  async processProject(projectId: string) {
    const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/process`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to process project' }));
      throw new Error(err.detail?.message || err.detail || 'Processing failed');
    }
    return res.json();
  },

  /**
   * Retrieves live execution stage and progress percentage.
   */
  async getProjectStatus(projectId: string) {
    const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/status`);
    if (!res.ok) throw new Error('Failed to get project status');
    return res.json();
  },

  /**
   * Surveyor verification workflow.
   */
  async verifyParcelWorkflow(
    projectId: string,
    parcelId: string,
    action: 'verify' | 'correct' | 'reject' | 'mark_review',
    surveyorName = 'Licensed Surveyor',
    notes = '',
    checklist?: Record<string, boolean>,
    correctedCoords?: [number, number][]
  ) {
    const token = localStorage.getItem('cadastra_token');
    const role = localStorage.getItem('cadastra_user_role') || 'SURVEYOR';
    const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/parcels/${parcelId}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-User-Role': role,
      },
      body: JSON.stringify({
        action,
        surveyor_name: surveyorName,
        notes,
        checklist,
        corrected_coords: correctedCoords,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Verification action failed' }));
      throw new Error(err.detail || `Failed to update parcel ${parcelId}`);
    }
    return res.json();
  },

  /**
   * GIS Analyst boundary geometry correction.
   */
  async correctParcelBoundary(
    projectId: string,
    parcelId: string,
    coordinates: [number, number][],
    reason: string
  ) {
    const token = localStorage.getItem('cadastra_token');
    const role = localStorage.getItem('cadastra_user_role') || 'GIS_ANALYST';
    const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/parcels/${parcelId}/correct`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-User-Role': role,
      },
      body: JSON.stringify({ coordinates, reason }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to save correction' }));
      throw new Error(err.detail || 'Correction failed');
    }
    return res.json();
  },

  /**
   * GIS Analyst submits parcel to Surveyor review queue.
   */
  async submitParcelForReview(projectId: string, parcelId: string, notes: string) {
    const token = localStorage.getItem('cadastra_token');
    const role = localStorage.getItem('cadastra_user_role') || 'GIS_ANALYST';
    const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/parcels/${parcelId}/submit-review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-User-Role': role,
      },
      body: JSON.stringify({ notes }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to submit parcel' }));
      throw new Error(err.detail || 'Submission failed');
    }
    return res.json();
  },

  /**
   * Authentication APIs
   */
  async login(email: string, password: string) {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Invalid credentials' }));
      throw new Error(err.detail || 'Authentication failed');
    }
    const data = await res.json();
    if (data.token) {
      localStorage.setItem('cadastra_token', data.token);
      localStorage.setItem('cadastra_user_role', data.user.role);
    }
    return data;
  },

  async logout() {
    const token = localStorage.getItem('cadastra_token');
    localStorage.removeItem('cadastra_token');
    localStorage.removeItem('cadastra_user_role');
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {}
  },

  async getMe() {
    const token = localStorage.getItem('cadastra_token');
    const role = localStorage.getItem('cadastra_user_role');
    const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(role ? { 'X-User-Role': role } : {}),
      },
    });
    if (!res.ok) throw new Error('Failed to fetch profile');
    return res.json();
  },

  /**
   * User Management APIs (Admin only)
   */
  async getUsers() {
    const token = localStorage.getItem('cadastra_token');
    const res = await fetch(`${API_BASE_URL}/api/users`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-User-Role': 'ADMIN',
      },
    });
    if (!res.ok) throw new Error('Failed to fetch users');
    return res.json();
  },

  async createUser(data: { fullName: string; email: string; password: string; role: string; organization?: string }) {
    const token = localStorage.getItem('cadastra_token');
    const res = await fetch(`${API_BASE_URL}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-User-Role': 'ADMIN',
      },
      body: JSON.stringify({
        full_name: data.fullName,
        email: data.email,
        password: data.password,
        role: data.role,
        organization: data.organization,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to create user' }));
      throw new Error(err.detail || 'User creation failed');
    }
    return res.json();
  },

  async updateUser(userId: string, data: { fullName?: string; role?: string; organization?: string; isActive?: boolean }) {
    const token = localStorage.getItem('cadastra_token');
    const res = await fetch(`${API_BASE_URL}/api/users/${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-User-Role': 'ADMIN',
      },
      body: JSON.stringify({
        full_name: data.fullName,
        role: data.role,
        organization: data.organization,
        is_active: data.isActive,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to update user' }));
      throw new Error(err.detail || 'User update failed');
    }
    return res.json();
  },

  /**
   * Project Membership & Assignments
   */
  async getProjectMembers(projectId: string) {
    const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/members`);
    if (!res.ok) return [];
    return res.json();
  },

  async assignProjectMember(projectId: string, userId: string, role: string) {
    const token = localStorage.getItem('cadastra_token');
    const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-User-Role': 'ADMIN',
      },
      body: JSON.stringify({ user_id: userId, role }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to assign member' }));
      throw new Error(err.detail || 'Assignment failed');
    }
    return res.json();
  },

  async removeProjectMember(projectId: string, userId: string) {
    const token = localStorage.getItem('cadastra_token');
    const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/members/${userId}`, {
      method: 'DELETE',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-User-Role': 'ADMIN',
      },
    });
    if (!res.ok) throw new Error('Failed to remove assignment');
    return res.json();
  },

  /**
   * Audit Logs API
   */
  async getAuditLogs(params?: { projectId?: string; action?: string; userId?: string }) {
    const token = localStorage.getItem('cadastra_token');
    const role = localStorage.getItem('cadastra_user_role') || 'ADMIN';
    const query = new URLSearchParams();
    if (params?.projectId) query.append('project_id', params.projectId);
    if (params?.action) query.append('action', params.action);
    if (params?.userId) query.append('user_id', params.userId);

    const res = await fetch(`${API_BASE_URL}/api/audit-logs?${query.toString()}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-User-Role': role,
      },
    });
    if (!res.ok) throw new Error('Failed to fetch audit logs');
    return res.json();
  },

  /**
   * Export download URLs for direct browser triggers.
   */
  getExportUrl(projectId: string, format: 'shapefile' | 'pdf' | 'dxf' | 'geojson' | 'kml') {
    return `${API_BASE_URL}/api/projects/${projectId}/export/${format}`;
  },
};

