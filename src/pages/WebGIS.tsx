import { useState, useMemo, useEffect, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import MapView from '@/components/MapView';
import ThreeDMapViewer from '@/components/ThreeDMapViewer';
import { Button, StatusBadge, PriorityBadge, ConfidenceBar, AIDisclaimer } from '@/components/UI';
import type { LayerState, WebGISViewMode, Parcel } from '@/types';
import {
  Layers, Map as MapIcon, Building2, Route, Mountain, Ruler,
  AlertTriangle, Eye, EyeOff, GitCompare, Pencil, Check, X,
  MapPin, Crosshair, Maximize2, Sparkles, Sliders, SplitSquareVertical,
  Maximize, ZoomIn, ZoomOut, RotateCcw, Compass, ArrowRight, Box,
  ChevronDown, FileText, Download, CheckCircle2, ChevronRight, ChevronLeft, Globe,
  ShieldCheck, Cpu, Search, Sun,
} from 'lucide-react';
import { MAP_PRESETS, type MapPresetKey } from '@/utils/mapStyles';

export default function WebGIS() {
  const {
    parcels, buildings, roads, gnssPoints, layers, toggleLayer, setLayerVisibility,
    selectedParcelId, setSelectedParcelId, compareMode, setCompareMode,
    compareSlider, setCompareSlider, basemapMode, setBasemapMode,
    acceptAIBoundary, rejectParcel, requestFieldVerification, repairTopology,
    settings, setCurrentPage, uploadedImage, imageBounds, orthoOpacity, setOrthoOpacity,
    activeProject, projects, setActiveProjectId, getProjectCenter, viewMode, setViewMode,
    addParcel, updateParcel,
    activePreset, applyPreset, basemapType, setBasemapType,
    diffMode, setDiffMode, heatmapMode, setHeatmapMode,
    threeDMode, setThreeDMode, semanticColorMode, setSemanticColorMode,
    mapCenter, setMapCenter, mapZoom, setMapZoom,
    rasterAdjustments, setRasterAdjustments,
    elevationMode, setElevationMode,
    userRole, hasPermission, currentUser,
  } = useApp();

  const [leftDrawerOpen, setLeftDrawerOpen] = useState(true);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(true);
  const [showLayerPanel, setShowLayerPanel] = useState(true);
  const [showInfoPanel, setShowInfoPanel] = useState(true);
  const [showKpiDetails, setShowKpiDetails] = useState(false);
  const [measureMode, setMeasureMode] = useState<boolean>(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [isEditingBounding, setIsEditingBounding] = useState(false);
  const [aiSuccessMessage, setAiSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [focusParcelId, setFocusParcelId] = useState<string | null>(null);
  const [showTerrainDropdown, setShowTerrainDropdown] = useState(false);
  const [showLightingPopover, setShowLightingPopover] = useState(false);
  const [basemapOpacity, setBasemapOpacity] = useState(100);
  const vizToolbarRef = useRef<HTMLDivElement>(null);

  // Auto-close visualization popovers when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (vizToolbarRef.current && !vizToolbarRef.current.contains(e.target as Node)) {
        setShowTerrainDropdown(false);
        setShowLightingPopover(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Recalculate Leaflet and Three.js viewport size immediately after panel animation (Item 10)
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 320);
    return () => clearTimeout(timer);
  }, [leftDrawerOpen, rightDrawerOpen]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return parcels.filter(
      p => p.id.toLowerCase().includes(q) ||
           (p.surveyNumber && p.surveyNumber.toLowerCase().includes(q)) ||
           (p.ownerName && p.ownerName.toLowerCase().includes(q))
    ).slice(0, 8);
  }, [parcels, searchQuery]);

  const baseCenter = useMemo(() => getProjectCenter(), [getProjectCenter]);

  const selectedParcel = useMemo(() => {
    return parcels.find(p => p.id === selectedParcelId) || parcels[0] || null;
  }, [parcels, selectedParcelId]);

  const handleRunAiExtraction = () => {
    setIsAiProcessing(true);
    setAiSuccessMessage(null);
    setTimeout(() => {
      setIsAiProcessing(false);
      setLayerVisibility('aiParcelBoundaries', true);
      setAiSuccessMessage('AI Extraction Complete: 12,486 candidate boundaries processed. Verification required.');
      setTimeout(() => setAiSuccessMessage(null), 4000);
    }, 1200);
  };

  const handleToggleAllLayers = () => {
    const allOn = layers.aiParcelBoundaries && layers.existingCadastralParcels && layers.buildings && layers.roads && layers.conflictAreas;
    const nextState = !allOn;
    setLayerVisibility('aiParcelBoundaries', nextState);
    setLayerVisibility('existingCadastralParcels', nextState);
    setLayerVisibility('buildings', nextState);
    setLayerVisibility('roads', nextState);
    setLayerVisibility('conflictAreas', nextState);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-slate-100/80 p-3 overflow-hidden font-sans text-slate-800">
      {/* 3-Column Main Workspace */}
      <div className="flex-1 flex gap-3 min-h-0 overflow-hidden">
        
        {/* LEFT COLUMN: Project Workspace (Collapsible) */}
        <div className={`${leftDrawerOpen ? 'w-72' : 'w-0 opacity-0 overflow-hidden p-0 border-0 pointer-events-none'} bg-white rounded-2xl border border-slate-200/90 shadow-sm flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out`}>
          {/* Header */}
          <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-sm text-slate-800 tracking-tight">Project Workspace</h2>
          </div>

          <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
            {/* Project Selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Project</label>
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <Globe className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <select
                    value={activeProject?.id || 'PRJ-001'}
                    onChange={(e) => setActiveProjectId(e.target.value)}
                    className="w-full pl-8 pr-7 py-2 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer transition-colors"
                  >
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <button
                  onClick={() => setCurrentPage('projects')}
                  className="px-2.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors shadow-2xs"
                  title="View Project Details"
                >
                  <Pencil className="w-3 h-3 text-slate-500" />
                  <span>Details</span>
                </button>
              </div>
            </div>

            {/* Uploaded Datasets List (Image 2 style) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Uploaded Datasets</span>
              </div>

              {/* ORI Dataset Card */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-2.5 space-y-1.5 transition-all hover:border-slate-300">
                <div className="flex items-start justify-between gap-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-blue-100 text-blue-700 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                        <span>ORI (Orthomosaic)</span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Resolution: <strong>0.1m</strong> · Proj: WGS84 (EPSG:4326)
                      </div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-full text-[9px] font-bold">
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> Uploaded
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                  <span>Uploaded on: 18 May 2025 10:30 AM</span>
                  <div className="flex items-center gap-1.5 font-semibold text-blue-600">
                    <button className="hover:underline">Edit</button>
                    <button className="hover:underline">Preview</button>
                  </div>
                </div>
              </div>

              {/* DSM Dataset Card */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-2.5 space-y-1.5 transition-all hover:border-slate-300">
                <div className="flex items-start justify-between gap-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Mountain className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-bold text-xs text-slate-800">DSM (Digital Surface Model)</div>
                      <div className="text-[10px] text-slate-500">
                        Resolution: <strong>0.5m</strong> · Proj: WGS84 (EPSG:4326)
                      </div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-full text-[9px] font-bold">
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                  <span>Uploaded on: 18 May 2025 10:34 AM</span>
                  <div className="flex items-center gap-1.5 font-semibold text-blue-600">
                    <button className="hover:underline">Edit</button>
                    <button className="hover:underline">Preview</button>
                  </div>
                </div>
              </div>

              {/* DTM Dataset Card */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-2.5 space-y-1.5 transition-all hover:border-slate-300">
                <div className="flex items-start justify-between gap-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-amber-100 text-amber-700 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Box className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-bold text-xs text-slate-800">DTM (Digital Terrain Model)</div>
                      <div className="text-[10px] text-slate-500">
                        Resolution: <strong>0.5m</strong> · Proj: WGS84 (EPSG:4326)
                      </div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-full text-[9px] font-bold">
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                  <span>Uploaded on: 18 May 2025 10:34 AM</span>
                  <div className="flex items-center gap-1.5 font-semibold text-blue-600">
                    <button className="hover:underline">Edit</button>
                    <button className="hover:underline">Preview</button>
                  </div>
                </div>
              </div>

              {/* GIS Layers Dataset Card */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-2.5 space-y-1.5 transition-all hover:border-slate-300">
                <div className="flex items-start justify-between gap-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-cyan-100 text-cyan-700 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Layers className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-bold text-xs text-slate-800">GIS Layers</div>
                      <div className="text-[10px] text-slate-500">
                        Parcels, Buildings, Roads · EPSG:4326
                      </div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-full text-[9px] font-bold">
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                  <span>Uploaded on: 18 May 2025 10:35 AM</span>
                  <div className="flex items-center gap-1.5 font-semibold text-blue-600">
                    <button className="hover:underline">Edit</button>
                    <button className="hover:underline">Preview</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Left Panel Footer Actions */}
          <div className="p-3.5 border-t border-slate-100 bg-slate-50/50 space-y-2">
            <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-600">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Ready for AI Processing</span>
            </div>

            {aiSuccessMessage && (
              <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-[10px] text-emerald-800 font-medium">
                {aiSuccessMessage}
              </div>
            )}

            <button
              onClick={handleRunAiExtraction}
              disabled={isAiProcessing}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-75"
            >
              <Sparkles className={`w-4 h-4 ${isAiProcessing ? 'animate-spin' : ''}`} />
              <span>{isAiProcessing ? 'Extracting Features...' : 'Run AI Extraction'}</span>
            </button>

            <button
              onClick={() => setCurrentPage('field-verification')}
              className="w-full py-2 px-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors shadow-2xs"
            >
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                Start Ground Truthing
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
          </div>
        </div>

        {/* CENTER COLUMN: Bounded GIS Map + Bottom Statistics Ribbon */}
        <div className="flex-1 flex flex-col gap-3 min-w-0 overflow-hidden relative">
          
          {/* Main Map Container */}
          <div className="flex-1 bg-white rounded-2xl border border-slate-200/90 shadow-sm relative overflow-hidden flex flex-col">
            
            {/* Left Drawer Persistent Toggle Handle */}
            <button
              onClick={() => setLeftDrawerOpen(!leftDrawerOpen)}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-[420] w-5 h-12 bg-white/95 hover:bg-white text-slate-600 hover:text-blue-600 rounded-r-xl shadow-md border-r border-y border-slate-200/90 flex items-center justify-center transition-all cursor-pointer"
              title={leftDrawerOpen ? "Collapse Project Workspace" : "Expand Project Workspace"}
            >
              {leftDrawerOpen ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5 text-blue-600" />}
            </button>

            {/* Right Drawer Persistent Toggle Handle */}
            <button
              onClick={() => setRightDrawerOpen(!rightDrawerOpen)}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-[420] w-5 h-12 bg-white/95 hover:bg-white text-slate-600 hover:text-blue-600 rounded-l-xl shadow-md border-l border-y border-slate-200/90 flex items-center justify-center transition-all cursor-pointer"
              title={rightDrawerOpen ? "Collapse Layers & Inspector" : "Expand Layers & Inspector"}
            >
              {rightDrawerOpen ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5 text-blue-600" />}
            </button>

            {/* Unified Top Control Bar: Search (Left) + Presets (Center) + Visualization Toolbar (Right) */}
            <div className="absolute top-3 left-4 right-4 z-30 flex items-center justify-between gap-2.5 pointer-events-none">
              {/* Left Zone: Search Bar */}
              <div className="relative shrink-0 pointer-events-auto">
                <div className="flex items-center bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-xl px-3 py-1.5 shadow-md focus-within:ring-2 focus-within:ring-blue-500 transition-all w-40 sm:w-44 md:w-48">
                  <Search className="w-3.5 h-3.5 text-slate-400 mr-2 flex-shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowSearchDropdown(true);
                    }}
                    onFocus={() => setShowSearchDropdown(true)}
                    placeholder="Search parcel / lot..."
                    className="bg-transparent text-xs text-slate-800 placeholder-slate-400 w-full focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setShowSearchDropdown(false);
                      }}
                      className="text-slate-400 hover:text-slate-600 ml-1 text-xs cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Search Dropdown */}
                {showSearchDropdown && searchResults.length > 0 && (
                  <div className="absolute top-full mt-1.5 left-0 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-40 max-h-64 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                    <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wide border-b border-slate-100 flex items-center justify-between">
                      <span>Matching Parcels</span>
                      <span className="font-mono text-blue-600">{searchResults.length}</span>
                    </div>
                    {searchResults.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setSelectedParcelId(p.id);
                          setFocusParcelId(p.id);
                          setSearchQuery('');
                          setShowSearchDropdown(false);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-blue-50 flex items-center justify-between border-b border-slate-50 last:border-0 transition-colors cursor-pointer"
                      >
                        <div>
                          <div className="text-xs font-bold text-slate-800">{p.id}</div>
                          <div className="text-[10px] text-slate-500">Lot #{p.surveyNumber} · {p.aiArea} m²</div>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold">
                          {p.status}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Center Zone: Mode / View Presets Bar (Horizontally scrollable on narrower displays) */}
              <div className="flex-1 min-w-0 flex items-center justify-center pointer-events-auto">
                <div className="bg-white/95 backdrop-blur-md rounded-xl p-1 shadow-md border border-slate-200/80 flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full">
                  {(Object.keys(MAP_PRESETS) as MapPresetKey[]).map((key) => {
                    const preset = MAP_PRESETS[key];
                    const isActive = activePreset === key;
                    return (
                      <button
                        key={key}
                        onClick={() => applyPreset(key)}
                        className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                          isActive
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                        title={preset.description}
                      >
                        <span>{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right Zone: Unified Visualization Toolbar [ 2D | 3D ] [ Terrain ▾ ] [ ☀ ] */}
              <div ref={vizToolbarRef} className="flex items-center gap-1.5 pointer-events-auto shrink-0 relative">
                {/* 2D / 3D Compact Segmented Toggle */}
                <div className="bg-white/95 backdrop-blur-md rounded-xl p-1 shadow-md border border-slate-200/80 flex items-center gap-1">
                  <button
                    onClick={() => setViewMode('webgis')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                      viewMode === 'webgis'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                    title="2D Cadastral Vectors & Satellite Orthophoto"
                  >
                    <MapIcon className="w-3.5 h-3.5" />
                    <span>2D</span>
                  </button>

                  <button
                    onClick={() => setViewMode('3d_twin')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                      viewMode === '3d_twin'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                    title="3D Cadastral Digital Twin"
                  >
                    <Box className="w-3.5 h-3.5" />
                    <span>3D</span>
                  </button>
                </div>

                {/* Terrain Visualization Dropdown Toggle */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowTerrainDropdown(!showTerrainDropdown);
                      setShowLightingPopover(false);
                    }}
                    className={`h-9 px-2.5 bg-white/95 backdrop-blur-md rounded-xl shadow-md border flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer ${
                      showTerrainDropdown || elevationMode !== 'off'
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                        : 'border-slate-200/80 text-slate-700 hover:bg-slate-50'
                    }`}
                    title="Terrain & Elevation Visualization"
                  >
                    <Mountain className={`w-3.5 h-3.5 ${elevationMode !== 'off' ? 'text-indigo-600' : 'text-slate-500'}`} />
                    <span className="hidden sm:inline">Terrain</span>
                    {elevationMode !== 'off' && (
                      <span className="text-[10px] uppercase text-indigo-600 font-mono bg-indigo-100 px-1 rounded">
                        {elevationMode}
                      </span>
                    )}
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  </button>

                  {/* Terrain Dropdown Menu */}
                  {showTerrainDropdown && (
                    <div className="absolute top-full mt-2 right-0 w-60 bg-slate-900/95 text-white backdrop-blur-xl border border-slate-700/80 p-2.5 rounded-2xl shadow-2xl z-40 animate-in fade-in slide-in-from-top-2 space-y-1">
                      <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 flex items-center justify-between">
                        <span>Terrain Visualization</span>
                        <Mountain className="w-3.5 h-3.5 text-indigo-400" />
                      </div>
                      <div className="pt-1 space-y-0.5">
                        {[
                          { id: 'off', label: 'Off', desc: 'Standard 2D vector / satellite map' },
                          { id: 'elevation', label: 'Elevation', desc: 'Hypsometric color-ramp gradient' },
                          { id: 'hillshade', label: 'Hillshade', desc: 'Shaded relief topography' },
                          { id: 'slope', label: 'Slope', desc: 'Surface gradient steepness' },
                          { id: 'ndsm', label: 'nDSM', desc: 'Normalized surface model height' },
                        ].map((tm) => (
                          <button
                            key={tm.id}
                            onClick={() => {
                              setElevationMode(tm.id as any);
                              setShowTerrainDropdown(false);
                            }}
                            className={`w-full px-2.5 py-1.5 rounded-xl text-left flex items-center justify-between transition-colors cursor-pointer ${
                              elevationMode === tm.id
                                ? 'bg-indigo-600 text-white font-bold'
                                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                            }`}
                          >
                            <div>
                              <div className="text-xs font-semibold">{tm.label}</div>
                              <div className="text-[10px] text-slate-400">{tm.desc}</div>
                            </div>
                            {elevationMode === tm.id && <Check className="w-3.5 h-3.5 text-white shrink-0 ml-2" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Lighting & Raster Adjustments Popover Toggle */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowLightingPopover(!showLightingPopover);
                      setShowTerrainDropdown(false);
                    }}
                    className={`w-9 h-9 bg-white/95 backdrop-blur-md rounded-xl shadow-md border flex items-center justify-center transition-all cursor-pointer ${
                      showLightingPopover
                        ? 'bg-blue-600 text-white border-blue-500 ring-2 ring-blue-400/50'
                        : 'border-slate-200/80 text-slate-700 hover:bg-slate-50'
                    }`}
                    title="Lighting & Imagery Adjustments"
                  >
                    <Sun className="w-4 h-4" />
                  </button>

                  {/* Lighting Glass Popover */}
                  {showLightingPopover && (
                    <div className="absolute top-full mt-2 right-0 w-72 bg-slate-900/95 text-white backdrop-blur-xl border border-slate-700/80 p-3.5 rounded-2xl shadow-2xl z-40 animate-in fade-in slide-in-from-top-2 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                        <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                          <Sun className="w-3.5 h-3.5 text-amber-400" /> Lighting & Imagery
                        </span>
                        <button
                          onClick={() => {
                            setBasemapOpacity(100);
                            setRasterAdjustments({
                              brightness: 100,
                              contrast: 100,
                              saturation: 100,
                              sharpen: false,
                            });
                          }}
                          className="text-[10px] text-slate-400 hover:text-white cursor-pointer"
                        >
                          Reset
                        </button>
                      </div>

                      {/* Basemap Opacity / Layer Depth */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-slate-300">
                          <span>Layer Depth / Opacity</span>
                          <span className="font-mono text-amber-400">{basemapOpacity}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={basemapOpacity}
                          onChange={(e) => setBasemapOpacity(Number(e.target.value))}
                          className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                        />
                      </div>

                      {/* Brightness */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-slate-300">
                          <span>Brightness</span>
                          <span className="font-mono text-blue-400">{rasterAdjustments.brightness}%</span>
                        </div>
                        <input
                          type="range"
                          min={50}
                          max={150}
                          value={rasterAdjustments.brightness}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setRasterAdjustments(prev => ({ ...prev, brightness: val }));
                          }}
                          className="w-full accent-blue-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                        />
                      </div>

                      {/* Contrast */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-slate-300">
                          <span>Contrast</span>
                          <span className="font-mono text-blue-400">{rasterAdjustments.contrast}%</span>
                        </div>
                        <input
                          type="range"
                          min={50}
                          max={150}
                          value={rasterAdjustments.contrast}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setRasterAdjustments(prev => ({ ...prev, contrast: val }));
                          }}
                          className="w-full accent-blue-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                        />
                      </div>

                      {/* Saturation */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-slate-300">
                          <span>Saturation</span>
                          <span className="font-mono text-blue-400">{rasterAdjustments.saturation}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={200}
                          value={rasterAdjustments.saturation}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setRasterAdjustments(prev => ({ ...prev, saturation: val }));
                          }}
                          className="w-full accent-blue-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                        />
                      </div>

                      {/* Sharpen Toggle */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                        <span className="text-[11px] text-slate-300">Sharpen Aerial Details</span>
                        <button
                          onClick={() => {
                            setRasterAdjustments(prev => ({ ...prev, sharpen: !prev.sharpen }));
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                            rasterAdjustments.sharpen ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {rasterAdjustments.sharpen ? 'ON' : 'OFF'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* View Switcher Engine */}
            <div className="flex-1 w-full h-full relative">
              {viewMode === '3d_twin' ? (
                <ThreeDMapViewer
                  parcels={parcels}
                  buildings={buildings}
                  roads={roads}
                  gnssPoints={gnssPoints}
                  selectedParcelId={selectedParcelId}
                  onSelectParcel={setSelectedParcelId}
                  focusParcelId={focusParcelId}
                  onClearFocusParcel={() => setFocusParcelId(null)}
                  layers={layers}
                  uploadedImage={uploadedImage}
                  baseCenter={baseCenter}
                  height="100%"
                  threeDMode={threeDMode}
                  onThreeDModeChange={setThreeDMode}
                  semanticColorMode={semanticColorMode}
                  onSemanticColorModeChange={setSemanticColorMode}
                  elevationMode={elevationMode}
                  onViewChange={(c, z) => {
                    setMapCenter(c);
                    setMapZoom(z);
                  }}
                />
              ) : (
                <MapView
                  parcels={parcels}
                  buildings={buildings}
                  roads={roads}
                  gnssPoints={gnssPoints}
                  layers={layers}
                  selectedParcelId={selectedParcelId}
                  onSelectParcel={setSelectedParcelId}
                  focusParcelId={focusParcelId}
                  onClearFocusParcel={() => setFocusParcelId(null)}
                  onAddParcel={addParcel}
                  onUpdateParcelGeometry={(id, newAiGeom, newExistingGeom) => {
                    updateParcel(id, {
                      aiGeometry: newAiGeom,
                      existingGeometry: newExistingGeom || newAiGeom,
                    });
                    setAiSuccessMessage(`Boundary nodes for ${id} calibrated and saved.`);
                    setTimeout(() => setAiSuccessMessage(null), 3000);
                  }}
                  isEditingBounding={isEditingBounding}
                  onToggleEditBounding={setIsEditingBounding}
                  uploadedImage={uploadedImage}
                  imageBounds={imageBounds}
                  orthoOpacity={orthoOpacity}
                  baseCenter={baseCenter}
                  initialCenter={mapCenter}
                  initialZoom={mapZoom}
                  compareMode={compareMode}
                  compareSlider={compareSlider}
                  basemapMode={basemapMode}
                  highlightConflicts={layers.conflictAreas}
                  showGrid={settings.showGrid}
                  height="100%"
                  searchParcelId={null}
                  measureMode={measureMode}
                  diffMode={diffMode}
                  heatmapMode={heatmapMode}
                  basemapType={basemapType}
                  onBasemapChange={setBasemapType}
                  rasterAdjustments={rasterAdjustments}
                  onRasterAdjustmentsChange={setRasterAdjustments}
                  elevationMode={elevationMode}
                  onElevationModeChange={setElevationMode}
                  basemapOpacity={basemapOpacity}
                  onBasemapOpacityChange={setBasemapOpacity}
                  onViewChange={(c, z) => {
                    setMapCenter(c);
                    setMapZoom(z);
                  }}
                  onAcceptParcel={(id) => {
                    acceptAIBoundary(id);
                    setAiSuccessMessage(`Parcel ${id} verified and approved into Cadastral Register.`);
                    setTimeout(() => setAiSuccessMessage(null), 3500);
                    import('@/services/apiService').then(({ apiService }) => {
                      apiService.verifyFeature(id, 'Drone GIS Cell', 'Approved in CadastraAI interface').catch(() => {});
                    });
                  }}
                  onRejectParcel={(id) => {
                    rejectParcel(id);
                  }}
                  onRequestFieldVerification={(id) => {
                    requestFieldVerification(id);
                  }}
                />
              )}
            </div>
          </div>

          {/* Item 11: Compact Status Strip with Expandable Details */}
          <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-sm px-4 py-2 flex items-center justify-between gap-3 text-xs flex-shrink-0">
            <div className="flex items-center gap-2.5 text-slate-700 font-semibold flex-wrap">
              <span className="flex items-center gap-1.5 font-bold text-slate-800">
                <Globe className="w-3.5 h-3.5 text-blue-600" />
                <span>{activeProject?.totalParcels ? activeProject.totalParcels.toLocaleString() : '12,486'} Parcels</span>
              </span>
              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-amber-600" />
                <span>8,932 Buildings</span>
              </span>
              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1.5 text-rose-600 font-bold">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>126 Issues</span>
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>AI Preliminary Delineation</span>
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-slate-500 font-mono text-xs">
                IoU: Not evaluated (Pending GT)
              </span>
            </div>

            <button
              onClick={() => setShowKpiDetails(!showKpiDetails)}
              className="px-2.5 py-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100/80 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
              title="Expand/Collapse detailed KPI metrics cards"
            >
              <span>{showKpiDetails ? 'Hide Details' : 'Expand Details'}</span>
              <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showKpiDetails ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Optional Expanded KPI Cards Drawer */}
          {showKpiDetails && (
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-lg p-3 grid grid-cols-2 md:grid-cols-5 gap-3 flex-shrink-0 animate-in fade-in slide-in-from-bottom-2">
              {/* Metric 1: Total Parcels */}
              <div className="flex items-center gap-2.5 bg-slate-50/80 p-2 rounded-xl border border-slate-100">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0">
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-extrabold text-slate-800 leading-tight">
                    {activeProject?.totalParcels ? activeProject.totalParcels.toLocaleString() : '12,486'}
                  </div>
                  <div className="text-[10px] font-medium text-slate-500">Total Parcels</div>
                </div>
              </div>

              {/* Metric 2: Total Buildings */}
              <div className="flex items-center gap-2.5 bg-slate-50/80 p-2 rounded-xl border border-slate-100">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-extrabold text-slate-800 leading-tight">8,932</div>
                  <div className="text-[10px] font-medium text-slate-500">Total Buildings</div>
                </div>
              </div>

              {/* Metric 3: Total Issues */}
              <div className="flex items-center gap-2.5 bg-slate-50/80 p-2 rounded-xl border border-slate-100">
                <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-extrabold text-slate-800 leading-tight">126</div>
                  <div className="text-[10px] font-medium text-slate-500">Topology Issues</div>
                </div>
              </div>

              {/* Metric 4: Accuracy AI */}
              <div className="flex items-center gap-2.5 bg-slate-50/80 p-2 rounded-xl border border-slate-100">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-extrabold text-slate-700 leading-tight">Not evaluated</div>
                  <div className="text-[10px] font-medium text-slate-500">Model Confidence</div>
                </div>
              </div>

              {/* Metric 5: Model Performance Widget */}
              <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl px-2.5 py-1.5 space-y-1">
                <div className="flex justify-between text-[9px] text-slate-600 font-medium">
                  <span>IoU Benchmark</span>
                  <span className="font-bold text-slate-600">Not evaluated</span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-slate-400 rounded-full" style={{ width: '0%' }} />
                </div>
                <div className="text-[9px] text-slate-400 text-right">Requires ground-truth dataset</div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Layers & Parcel Details (Collapsible) */}
        <div className={`${rightDrawerOpen ? 'w-72' : 'w-0 opacity-0 overflow-hidden p-0 border-0 pointer-events-none'} bg-white rounded-2xl border border-slate-200/90 shadow-sm flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out`}>
          {/* Header */}
          <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-sm text-slate-800 tracking-tight">Layers & Parcel Details</h2>
          </div>

          <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
            {/* Layers Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Layers</span>
                <button
                  onClick={handleToggleAllLayers}
                  className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  <Eye className="w-3 h-3" /> Show All
                </button>
              </div>

              <div className="space-y-1 text-xs">
                {/* Layer 1: Parcel Boundaries */}
                <label className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors border border-transparent hover:border-slate-200">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={layers.existingCadastralParcels}
                      onChange={() => toggleLayer('existingCadastralParcels')}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 accent-blue-600"
                    />
                    <span className="font-medium text-slate-700 text-xs">Parcel Boundaries</span>
                  </div>
                  <span className="w-4 h-1 rounded-full bg-cyan-500" />
                </label>

                {/* Layer 2: AI Predicted Boundaries */}
                <label className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors border border-transparent hover:border-slate-200">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={layers.aiParcelBoundaries}
                      onChange={() => toggleLayer('aiParcelBoundaries')}
                      className="w-4 h-4 text-magenta-600 rounded focus:ring-purple-500 accent-purple-600"
                    />
                    <span className="font-medium text-slate-700 text-xs">AI Predicted Boundaries</span>
                  </div>
                  <span className="w-4 h-1 rounded-full bg-purple-500" />
                </label>

                {/* Layer 3: Building Footprints */}
                <label className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors border border-transparent hover:border-slate-200">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={layers.buildings}
                      onChange={() => toggleLayer('buildings')}
                      className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500 accent-amber-500"
                    />
                    <span className="font-medium text-slate-700 text-xs">Building Footprints</span>
                  </div>
                  <span className="w-4 h-1 rounded-full bg-amber-500" />
                </label>

                {/* Layer 4: Roads */}
                <label className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors border border-transparent hover:border-slate-200">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={layers.roads}
                      onChange={() => toggleLayer('roads')}
                      className="w-4 h-4 text-slate-600 rounded focus:ring-slate-500 accent-slate-500"
                    />
                    <span className="font-medium text-slate-700 text-xs">Roads</span>
                  </div>
                  <span className="w-4 h-1 rounded-full bg-slate-400" />
                </label>

                {/* Layer 5: Issues / Conflicts */}
                <label className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors border border-transparent hover:border-slate-200">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={layers.conflictAreas}
                      onChange={() => toggleLayer('conflictAreas')}
                      className="w-4 h-4 text-red-600 rounded focus:ring-red-500 accent-red-500"
                    />
                    <span className="font-medium text-slate-700 text-xs flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                      Issues / Conflicts
                    </span>
                  </div>
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                </label>

                {/* Layer 6: LULC */}
                <label className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors border border-transparent hover:border-slate-200">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={!!layers.lulc}
                      onChange={() => toggleLayer('lulc' as any)}
                      className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 accent-emerald-500"
                    />
                    <span className="font-medium text-slate-700 text-xs">LULC (Land Use)</span>
                  </div>
                  <span className="w-3 h-3 rounded-sm bg-emerald-400" />
                </label>
              </div>
            </div>

            {/* Selected Parcel Details (Image 2 style) */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Selected Parcel (1)
                </span>
                <button
                  onClick={() => setSelectedParcelId(null)}
                  className="text-[10px] font-semibold text-slate-400 hover:text-slate-600"
                >
                  Clear Selection
                </button>
              </div>

              {selectedParcel ? (
                <div className="bg-gradient-to-br from-blue-50/50 to-indigo-50/30 border border-blue-200/80 rounded-2xl p-3.5 space-y-3">
                  {/* Parcel Header */}
                  <div className="flex items-start justify-between border-b border-blue-100 pb-2.5">
                    <div className="flex items-start gap-2">
                      <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                        ℹ
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Parcel ID</div>
                        <div className="text-xs font-black text-slate-900 font-mono tracking-tight">
                          {selectedParcel.id}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setFocusParcelId(selectedParcel.id)}
                      className="px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                      title="Zoom and center camera on this parcel"
                    >
                      <Crosshair className="w-3 h-3 text-blue-600" />
                      <span>Zoom to Parcel</span>
                    </button>
                  </div>

                  {/* Attributes Grid */}
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-500 text-[11px]">Area</span>
                      <span className="font-bold text-slate-800">{selectedParcel.existingArea} sq.m</span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-500 text-[11px]">Land Use</span>
                      <span className="font-semibold text-slate-800">{selectedParcel.landUse || 'Residential'}</span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-500 text-[11px]">AI Confidence</span>
                      <span className="font-bold text-blue-700 font-mono">{selectedParcel.confidence}%</span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-500 text-[11px]">Predicted By</span>
                      <span className="font-medium text-slate-700">{selectedParcel.predictedBy || 'CadastraAI Model v2.1'}</span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-500 text-[11px]">Created On</span>
                      <span className="text-slate-700 text-[11px]">{selectedParcel.createdOn || '18 May 2025 10:44 AM'}</span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-blue-100/60">
                      <span className="text-slate-500 text-[11px]">Status</span>
                      <span className={`px-2 py-0.5 border rounded-full text-[10px] font-bold ${
                        selectedParcel.status === 'verified'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : selectedParcel.status === 'rejected'
                          ? 'bg-rose-100 text-rose-800 border-rose-300'
                          : selectedParcel.isIssue
                          ? 'bg-amber-100 text-amber-800 border-amber-300'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        {selectedParcel.status === 'verified' ? 'Approved' : selectedParcel.status === 'rejected' ? 'Rejected' : selectedParcel.isIssue ? 'Requires Review' : 'Pending Approval'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
                  Click any parcel or issue pin on the map to inspect details.
                </div>
              )}
            </div>
          </div>

          {/* Right Panel Footer Actions - Role Enforced */}
          <div className="p-3 border-t border-slate-100 bg-slate-50/70 space-y-2">
            {userRole === 'SURVEYOR' ? (
              <>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (selectedParcel) {
                        acceptAIBoundary(selectedParcel.id);
                        setAiSuccessMessage(`Parcel ${selectedParcel.id} officially verified & certified by licensed surveyor.`);
                        setTimeout(() => setAiSuccessMessage(null), 3500);
                        apiService.verifyParcelWorkflow(
                          activeProject?.id || 'PRJ-001',
                          selectedParcel.id,
                          'verify',
                          currentUser?.fullName || currentUser?.name || 'Licensed Surveyor',
                          'Surveyor verified against Ground Truth & GNSS'
                        ).catch(() => {});
                      }
                    }}
                    className="flex-1 py-2 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-[0.98]"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Verify & Certify</span>
                  </button>

                  <button
                    onClick={() => {
                      if (selectedParcel) {
                        const reason = window.prompt('Correction details required for GIS Analyst:', 'Boundary adjustment required');
                        if (reason) {
                          apiService.verifyParcelWorkflow(
                            activeProject?.id || 'PRJ-001',
                            selectedParcel.id,
                            'correct',
                            currentUser?.fullName || currentUser?.name || 'Licensed Surveyor',
                            reason
                          ).catch(() => {});
                          setAiSuccessMessage(`Correction requested for parcel ${selectedParcel.id}`);
                          setTimeout(() => setAiSuccessMessage(null), 3500);
                        }
                      }
                    }}
                    className="flex-1 py-2 px-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all shadow-xs cursor-pointer active:scale-[0.98]"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Request Correction</span>
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (selectedParcel) {
                        rejectParcel(selectedParcel.id);
                        setAiSuccessMessage(`Parcel ${selectedParcel.id} rejected by surveyor.`);
                        setTimeout(() => setAiSuccessMessage(null), 3500);
                        apiService.verifyParcelWorkflow(
                          activeProject?.id || 'PRJ-001',
                          selectedParcel.id,
                          'reject',
                          currentUser?.fullName || currentUser?.name || 'Licensed Surveyor',
                          'Rejected during cadastral review'
                        ).catch(() => {});
                      }
                    }}
                    className="flex-1 py-1.5 px-2 bg-white border border-rose-300 hover:bg-rose-50 text-rose-700 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer"
                  >
                    <span>Reject</span>
                  </button>

                  <button
                    onClick={() => {
                      if (selectedParcel) {
                        requestFieldVerification(selectedParcel.id);
                        setAiSuccessMessage(`Parcel ${selectedParcel.id} queued for physical field check.`);
                        setTimeout(() => setAiSuccessMessage(null), 3500);
                        apiService.verifyParcelWorkflow(
                          activeProject?.id || 'PRJ-001',
                          selectedParcel.id,
                          'mark_review',
                          currentUser?.fullName || currentUser?.name || 'Licensed Surveyor',
                          'Physical rover / field check required'
                        ).catch(() => {});
                      }
                    }}
                    className="flex-1 py-1.5 px-2 bg-white border border-purple-300 hover:bg-purple-50 text-purple-700 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer"
                  >
                    <span>Field Check Req.</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (selectedParcel) {
                      setIsEditingBounding((prev) => !prev);
                    }
                  }}
                  className={`flex-1 py-2 px-3 border rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer ${
                    isEditingBounding
                      ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-500/40'
                      : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>{isEditingBounding ? 'Editing Nodes' : 'Edit Bounding'}</span>
                </button>

                <button
                  onClick={() => {
                    if (selectedParcel) {
                      updateParcel(selectedParcel.id, {
                        status: 'requires_review',
                        verificationStatus: 'under_review',
                      });
                      apiService.submitParcelForReview(
                        activeProject?.id || 'PRJ-001',
                        selectedParcel.id,
                        'Analyst completed technical checks; submitted for licensed surveyor review.'
                      ).catch(() => {});
                      setAiSuccessMessage(`Parcel ${selectedParcel.id} submitted for surveyor review.`);
                      setTimeout(() => setAiSuccessMessage(null), 3500);
                    }
                  }}
                  className="flex-1 py-2 px-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-[0.98]"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Submit for Review</span>
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
