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
  ChevronDown, FileText, Download, CheckCircle2, ChevronRight, Globe,
  ShieldCheck, Cpu,
} from 'lucide-react';

export default function WebGIS() {
  const {
    parcels, buildings, roads, gnssPoints, layers, toggleLayer, setLayerVisibility,
    selectedParcelId, setSelectedParcelId, compareMode, setCompareMode,
    compareSlider, setCompareSlider, basemapMode, setBasemapMode,
    acceptAIBoundary, rejectParcel, requestFieldVerification, repairTopology,
    settings, setCurrentPage, uploadedImage, imageBounds, orthoOpacity, setOrthoOpacity,
    activeProject, projects, setActiveProjectId, getProjectCenter, viewMode, setViewMode,
  } = useApp();

  const [showLayerPanel, setShowLayerPanel] = useState(true);
  const [showInfoPanel, setShowInfoPanel] = useState(true);
  const [measureMode, setMeasureMode] = useState<boolean>(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiSuccessMessage, setAiSuccessMessage] = useState<string | null>(null);

  const baseCenter = useMemo(() => getProjectCenter(), [getProjectCenter]);

  const selectedParcel = useMemo(() => {
    return parcels.find(p => p.id === selectedParcelId) || parcels[0] || null;
  }, [parcels, selectedParcelId]);

  const handleRunAiExtraction = () => {
    setIsAiProcessing(true);
    setAiSuccessMessage(null);
    setTimeout(() => {
      setIsAiProcessing(false);
      setAiSuccessMessage('AI Extraction Complete: 12,486 boundaries processed with 94.0% confidence.');
      setTimeout(() => setAiSuccessMessage(null), 4000);
    }, 1800);
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
        
        {/* LEFT COLUMN: Project Workspace */}
        <div className="w-72 bg-white rounded-2xl border border-slate-200/90 shadow-sm flex flex-col overflow-hidden flex-shrink-0">
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
        <div className="flex-1 flex flex-col gap-3 min-w-0 overflow-hidden">
          
          {/* Main Map Container */}
          <div className="flex-1 bg-white rounded-2xl border border-slate-200/90 shadow-sm relative overflow-hidden flex flex-col">
            {/* View Mode Bar Overlay (Top Right of Map) */}
            <div className="absolute top-3.5 right-14 z-[400] bg-white/95 backdrop-blur-md rounded-xl p-1 shadow-md border border-slate-200/80 flex items-center gap-1">
              <button
                onClick={() => setViewMode('3d_twin')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                  viewMode === '3d_twin'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                title="3D Cadastral Digital Twin"
              >
                <Box className="w-3 h-3" />
                <span>3D Digital Twin</span>
              </button>

              <button
                onClick={() => setViewMode('webgis')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                  viewMode === 'webgis'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                title="2D Map Cadastral Vectors"
              >
                <MapIcon className="w-3 h-3" />
                <span>2D Map</span>
              </button>

              <button
                onClick={() => setMeasureMode(!measureMode)}
                className={`px-2 py-1 text-[11px] font-semibold rounded-lg transition-all flex items-center gap-1 ${
                  measureMode ? 'bg-cyan-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
                title="Measure distance and area"
              >
                <Ruler className="w-3 h-3" />
                <span>Measure</span>
              </button>

              <button
                onClick={() => setViewMode(viewMode === 'cad_inspector' ? 'webgis' : 'cad_inspector')}
                className={`px-2 py-1 text-[11px] font-semibold rounded-lg transition-all flex items-center gap-1 ${
                  viewMode === 'cad_inspector' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
                title="CAD Vector Inspector"
              >
                <Pencil className="w-3 h-3" />
                <span>CAD Inspector</span>
              </button>

              <button
                onClick={() => setViewMode(viewMode === 'split_compare' ? 'webgis' : 'split_compare')}
                className={`px-2 py-1 text-[11px] font-semibold rounded-lg transition-all flex items-center gap-1 ${
                  viewMode === 'split_compare' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
                title="Curtain Swipe Comparison"
              >
                <SplitSquareVertical className="w-3 h-3" />
                <span>Curtain Swipe</span>
              </button>
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
                  layers={layers}
                  uploadedImage={uploadedImage}
                  baseCenter={baseCenter}
                  height="100%"
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
                  uploadedImage={uploadedImage}
                  imageBounds={imageBounds}
                  orthoOpacity={orthoOpacity}
                  baseCenter={baseCenter}
                  compareMode={compareMode}
                  compareSlider={compareSlider}
                  basemapMode={basemapMode}
                  highlightConflicts={layers.conflictAreas}
                  showGrid={settings.showGrid}
                  height="100%"
                  searchParcelId={selectedParcelId}
                  measureMode={measureMode}
                  onAcceptParcel={(id) => {
                    acceptAIBoundary(id);
                    import('@/services/apiService').then(({ apiService }) => {
                      apiService.verifyFeature(id, 'Drone GIS Cell', 'Approved in LAND-AI interface').catch(() => {});
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

          {/* Bottom Statistics Ribbon (Image 2 style) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm px-4 py-2.5 flex items-center justify-between gap-4 flex-wrap flex-shrink-0">
            {/* Metric 1: Total Parcels */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <div className="text-base font-extrabold text-slate-800 leading-tight">
                  {activeProject?.totalParcels ? activeProject.totalParcels.toLocaleString() : '12,486'}
                </div>
                <div className="text-[11px] font-semibold text-slate-500 leading-tight">Total Parcels</div>
                <div className="text-[9px] text-slate-400">Last updated: 18 May 2025</div>
              </div>
            </div>

            <div className="h-8 w-px bg-slate-200 hidden md:block" />

            {/* Metric 2: Total Buildings */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-base font-extrabold text-slate-800 leading-tight">8,932</div>
                <div className="text-[11px] font-semibold text-slate-500 leading-tight">Total Buildings</div>
                <div className="text-[9px] text-slate-400">Last updated: 18 May 2025</div>
              </div>
            </div>

            <div className="h-8 w-px bg-slate-200 hidden md:block" />

            {/* Metric 3: Total Issues */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="text-base font-extrabold text-slate-800 leading-tight">126</div>
                <div className="text-[11px] font-semibold text-slate-500 leading-tight">Total Issues</div>
                <div className="text-[9px] text-slate-400">Last updated: 18 May 2025</div>
              </div>
            </div>

            <div className="h-8 w-px bg-slate-200 hidden md:block" />

            {/* Metric 4: Accuracy AI */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="text-base font-extrabold text-emerald-700 leading-tight">94%</div>
                <div className="text-[11px] font-semibold text-slate-500 leading-tight">Accuracy (AI)</div>
                <div className="text-[9px] text-slate-400">Model Confidence</div>
              </div>
            </div>

            <div className="h-8 w-px bg-slate-200 hidden lg:block" />

            {/* Metric 5: Model Performance Widget */}
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl px-3 py-1.5 min-w-[170px] space-y-1">
              <div className="text-[10px] font-bold text-slate-700 flex justify-between">
                <span>Model Performance</span>
              </div>
              {/* Bar 1: Confidence */}
              <div>
                <div className="flex justify-between text-[9px] text-slate-600 font-medium">
                  <span>Confidence</span>
                  <span className="font-bold text-cyan-700">92.4%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full" style={{ width: '92.4%' }} />
                </div>
              </div>
              {/* Bar 2: IoU */}
              <div>
                <div className="flex justify-between text-[9px] text-slate-600 font-medium">
                  <span>IoU (Testing)</span>
                  <span className="font-bold text-amber-700">89.6%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full" style={{ width: '89.6%' }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Layers & Parcel Details (Image 2 style) */}
        <div className="w-72 bg-white rounded-2xl border border-slate-200/90 shadow-sm flex flex-col overflow-hidden flex-shrink-0">
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
                  <div className="flex items-start gap-2 border-b border-blue-100 pb-2.5">
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
                      <span className="font-medium text-slate-700">{selectedParcel.predictedBy || 'LAND-AI Model v2.1'}</span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-500 text-[11px]">Created On</span>
                      <span className="text-slate-700 text-[11px]">{selectedParcel.createdOn || '18 May 2025 10:44 AM'}</span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-blue-100/60">
                      <span className="text-slate-500 text-[11px]">Status</span>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full text-[10px] font-bold">
                        Pending Approval
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

          {/* Right Panel Footer Actions (Image 2 style) */}
          <div className="p-3.5 border-t border-slate-100 bg-slate-50/50 flex gap-2">
            <button
              onClick={() => {
                if (selectedParcel) {
                  alert(`Editing vector bounding polygon for ${selectedParcel.id}`);
                }
              }}
              className="flex-1 py-2 px-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
            >
              <Pencil className="w-3.5 h-3.5 text-slate-500" />
              <span>Edit Bounding</span>
            </button>

            <button
              onClick={() => {
                if (selectedParcel) {
                  acceptAIBoundary(selectedParcel.id);
                  alert(`Parcel ${selectedParcel.id} approved successfully.`);
                }
              }}
              className="flex-1 py-2 px-3 bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
            >
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>Approve</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
