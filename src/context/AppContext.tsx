import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type {
  Parcel,
  Building,
  Road,
  GNSSPoint,
  TopologyIssue,
  Project,
  Surveyor,
  AppNotification,
  LayerState,
  PageId,
  ParcelStatus,
  VerificationStatus,
} from '@/types';
import {
  generateParcels,
  generateBuildings,
  generateRoads,
  generateGNSSPoints,
  generateTopologyIssues,
  generateProjects,
  generateNotifications,
  surveyors,
} from '@/data/mockData';

interface AppContextValue {
  // Auth
  isAuthenticated: boolean;
  currentUser: Surveyor | null;
  login: (email: string, password: string) => boolean;
  logout: () => void;

  // Navigation
  currentPage: PageId;
  setCurrentPage: (page: PageId) => void;

  // Project
  projects: Project[];
  activeProject: Project | null;
  setActiveProjectId: (id: string) => void;
  createProject: (data: Partial<Project>) => Project;
  getProjectCenter: () => [number, number];

  // Uploaded data
  uploadedImage: string | null;
  uploadedImageFile: File | null;
  imageBounds: [[number, number], [number, number]] | null;
  setImageBounds: (bounds: [[number, number], [number, number]] | null) => void;
  setUploadedImage: (dataUrl: string | null, file: File | null, customBounds?: [[number, number], [number, number]]) => void;
  analysisResult: import('@/services/AIService').AIAnalysisOutput | null;
  setAnalysisResult: (result: import('@/services/AIService').AIAnalysisOutput | null) => void;
  isRealAnalysis: boolean;
  setIsRealAnalysis: (v: boolean) => void;

  // Data
  parcels: Parcel[];
  buildings: Building[];
  roads: Road[];
  gnssPoints: GNSSPoint[];
  topologyIssues: TopologyIssue[];
  surveyors: Surveyor[];
  notifications: AppNotification[];

  // Map state
  selectedParcelId: string | null;
  setSelectedParcelId: (id: string | null) => void;
  layers: LayerState;
  toggleLayer: (layer: keyof LayerState) => void;
  setLayerVisibility: (layer: keyof LayerState, visible: boolean) => void;
  orthoOpacity: number;
  setOrthoOpacity: (opacity: number) => void;
  viewMode: import('@/types').WebGISViewMode;
  setViewMode: (mode: import('@/types').WebGISViewMode) => void;
  compareSlider: number; // 0 = existing, 100 = AI
  setCompareSlider: (v: number) => void;
  compareMode: boolean;
  setCompareMode: (v: boolean) => void;
  basemapMode: 'satellite' | 'street';
  setBasemapMode: (m: 'satellite' | 'street') => void;

  // Notifications
  markNotificationRead: (id: string) => void;
  unreadCount: number;

  // Parcel actions
  updateParcel: (id: string, updates: Partial<Parcel>) => void;
  acceptAIBoundary: (id: string) => void;
  rejectParcel: (id: string) => void;
  requestFieldVerification: (id: string) => void;
  repairTopology: (id: string) => void;
  submitVerification: (id: string, notes: string, checklist: Parcel['checklist']) => void;
  assignSurveyor: (id: string, surveyorName: string) => void;
  updateChecklistItem: (id: string, item: keyof Parcel['checklist'], value: boolean) => void;

  // Settings
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;

  // Search
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchResults: Parcel[];
}

export interface AppSettings {
  highConfidenceThreshold: number;
  reviewThreshold: number;
  fieldVerificationThreshold: number;
  showGrid: boolean;
  showCoordinates: boolean;
  enableNotifications: boolean;
  defaultBasemap: 'satellite' | 'street';
}

const defaultLayers: LayerState = {
  droneOrthomosaic: true,
  satelliteImagery: true,
  streetMap: false,
  aiParcelBoundaries: true,
  existingCadastralParcels: true,
  buildings: true,
  roads: true,
  dsm: false,
  dtm: false,
  gnssPoints: true,
  conflictAreas: true,
};

