import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type {
  Parcel,
  Building,
  Road,
  GNSSPoint,
  TopologyIssue,
  Project,
  Surveyor,
  User,
  UserRole,
  ProjectMember,
  AuditLogRecord,
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
import {
  type MapPresetKey,
  type BasemapType,
  type SemanticColorMode,
  MAP_PRESETS,
} from '@/utils/mapStyles';

interface AppContextValue {
  // Auth & RBAC
  isAuthenticated: boolean;
  currentUser: (User & { name: string }) | null;
  userRole: UserRole;
  switchRole: (role: UserRole) => void;
  hasPermission: (permission: string) => boolean;
  login: (email?: string, password?: string) => boolean;
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

  // Operational Mode (Demo Sandbox vs Live Survey Project)
  appMode: 'demo' | 'real';
  setAppMode: (mode: 'demo' | 'real') => void;
  isDemoMode: boolean;

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
  addParcel: (parcel: Parcel) => void;
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

  // Advanced Unified Map Controls
  activePreset: import('@/utils/mapStyles').MapPresetKey;
  applyPreset: (presetKey: import('@/utils/mapStyles').MapPresetKey) => void;
  basemapType: import('@/utils/mapStyles').BasemapType;
  setBasemapType: (b: import('@/utils/mapStyles').BasemapType) => void;
  diffMode: boolean;
  setDiffMode: (v: boolean) => void;
  heatmapMode: boolean;
  setHeatmapMode: (v: boolean) => void;
  threeDMode: 'survey' | 'analysis' | 'presentation';
  setThreeDMode: (m: 'survey' | 'analysis' | 'presentation') => void;
  semanticColorMode: import('@/utils/mapStyles').SemanticColorMode;
  setSemanticColorMode: (m: import('@/utils/mapStyles').SemanticColorMode) => void;
  mapCenter: [number, number];
  setMapCenter: (center: [number, number]) => void;
  mapZoom: number;
  setMapZoom: (zoom: number) => void;
  rasterAdjustments: { brightness: number; contrast: number; saturation: number; sharpen: boolean };
  setRasterAdjustments: React.Dispatch<React.SetStateAction<{ brightness: number; contrast: number; saturation: number; sharpen: boolean }>>;
  elevationMode: 'off' | 'hillshade' | 'elevation' | 'slope' | 'ndsm';
  setElevationMode: (m: 'off' | 'hillshade' | 'elevation' | 'slope' | 'ndsm') => void;
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
  droneOrthomosaic: false,
  satelliteImagery: true,
  streetMap: false,
  aiParcelBoundaries: true,
  existingCadastralParcels: true,
  buildings: true,
  roads: true,
  dsm: false,
  dtm: false,
  gnssPoints: false,
  conflictAreas: true,
  lulc: false,
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

export const DEMO_ACCOUNTS: Record<UserRole, User & { name: string }> = {
  ADMIN: {
    id: 'USR-ADMIN-01',
    fullName: 'A. Sharma',
    name: 'A. Sharma',
    email: 'admin@cadastra.ai',
    role: 'ADMIN',
    organization: 'Tamil Nadu Land Survey Directorate',
    isActive: true,
    avatar: 'AS',
  },
  GIS_ANALYST: {
    id: 'USR-ANALYST-01',
    fullName: 'A. Kumar',
    name: 'A. Kumar',
    email: 'analyst@cadastra.ai',
    role: 'GIS_ANALYST',
    organization: 'State Remote Sensing & GIS Cell',
    isActive: true,
    avatar: 'AK',
  },
  SURVEYOR: {
    id: 'USR-SURVEYOR-01',
    fullName: 'R. Senthil',
    name: 'R. Senthil',
    email: 'surveyor@cadastra.ai',
    role: 'SURVEYOR',
    organization: 'Chennai District Survey Office',
    isActive: true,
    avatar: 'RS',
  },
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  // Operational Mode
  const [appMode, setAppModeState] = useState<'demo' | 'real'>(() => {
    return (localStorage.getItem('cadastra_app_mode') as 'demo' | 'real') || 'demo';
  });
  const isDemoMode = appMode === 'demo';

  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const mode = (localStorage.getItem('cadastra_app_mode') as 'demo' | 'real') || 'demo';
    if (mode === 'real') {
      return !!localStorage.getItem('cadastra_auth_token');
    }
    return true;
  });

  const [currentUser, setCurrentUser] = useState<(User & { name: string }) | null>(() => {
    const mode = (localStorage.getItem('cadastra_app_mode') as 'demo' | 'real') || 'demo';
    if (mode === 'real') {
      const token = localStorage.getItem('cadastra_auth_token');
      const savedUser = localStorage.getItem('cadastra_user_data');
      if (token && savedUser) {
        try {
          return JSON.parse(savedUser);
        } catch {
          return null;
        }
      }
      return null;
    }
    const savedRole = (localStorage.getItem('cadastra_user_role') as UserRole) || 'ADMIN';
    return DEMO_ACCOUNTS[savedRole] || DEMO_ACCOUNTS.ADMIN;
  });
  const userRole: UserRole = currentUser?.role || 'ADMIN';
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');

  const [projects, setProjects] = useState<Project[]>(generateProjects);
  const [activeProjectId, setActiveProjectIdState] = useState<string>('PRJ-001');
  const activeProject = projects.find(p => p.id === activeProjectId) ?? (projects[0] || null);

  const [parcels, setParcels] = useState<Parcel[]>(() =>
    appMode === 'demo' ? generateParcels('TN-CHN-W42') : []
  );
  const [buildings, setBuildings] = useState<Building[]>(() =>
    appMode === 'demo' ? generateBuildings(generateParcels('TN-CHN-W42')) : []
  );
  const [roads] = useState<Road[]>(() => generateRoads());
  const [gnssPoints] = useState<GNSSPoint[]>(() =>
    appMode === 'demo' ? generateGNSSPoints(generateParcels('TN-CHN-W42')) : []
  );
  const [topologyIssues, setTopologyIssues] = useState<TopologyIssue[]>(() =>
    appMode === 'demo' ? generateTopologyIssues(generateParcels('TN-CHN-W42')) : []
  );
  const [notifications, setNotifications] = useState<AppNotification[]>(generateNotifications);

  // Uploaded image + analysis state
  const [uploadedImage, setUploadedImageState] = useState<string | null>(() =>
    appMode === 'demo' ? '/drone_orthomosaic_ward42.jpg' : null
  );
  const [uploadedImageFile, setUploadedImageFile] = useState<File | null>(null);
  const [imageBounds, setImageBounds] = useState<[[number, number], [number, number]] | null>(null);
  const [analysisResult, setAnalysisResultState] = useState<import('@/services/AIService').AIAnalysisOutput | null>(null);
  const [isRealAnalysis, setIsRealAnalysis] = useState(false);

  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(() =>
    appMode === 'demo' ? 'TN-CHN-W42-000184' : null
  );
  const [layers, setLayers] = useState<LayerState>(defaultLayers);
  const [orthoOpacity, setOrthoOpacity] = useState<number>(100);
  const [viewMode, setViewMode] = useState<import('@/types').WebGISViewMode>('webgis');
  const [compareSlider, setCompareSlider] = useState(50);
  const [compareMode, setCompareMode] = useState(false);
  const [basemapMode, setBasemapMode] = useState<'satellite' | 'street'>('satellite');

  // Advanced Unified Map Controls
  const [activePreset, setActivePreset] = useState<MapPresetKey>('survey');
  const [basemapType, setBasemapType] = useState<BasemapType>('satellite');
  const [diffMode, setDiffMode] = useState<boolean>(false);
  const [heatmapMode, setHeatmapMode] = useState<boolean>(false);
  const [threeDMode, setThreeDMode] = useState<'survey' | 'analysis' | 'presentation'>('survey');
  const [semanticColorMode, setSemanticColorMode] = useState<SemanticColorMode>('realistic');
  const [mapCenter, setMapCenter] = useState<[number, number]>(() =>
    activeProject?.center && Array.isArray(activeProject.center) && activeProject.center.length === 2
      ? activeProject.center
      : [13.0827, 80.2707]
  );
  const [mapZoom, setMapZoom] = useState<number>(17);
  const [rasterAdjustments, setRasterAdjustments] = useState({
    brightness: 100,
    contrast: 100,
    saturation: 100,
    sharpen: false,
  });
  const [elevationMode, setElevationMode] = useState<'off' | 'hillshade' | 'elevation' | 'slope' | 'ndsm'>('off');

  const applyPreset = useCallback((presetKey: MapPresetKey) => {
    setActivePreset(presetKey);
    const preset = MAP_PRESETS[presetKey];
    if (!preset) return;
    if (preset.viewMode) {
      setViewMode(preset.viewMode);
    }
    if (preset.diffMode !== undefined) {
      setDiffMode(preset.diffMode);
    }
    if (preset.heatmapMode !== undefined) {
      setHeatmapMode(preset.heatmapMode);
    }
    if (presetKey === 'presentation') {
      setThreeDMode('presentation');
    } else if (presetKey === 'survey') {
      setThreeDMode('survey');
    }
    setLayers(prev => ({
      ...prev,
      ...preset.layers,
    }));
  }, []);

  const setAppMode = useCallback((mode: 'demo' | 'real') => {
    setAppModeState(mode);
    localStorage.setItem('cadastra_app_mode', mode);
    if (mode === 'demo') {
      const demoP = generateParcels('TN-CHN-W42');
      setParcels(demoP);
      setBuildings(generateBuildings(demoP));
      setUploadedImageState('/drone_orthomosaic_ward42.jpg');
      setSelectedParcelId('TN-CHN-W42-000184');
    } else {
      // Real mode: show only genuine backend analysis if present
      if (analysisResult && analysisResult.parcels && analysisResult.parcels.length > 0) {
        setParcels(analysisResult.parcels);
        setBuildings(analysisResult.buildings);
        setSelectedParcelId(analysisResult.parcels[0]?.id || null);
      } else {
        setParcels([]);
        setBuildings([]);
        setSelectedParcelId(null);
        setUploadedImageState(null);
      }
    }
  }, [analysisResult]);

  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [searchQuery, setSearchQuery] = useState('');

  const switchRole = useCallback((role: UserRole) => {
    const account = DEMO_ACCOUNTS[role];
    if (account) {
      setCurrentUser(account);
      localStorage.setItem('cadastra_user_role', role);
    }
  }, []);

  const hasPermission = useCallback((permission: string): boolean => {
    const role = currentUser?.role || 'SURVEYOR';
    switch (permission) {
      case 'manage_users':
      case 'assign_members':
      case 'edit_validation_settings':
        return role === 'ADMIN';
      case 'create_project':
      case 'upload_inputs':
      case 'process_ai':
      case 'edit_geometry':
      case 'apply_topology_fix':
      case 'submit_for_review':
        return role === 'ADMIN' || role === 'GIS_ANALYST';
      case 'verify_parcel':
      case 'reject_parcel':
      case 'request_correction':
      case 'field_check':
        return role === 'SURVEYOR'; // Strict human review separation
      case 'view_all_audit_logs':
        return role === 'ADMIN';
      default:
        return true;
    }
  }, [currentUser]);

  const login = useCallback(async (email?: string, password?: string): Promise<boolean> => {
    if (appMode === 'real') {
      if (!email || !password) return false;
      try {
        const { apiService } = await import('@/services/apiService');
        const res = await apiService.login(email, password);
        if (res && res.token && res.user) {
          setIsAuthenticated(true);
          const u: User & { name: string } = {
            id: res.user.id,
            fullName: res.user.full_name || res.user.fullName || res.user.email,
            name: res.user.full_name || res.user.fullName || res.user.email,
            email: res.user.email,
            role: res.user.role as UserRole,
            organization: res.user.organization || '',
            isActive: res.user.is_active ?? true,
            avatar: (res.user.full_name || res.user.email).slice(0, 2).toUpperCase(),
          };
          setCurrentUser(u);
          localStorage.setItem('cadastra_user_role', u.role);
          localStorage.setItem('cadastra_user_data', JSON.stringify(u));
          return true;
        }
        return false;
      } catch (err) {
        console.error('Production authentication failed:', err);
        return false;
      }
    }

    // Demo Mode: Allow demo account selection
    setIsAuthenticated(true);
    const cleanEmail = email?.trim().toLowerCase() || '';
    let selectedAccount = DEMO_ACCOUNTS.SURVEYOR;

    if (cleanEmail.includes('admin')) {
      selectedAccount = DEMO_ACCOUNTS.ADMIN;
    } else if (cleanEmail.includes('analyst') || cleanEmail.includes('gis')) {
      selectedAccount = DEMO_ACCOUNTS.GIS_ANALYST;
    } else {
      selectedAccount = DEMO_ACCOUNTS.SURVEYOR;
    }

    setCurrentUser(selectedAccount);
    localStorage.setItem('cadastra_user_role', selectedAccount.role);
    localStorage.setItem('cadastra_user_data', JSON.stringify(selectedAccount));
    return true;
  }, [appMode]);

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    setCurrentPage('dashboard');
    localStorage.removeItem('cadastra_auth_token');
    localStorage.removeItem('cadastra_user_data');
    import('@/services/apiService').then(({ apiService }) => {
      apiService.logout().catch(() => {});
    });
  }, []);

  const setActiveProjectId = useCallback((id: string) => {
    setActiveProjectIdState(id);
    if (appMode === 'demo') {
      const prefix = id === 'PRJ-001' ? 'TN-CHN-W42' : 'TN-SURV-DEMO';
      const newParcels = generateParcels(prefix);
      setParcels(newParcels);
      setBuildings(generateBuildings(newParcels));
      setSelectedParcelId(newParcels[0]?.id || null);
    } else {
      // In real mode, clear mock data and load only from backend API
      fetch(`/api/projects/${id}/parcels`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.features && data.features.length > 0) {
            const loaded = data.features.map((f: any) => ({
              id: f.properties.id || f.id,
              surveyNumber: f.properties.survey_number || f.properties.surveyNumber || 'S-001',
              ward: f.properties.ward || 'Ward 01',
              zone: f.properties.zone || 'Zone 01',
              area: f.properties.area_m2 || 0,
              perimeter: f.properties.perimeter_m || 0,
              confidence: f.properties.confidence ?? null,
              boundaryConfidence: f.properties.confidence ?? null,
              buildingConfidence: f.properties.confidence ?? null,
              status: f.properties.status || 'ai_preliminary',
              priority: f.properties.priority || 'LOW',
              topologyStatus: f.properties.topology_status || 'valid',
              conflictType: f.properties.conflict_type || null,
              coordinates: f.geometry?.coordinates?.[0]?.map((c: [number, number]) => ({ lat: c[1], lng: c[0] })) || [],
            }));
            setParcels(loaded);
            setSelectedParcelId(loaded[0]?.id || null);
          } else {
            setParcels([]);
            setSelectedParcelId(null);
          }
        })
        .catch(() => {
          setParcels([]);
          setSelectedParcelId(null);
        });

      fetch(`/api/projects/${id}/buildings`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.features && data.features.length > 0) {
            const loadedBld = data.features.map((f: any) => ({
              id: f.properties.id || f.id,
              parcelId: f.properties.parcel_id,
              type: f.properties.structure_type || 'Unknown',
              height: f.properties.height_m ?? null,
              heightProvenance: f.properties.height_provenance || 'unknown',
              floors: f.properties.floors ?? null,
              floorsProvenance: f.properties.floors_provenance || 'unknown',
              roofType: f.properties.roof_style || 'unknown',
              roofProvenance: f.properties.roof_provenance || 'unknown',
              area: f.properties.footprint_area_sqm || 0,
              confidence: f.properties.confidence ?? null,
              geometry: f.geometry?.coordinates?.[0]?.map((c: [number, number]) => ({ x: c[0], y: c[1] })) || [],
            }));
            setBuildings(loadedBld);
          } else {
            setBuildings([]);
          }
        })
        .catch(() => {
          setBuildings([]);
        });
    }
  }, [projects, appMode]);


  const getProjectCenter = useCallback((): [number, number] => {
    if (activeProject?.center && Array.isArray(activeProject.center) && activeProject.center.length === 2) {
      return activeProject.center;
    }
    return [13.0827, 80.2707];
  }, [activeProject]);

  const createProject = useCallback((data: Partial<Project>): Project => {
    const newId = `PRJ-${String(Date.now()).slice(-4)}`;
    const center: [number, number] = data.center || [13.0827, 80.2707];
    const newProject: Project = {
      id: newId,
      name: data.name || 'Cadastral Survey Project',
      surveyArea: data.surveyArea || 'Zone 01',
      district: data.district || '',
      state: data.state || '',
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

  const addParcel = useCallback((newParcel: Parcel) => {
    setParcels(prev => [newParcel, ...prev]);
    setSelectedParcelId(newParcel.id);
  }, []);

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
    userRole,
    switchRole,
    hasPermission,
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
    appMode,
    setAppMode,
    isDemoMode,
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
    addParcel,
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
    activePreset,
    applyPreset,
    basemapType,
    setBasemapType,
    diffMode,
    setDiffMode,
    heatmapMode,
    setHeatmapMode,
    threeDMode,
    setThreeDMode,
    semanticColorMode,
    setSemanticColorMode,
    mapCenter,
    setMapCenter,
    mapZoom,
    setMapZoom,
    rasterAdjustments,
    setRasterAdjustments,
    elevationMode,
    setElevationMode,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