const defaultSettings: AppSettings = {
  highConfidenceThreshold: 90,
  reviewThreshold: 70,
  fieldVerificationThreshold: 70,
  showGrid: true,
  showCoordinates: true,
  enableNotifications: true,
  defaultBasemap: 'satellite',
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [currentUser, setCurrentUser] = useState<Surveyor | null>({
    id: 'S001',
    name: 'Drone GIS Cell',
    email: 'gis.cell@landauthority.tn.gov.in',
    role: 'Tamil Nadu Land Authority',
    avatar: 'TN',
  });
  const [currentPage, setCurrentPage] = useState<PageId>('cadastral-map');

  const [projects, setProjects] = useState<Project[]>(generateProjects);
  const [activeProjectId, setActiveProjectIdState] = useState<string>('PRJ-001');
  const activeProject = projects.find(p => p.id === activeProjectId) ?? (projects[0] || null);

  const [parcels, setParcels] = useState<Parcel[]>(() => generateParcels('TN-CHN-W42'));
  const [buildings, setBuildings] = useState<Building[]>(() => generateBuildings(generateParcels('TN-CHN-W42')));
  const [roads] = useState<Road[]>(() => generateRoads());
  const [gnssPoints] = useState<GNSSPoint[]>(() => generateGNSSPoints(generateParcels('TN-CHN-W42')));
  const [topologyIssues, setTopologyIssues] = useState<TopologyIssue[]>(() => generateTopologyIssues(generateParcels('TN-CHN-W42')));
  const [notifications, setNotifications] = useState<AppNotification[]>(generateNotifications);

  // Uploaded image + analysis state
  const [uploadedImage, setUploadedImageState] = useState<string | null>('/drone_orthomosaic_ward42.jpg');
  const [uploadedImageFile, setUploadedImageFile] = useState<File | null>(null);
  const [imageBounds, setImageBounds] = useState<[[number, number], [number, number]] | null>(null);
  const [analysisResult, setAnalysisResultState] = useState<import('@/services/AIService').AIAnalysisOutput | null>(null);
  const [isRealAnalysis, setIsRealAnalysis] = useState(false);

  const [selectedParcelId, setSelectedParcelId] = useState<string | null>('TN-CHN-W42-000184');
  const [layers, setLayers] = useState<LayerState>(defaultLayers);
  const [orthoOpacity, setOrthoOpacity] = useState<number>(100);
  const [viewMode, setViewMode] = useState<import('@/types').WebGISViewMode>('webgis');
  const [compareSlider, setCompareSlider] = useState(50);
  const [compareMode, setCompareMode] = useState(false);
  const [basemapMode, setBasemapMode] = useState<'satellite' | 'street'>('satellite');

  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [searchQuery, setSearchQuery] = useState('');

  const login = useCallback((email?: string, _password?: string) => {
    setIsAuthenticated(true);
    const cleanEmail = email && email.trim() ? email.trim() : 'gis.cell@landauthority.tn.gov.in';
    const namePart = cleanEmail.includes('@') ? cleanEmail.split('@')[0] : cleanEmail;
    const formattedName = namePart.replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    setCurrentUser({
      id: 'S001',
      name: formattedName || 'Drone GIS Cell',
      email: cleanEmail,
      role: 'Tamil Nadu Land Authority',
      avatar: (formattedName.slice(0, 2) || 'TN').toUpperCase(),
    });
    return true;
  }, []);

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    setCurrentPage('dashboard');
  }, []);

  const setActiveProjectId = useCallback((id: string) => {
    setActiveProjectIdState(id);
    const p = projects.find(item => item.id === id);
    const prefix = id === 'PRJ-001' ? 'TN-CHN-W42' : id === 'PRJ-002' ? 'RJ-JPR-Z04' : 'RJ-AJM-S12';
    const newParcels = generateParcels(prefix);
    setParcels(newParcels);
    setBuildings(generateBuildings(newParcels));
    setSelectedParcelId(newParcels[0]?.id || null);
  }, [projects]);

  const getProjectCenter = useCallback((): [number, number] => {
    if (activeProject?.center && Array.isArray(activeProject.center) && activeProject.center.length === 2) {
      return activeProject.center;
    }
    return [13.0827, 80.2707];
  }, [activeProject]);

  const createProject = useCallback((data: Partial<Project>): Project => {
    const newId = `PRJ-${String(Date.now()).slice(-4)}`;
    const center: [number, number] = data.center || [26.9124, 75.7873];
    const newProject: Project = {
      id: newId,
      name: data.name || 'Urban Cadastral Survey',
      surveyArea: data.surveyArea || 'Zone 01',
      district: data.district || 'Jaipur',
      state: data.state || 'Rajasthan',
      surveyDate: data.surveyDate || new Date().toISOString().split('T')[0],
      status: 'data_uploaded',
      progress: 25,
      areaKm2: data.areaKm2 || 1.85,
      parcelsDetected: 0,
      highConfidence: 0,
      reviewRequired: 0,
      fieldVerification: 0,
      topologyErrors: 0,
      avgConfidence: 0,
      totalParcels: 0,
      verifiedParcels: 0,
      createdAt: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      gnssPointsCount: 48,
      center,
      zoom: data.zoom || 17,
      droneImage: data.droneImage || null,
    };

    setProjects(prev => [newProject, ...prev]);
    setActiveProjectIdState(newId);
    return newProject;
  }, []);

  const setUploadedImage = useCallback((
    dataUrl: string | null,
    file: File | null,
    customBounds?: [[number, number], [number, number]]
  ) => {
    setUploadedImageState(dataUrl);
    setUploadedImageFile(file);
    if (customBounds) {
      setImageBounds(customBounds);
    } else if (dataUrl) {
      // Calculate bounds anchored around current project center
      const center = getProjectCenter();
      const latSpan = 0.007; // ~770m
      const lngSpan = 0.008; // ~790m
      setImageBounds([
        [center[0] - latSpan / 2, center[1] - lngSpan / 2],
        [center[0] + latSpan / 2, center[1] + lngSpan / 2],
      ]);
    } else {
      setImageBounds(null);
    }
  }, [getProjectCenter]);

  const setAnalysisResult = useCallback((result: import('@/services/AIService').AIAnalysisOutput | null) => {
    setAnalysisResultState(result);
    if (result) {
      // Replace parcels and buildings with real analysis results
      setParcels(result.parcels);
      setBuildings(result.buildings);

      // Update active project metrics
      const highConf = result.parcels.filter(p => p.confidence >= 80).length;
      const revReq = result.parcels.filter(p => p.status === 'requires_review').length;
      const fieldVer = result.parcels.filter(p => p.status === 'field_verification').length;
      const topErrors = result.parcels.filter(p => p.topologyStatus === 'invalid').length;
      const avgConf = result.parcels.length > 0
        ? Math.round(result.parcels.reduce((s, p) => s + p.confidence, 0) / result.parcels.length * 10) / 10
        : 85;

      setProjects(prev => prev.map(p => p.id === activeProjectId ? {
        ...p,
        status: 'analysis_complete',
        progress: 85,
        parcelsDetected: result.parcels.length,
        highConfidence: highConf,
        reviewRequired: revReq,
        fieldVerification: fieldVer,
        topologyErrors: topErrors,
        avgConfidence: avgConf,
        totalParcels: result.parcels.length,
      } : p));

      // Regenerate topology issues for new parcels
      const issues: TopologyIssue[] = [];
      let tid = 1;
      for (const p of result.parcels) {
        if (p.topologyStatus !== 'invalid') continue;
        for (const issue of p.topologyIssues) {
          const type = issue.toLowerCase().includes('overlap') ? 'overlap' :
            issue.toLowerCase().includes('gap') ? 'gap' :
            issue.toLowerCase().includes('self') ? 'self_intersection' : 'unclosed';
          const adjacent = result.parcels.find(pp => pp.id !== p.id &&
            Math.abs(pp.aiGeometry[0].x - p.aiGeometry[0].x) < 120 &&
            Math.abs(pp.aiGeometry[0].y - p.aiGeometry[0].y) < 120);
          issues.push({
            id: `T-${String(tid++).padStart(4, '0')}`,
            type,
            parcelIds: adjacent ? [p.id, adjacent.id] : [p.id],
            description: type === 'overlap' && adjacent ? `Overlap detected between ${p.id} and ${adjacent.id}` : issue,
            repaired: false,
          });
        }
      }
      setTopologyIssues(issues);
    }
  }, [activeProjectId]);

  const toggleLayer = useCallback((layer: keyof LayerState) => {
    setLayers(prev => {
      // For basemaps, make them mutually exclusive
      if (layer === 'satelliteImagery' || layer === 'streetMap') {
        return { ...prev, satelliteImagery: layer === 'satelliteImagery', streetMap: layer === 'streetMap' };
      }
      return { ...prev, [layer]: !prev[layer] };
    });
  }, []);

  const setLayerVisibility = useCallback((layer: keyof LayerState, visible: boolean) => {
    setLayers(prev => ({ ...prev, [layer]: visible }));
  }, []);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const updateParcel = useCallback((id: string, updates: Partial<Parcel>) => {
    setParcels(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  }, []);

  const acceptAIBoundary = useCallback((id: string) => {
    setParcels(prev => prev.map(p => p.id === id ? {
      ...p,
      status: 'verified' as ParcelStatus,
      verificationStatus: 'verified' as VerificationStatus,
      notes: p.notes + '\n[AI Boundary Accepted]',
    } : p));
  }, []);

  const rejectParcel = useCallback((id: string) => {
    setParcels(prev => prev.map(p => p.id === id ? {
      ...p,
      status: 'rejected' as ParcelStatus,
      verificationStatus: 'not_reviewed' as VerificationStatus,
      notes: p.notes + '\n[AI Boundary Rejected]',
    } : p));
  }, []);

  const requestFieldVerification = useCallback((id: string) => {
    setParcels(prev => prev.map(p => p.id === id ? {
      ...p,
      status: 'field_verification' as ParcelStatus,
      verificationStatus: 'field_verification_required' as VerificationStatus,
      notes: p.notes + '\n[Field Verification Requested]',
    } : p));
  }, []);

  const repairTopology = useCallback((id: string) => {
    setParcels(prev => prev.map(p => p.id === id ? {
      ...p,
      topologyStatus: 'valid',
      topologyIssues: [],
    } : p));
    setTopologyIssues(prev => prev.map(t => t.parcelIds.includes(id) ? { ...t, repaired: true } : t));
  }, []);

  const submitVerification = useCallback((id: string, notes: string, checklist: Parcel['checklist']) => {
    setParcels(prev => prev.map(p => p.id === id ? {
      ...p,
      status: 'verified' as ParcelStatus,
      verificationStatus: 'verified' as VerificationStatus,
      checklist,
      notes: notes || p.notes,
    } : p));
  }, []);

  const assignSurveyor = useCallback((id: string, surveyorName: string) => {
    setParcels(prev => prev.map(p => p.id === id ? { ...p, assignedSurveyor: surveyorName } : p));
  }, []);

  const updateChecklistItem = useCallback((id: string, item: keyof Parcel['checklist'], value: boolean) => {
    setParcels(prev => prev.map(p => p.id === id ? { ...p, checklist: { ...p.checklist, [item]: value } } : p));
  }, []);

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);

  // Search: by parcel ID, survey number, ward, zone, status
  const searchResults = searchQuery.trim() === '' ? [] : parcels.filter(p =>
    p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.surveyNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.ward.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.zone.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.status.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const value: AppContextValue = {
    isAuthenticated,
    currentUser,
    login,
    logout,
    currentPage,
    setCurrentPage,
    projects,
    activeProject,
    setActiveProjectId,
    createProject,
    getProjectCenter,
    uploadedImage,
    uploadedImageFile,
    imageBounds,
    setImageBounds,
    setUploadedImage,
    analysisResult,
    setAnalysisResult,
    isRealAnalysis,
    setIsRealAnalysis,
    parcels,
    buildings,
    roads,
    gnssPoints,
    topologyIssues,
    surveyors,
    notifications,
    selectedParcelId,
    setSelectedParcelId,
    layers,
    toggleLayer,
    setLayerVisibility,
    orthoOpacity,
    setOrthoOpacity,
    viewMode,
    setViewMode,
    compareSlider,
    setCompareSlider,
    compareMode,
    setCompareMode,
    basemapMode,
    setBasemapMode,
    markNotificationRead,
    unreadCount,
    updateParcel,
    acceptAIBoundary,
    rejectParcel,
    requestFieldVerification,
    repairTopology,
    submitVerification,
    assignSurveyor,
    updateChecklistItem,
    settings,
    updateSettings,
    searchQuery,
    setSearchQuery,
    searchResults,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
