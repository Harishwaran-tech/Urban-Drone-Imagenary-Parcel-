import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import {
  MapContainer,
  TileLayer,
  Polygon as LeafletPolygon,
  Polyline,
  Marker,
  Popup,
  ImageOverlay,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Layers,
  Map as MapIcon,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  FileText,
  Download,
  FileJson,
  FileSpreadsheet,
  Check,
  Eye,
  Box,
  Compass,
  Cpu,
  Database,
  Server,
  ArrowRight,
  Sparkles,
  Maximize2,
  RotateCcw,
  Plus,
  Minus,
  Navigation,
  Info,
} from 'lucide-react';
import { generateGTPoints } from '@/data/mockData';
import type { Parcel, GTPoint, GNSSPoint } from '@/types';

// Coordinate Transformation for Leaflet (Chennai Ward 42)
const M = 1000;
const BASE_LAT = 13.0827;
const BASE_LNG = 80.2707;
const LAT_SPAN = 0.010;
const LNG_SPAN = 0.012;

function localToLatLng(x: number, y: number): [number, number] {
  const lat = BASE_LAT + (0.5 - y / M) * LAT_SPAN;
  const lng = BASE_LNG + (x / M - 0.5) * LNG_SPAN;
  return [lat, lng];
}

// Custom Leaflet Icons for Ground Truth and GNSS Points
const gtIcon = new L.DivIcon({
  html: `<div style="
    width: 20px;
    height: 20px;
    background: #16a34a;
    border: 2px solid #ffffff;
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    box-shadow: 0 2px 5px rgba(0,0,0,0.4);
    display: flex;
    align-items: center;
    justify-content: center;
  "><div style="width: 6px; height: 6px; background: #ffffff; border-radius: 50%; transform: rotate(45deg);"></div></div>`,
  className: 'gt-custom-pin',
  iconSize: [20, 20],
  iconAnchor: [10, 20],
  popupAnchor: [0, -18],
});

const gnssIcon = new L.DivIcon({
  html: `<div style="
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
  ">
    <div style="
      width: 14px;
      height: 14px;
      border: 2px solid #f97316;
      border-radius: 50%;
      background: rgba(249, 115, 22, 0.25);
      position: relative;
    ">
      <div style="position: absolute; top: 4px; left: 4px; width: 2px; height: 2px; background: #ea580c; border-radius: 50%;"></div>
    </div>
  </div>`,
  className: 'gnss-custom-pin',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  popupAnchor: [0, -8],
});

// Map Controller for Zoom Buttons
function MapZoomButtons({ onZoomIn, onZoomOut }: { onZoomIn: () => void; onZoomOut: () => void }) {
  return (
    <div className="absolute top-3.5 right-3.5 z-[400] flex flex-col gap-1.5 shadow-md">
      <div className="bg-white/95 backdrop-blur-md rounded-xl p-1 border border-slate-200 flex flex-col">
        <button
          onClick={onZoomIn}
          className="w-7 h-7 flex items-center justify-center text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          title="Zoom In"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <div className="h-px bg-slate-200 my-0.5" />
        <button
          onClick={onZoomOut}
          className="w-7 h-7 flex items-center justify-center text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          title="Zoom Out"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function ArchitectureOutputs() {
  const { parcels, buildings, roads, gnssPoints, activeProject, setCurrentPage, setViewMode } = useApp();
  const [activeTab, setActiveTab] = useState<'outputs' | 'pipeline'>('outputs');
  const [view3D, setView3D] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Map Layer Toggles matching Column 3 "A. WEB-GIS DASHBOARD (SAMPLE VIEW)"
  const [layers, setLayers] = useState({
    parcels: true,
    buildings: true,
    roads: true,
    landUse: true,
    existingGis: true,
    gtPoints: true,
    gnssPoints: true,
    dsmHillshade: false,
    oriImagery: true,
  });

  const toggleLayer = (key: keyof typeof layers) => {
    setLayers(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const mapRef = useRef<L.Map | null>(null);

  const gtPointsList = useMemo(() => generateGTPoints(), []);

  // Pre-calculate Land Use classifications for parcels to match diagram
  const landUseClasses = useMemo(() => {
    return parcels.map((p, idx) => {
      let type: 'Residential' | 'Commercial' | 'Open / Vacant' | 'Industrial' | 'Others' = 'Residential';
      if (idx % 5 === 1) type = 'Commercial';
      else if (idx % 5 === 2) type = 'Open / Vacant';
      else if (idx % 5 === 3) type = 'Industrial';
      else if (idx % 7 === 0) type = 'Others';
      return { id: p.id, type };
    });
  }, [parcels]);

  const getLandUseColor = (type: string) => {
    switch (type) {
      case 'Residential':
        return { fill: '#f43f5e', stroke: '#e11d48' }; // Pink / Red
      case 'Commercial':
        return { fill: '#a855f7', stroke: '#9333ea' }; // Purple
      case 'Open / Vacant':
        return { fill: '#22c55e', stroke: '#16a34a' }; // Green
      case 'Industrial':
        return { fill: '#06b6d4', stroke: '#0891b2' }; // Blue / Teal
      default:
        return { fill: '#eab308', stroke: '#ca8a04' }; // Yellow
    }
  };

  // Specific overlap polygons matching diagram (3 Overlaps)
  const overlapZones = useMemo(() => [
    {
      id: 'OVL-01',
      coords: [
        localToLatLng(360, 310),
        localToLatLng(430, 310),
        localToLatLng(430, 380),
        localToLatLng(360, 380),
      ],
      label: 'Overlap #1 (2.4% variance)',
    },
    {
      id: 'OVL-02',
      coords: [
        localToLatLng(490, 520),
        localToLatLng(550, 520),
        localToLatLng(550, 580),
        localToLatLng(490, 580),
      ],
      label: 'Overlap #2 (Adjoining Lot)',
    },
    {
      id: 'OVL-03',
      coords: [
        localToLatLng(680, 420),
        localToLatLng(730, 420),
        localToLatLng(730, 470),
        localToLatLng(680, 470),
      ],
      label: 'Overlap #3 (Cadastral Boundary Encroachment)',
    },
  ], []);

  // Specific gap polygons matching diagram (2 Gaps)
  const gapZones = useMemo(() => [
    {
      id: 'GAP-01',
      coords: [
        localToLatLng(240, 470),
        localToLatLng(260, 470),
        localToLatLng(260, 530),
        localToLatLng(240, 530),
      ],
      label: 'Gap #1 (1.6% variance)',
    },
    {
      id: 'GAP-02',
      coords: [
        localToLatLng(575, 630),
        localToLatLng(605, 630),
        localToLatLng(605, 670),
        localToLatLng(575, 670),
      ],
      label: 'Gap #2 (Unmapped corridor)',
    },
  ], []);

  // Download Handlers for Section E
  const handleDownloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setExportNotice(`Exported ${filename} successfully.`);
    setTimeout(() => setExportNotice(null), 3500);
  };

  const handleExportGeoJSON = () => {
    const featureCollection = {
      type: 'FeatureCollection',
      name: 'Chennai_Ward_42_AI_Cadastral_Output',
      crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
      features: parcels.map((p, idx) => ({
        type: 'Feature',
        id: p.id,
        properties: {
          parcelId: p.id,
          surveyNumber: p.surveyNumber,
          areaSqM: p.aiArea,
          confidence: p.confidence,
          landUse: landUseClasses[idx]?.type || 'Residential',
          status: p.status,
          gtVerified: idx % 3 !== 0,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              ...p.aiGeometry.map(pt => {
                const [lat, lng] = localToLatLng(pt.x, pt.y);
                return [Number(lng.toFixed(6)), Number(lat.toFixed(6))];
              }),
              // Close ring
              (() => {
                const first = p.aiGeometry[0] || { x: 0, y: 0 };
                const [lat, lng] = localToLatLng(first.x, first.y);
                return [Number(lng.toFixed(6)), Number(lat.toFixed(6))];
              })(),
            ],
          ],
        },
      })),
    };
    handleDownloadFile(JSON.stringify(featureCollection, null, 2), 'cadastral_output_ward42.geojson', 'application/geo+json');
  };

  const handleExportKML = () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Chennai Ward 42 AI Cadastral Output</name>
    ${parcels.slice(0, 40).map((p, idx) => {
      const coords = p.aiGeometry.map(pt => {
        const [lat, lng] = localToLatLng(pt.x, pt.y);
        return `${lng.toFixed(6)},${lat.toFixed(6)},0`;
      }).join(' ');
      return `
    <Placemark>
      <name>${p.id}</name>
      <description>Survey No: ${p.surveyNumber} | Area: ${p.aiArea} m² | Confidence: ${p.confidence}%</description>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${coords}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>`;
    }).join('')}
  </Document>
</kml>`;
    handleDownloadFile(kml, 'cadastral_output_ward42.kml', 'application/vnd.google-earth.kml+xml');
  };

  const handleExportDXF = () => {
    // Minimal ASCII DXF Format for AutoCAD CAD integration
    let dxf = `0\nSECTION\n2\nENTITIES\n`;
    parcels.slice(0, 30).forEach(p => {
      dxf += `0\nLWPOLYLINE\n8\nPARCEL_BOUNDARIES\n90\n${p.aiGeometry.length}\n70\n1\n`;
      p.aiGeometry.forEach(pt => {
        const [lat, lng] = localToLatLng(pt.x, pt.y);
        dxf += `10\n${(lng * 10000).toFixed(2)}\n20\n${(lat * 10000).toFixed(2)}\n`;
      });
    });
    dxf += `0\nENDSEC\n0\nEOF\n`;
    handleDownloadFile(dxf, 'cadastral_vectors_ward42.dxf', 'application/dxf');
  };

  const handleExportShapefile = () => {
    // Generates GeoJSON-based Shapefile bundle description
    const shpMeta = `Shapefile Export Definition:
Projection: EPSG:4326 - WGS 84
Feature Count: 126 Polygons
Layer: cadastral_parcels
Attributes: [id, survey_no, area_sqm, conf_pct, land_use, status]
Generated by: AI-Enabled Cadastral Mapping Platform (FastAPI / GeoPandas)`;
    handleDownloadFile(shpMeta, 'cadastral_shapefile_meta.txt', 'text/plain');
  };

  const handleExportPDF = () => {
    window.print();
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-100 text-slate-800 font-sans">
      
      {/* Top Header Banner */}
      <div className="bg-slate-900 text-white px-6 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-4 shadow-md">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-sm">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                AI-ENABLED AUTOMATED CADASTRAL MAPPING PLATFORM
                <span className="text-[10px] bg-blue-500/30 text-blue-300 font-mono px-2 py-0.5 rounded border border-blue-400/40 uppercase">
                  Complete Architecture
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Outputs Verification, Deep Learning Segmentation, Vectorization & Topology Analysis
              </p>
            </div>
          </div>
        </div>

        {/* View Switcher Pill (Outputs Dashboard vs Full Architecture) */}
        <div className="flex items-center gap-1.5 bg-slate-800/90 p-1 rounded-xl border border-slate-700/80">
          <button
            onClick={() => setActiveTab('outputs')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'outputs'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Outputs Dashboard (Sample View)</span>
          </button>
          <button
            onClick={() => setActiveTab('pipeline')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'pipeline'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Complete Platform Architecture</span>
          </button>
        </div>
      </div>

      {/* Floating Export Notice Toast */}
      {exportNotice && (
        <div className="fixed bottom-6 right-6 z-[999] bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-2xl border border-emerald-500/50 flex items-center gap-2.5 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{exportNotice}</span>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 p-5 max-w-[1700px] w-full mx-auto space-y-6">

        {activeTab === 'outputs' ? (
          /* ========================================================================= */
          /* TAB 1: OUTPUTS DASHBOARD (SAMPLE VIEW) - FAITHFUL REPRODUCTION OF COLUMN 3 */
          /* ========================================================================= */
          <div className="space-y-6">

            {/* A. WEB-GIS DASHBOARD (SAMPLE VIEW) CONTAINER */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden flex flex-col">
              
              {/* Header Bar */}
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <h2 className="font-bold text-sm text-slate-800 tracking-wide uppercase">
                    A. WEB-GIS DASHBOARD <span className="text-slate-500 font-semibold normal-case">(SAMPLE VIEW)</span>
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-mono">Ward 42, Chennai • Scale 1:2,500</span>
                  <button
                    onClick={() => {
                      setViewMode('webgis');
                      setCurrentPage('cadastral-map');
                    }}
                    className="px-2.5 py-1 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    Open Full GIS <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Map Viewport with Floating Controls */}
              <div className="relative w-full h-[520px] bg-slate-900 overflow-hidden">

                {/* Floating Layers Checklist Panel (Top-Left, matching diagram) */}
                <div className="absolute top-3.5 left-3.5 z-[400] bg-slate-950/90 backdrop-blur-md rounded-xl p-3 shadow-xl border border-slate-800/80 text-white min-w-[170px] select-none">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-blue-400" />
                      Layers
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    {/* Parcels */}
                    <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-900/60 p-1 rounded transition-colors">
                      <input
                        type="checkbox"
                        checked={layers.parcels}
                        onChange={() => toggleLayer('parcels')}
                        className="rounded border-slate-700 text-yellow-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer accent-yellow-500"
                      />
                      <span className="w-2.5 h-2.5 rounded-xs border-2 border-yellow-400 bg-yellow-400/20" />
                      <span className={layers.parcels ? 'text-slate-200' : 'text-slate-500'}>Parcels</span>
                    </label>

                    {/* Buildings */}
                    <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-900/60 p-1 rounded transition-colors">
                      <input
                        type="checkbox"
                        checked={layers.buildings}
                        onChange={() => toggleLayer('buildings')}
                        className="rounded border-slate-700 text-red-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer accent-red-500"
                      />
                      <span className="w-2.5 h-2.5 rounded-xs border-2 border-red-500 bg-red-500/20" />
                      <span className={layers.buildings ? 'text-slate-200' : 'text-slate-500'}>Buildings</span>
                    </label>

                    {/* Roads */}
                    <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-900/60 p-1 rounded transition-colors">
                      <input
                        type="checkbox"
                        checked={layers.roads}
                        onChange={() => toggleLayer('roads')}
                        className="rounded border-slate-700 text-slate-200 focus:ring-0 w-3.5 h-3.5 cursor-pointer accent-slate-200"
                      />
                      <span className="w-3 h-0.5 bg-white" />
                      <span className={layers.roads ? 'text-slate-200' : 'text-slate-500'}>Roads</span>
                    </label>

                    {/* Land-Use */}
                    <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-900/60 p-1 rounded transition-colors">
                      <input
                        type="checkbox"
                        checked={layers.landUse}
                        onChange={() => toggleLayer('landUse')}
                        className="rounded border-slate-700 text-blue-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer accent-blue-500"
                      />
                      <span className="w-2.5 h-2.5 rounded-xs border border-purple-400 bg-purple-500/50" />
                      <span className={layers.landUse ? 'text-slate-200' : 'text-slate-500'}>Land-Use</span>
                    </label>

                    {/* Existing GIS */}
                    <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-900/60 p-1 rounded transition-colors">
                      <input
                        type="checkbox"
                        checked={layers.existingGis}
                        onChange={() => toggleLayer('existingGis')}
                        className="rounded border-slate-700 text-cyan-400 focus:ring-0 w-3.5 h-3.5 cursor-pointer accent-cyan-400"
                      />
                      <span className="w-2.5 h-2.5 rounded-xs border-2 border-dashed border-cyan-400" />
                      <span className={layers.existingGis ? 'text-slate-200' : 'text-slate-500'}>Existing GIS</span>
                    </label>

                    {/* GT Points */}
                    <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-900/60 p-1 rounded transition-colors">
                      <input
                        type="checkbox"
                        checked={layers.gtPoints}
                        onChange={() => toggleLayer('gtPoints')}
                        className="rounded border-slate-700 text-emerald-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer accent-emerald-500"
                      />
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className={layers.gtPoints ? 'text-slate-200' : 'text-slate-500'}>GT Points</span>
                    </label>

                    {/* GNSS Points */}
                    <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-900/60 p-1 rounded transition-colors">
                      <input
                        type="checkbox"
                        checked={layers.gnssPoints}
                        onChange={() => toggleLayer('gnssPoints')}
                        className="rounded border-slate-700 text-orange-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer accent-orange-500"
                      />
                      <span className="w-2.5 h-2.5 rounded-full border border-orange-400 flex items-center justify-center">
                        <span className="w-1 h-1 rounded-full bg-orange-400" />
                      </span>
                      <span className={layers.gnssPoints ? 'text-slate-200' : 'text-slate-500'}>GNSS Points</span>
                    </label>

                    {/* DSM Hillshade */}
                    <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-900/60 p-1 rounded transition-colors">
                      <input
                        type="checkbox"
                        checked={layers.dsmHillshade}
                        onChange={() => toggleLayer('dsmHillshade')}
                        className="rounded border-slate-700 text-slate-400 focus:ring-0 w-3.5 h-3.5 cursor-pointer accent-slate-400"
                      />
                      <span className="w-2.5 h-2.5 rounded-xs bg-slate-500" />
                      <span className={layers.dsmHillshade ? 'text-slate-200' : 'text-slate-500'}>DSM Hillshade</span>
                    </label>

                    {/* ORI Imagery */}
                    <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-900/60 p-1 rounded transition-colors">
                      <input
                        type="checkbox"
                        checked={layers.oriImagery}
                        onChange={() => toggleLayer('oriImagery')}
                        className="rounded border-slate-700 text-green-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer accent-green-500"
                      />
                      <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600" />
                      <span className={layers.oriImagery ? 'text-slate-200' : 'text-slate-500'}>ORI Imagery</span>
                    </label>
                  </div>
                </div>

                {/* Floating 2D/3D Switcher Pill (Top-Right, matching diagram) */}
                <div className="absolute top-3.5 right-14 z-[400] bg-white/95 backdrop-blur-md rounded-xl p-1 shadow-md border border-slate-200 flex items-center gap-1">
                  <button
                    onClick={() => setView3D(false)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                      !view3D ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <MapIcon className="w-3 h-3" />
                    <span>2D</span>
                  </button>
                  <button
                    onClick={() => {
                      setViewMode('3d_twin');
                      setCurrentPage('cadastral-map');
                    }}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                      view3D ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Box className="w-3 h-3" />
                    <span>3D</span>
                  </button>
                </div>

                {/* Leaflet Zoom Control UI */}
                <MapZoomButtons
                  onZoomIn={() => mapRef.current?.zoomIn()}
                  onZoomOut={() => mapRef.current?.zoomOut()}
                />

                {/* Leaflet Map Engine */}
                <MapContainer
                  center={[BASE_LAT, BASE_LNG]}
                  zoom={16.5}
                  zoomSnap={0.5}
                  zoomControl={false}
                  attributionControl={false}
                  className="w-full h-full z-0"
                  ref={(m) => { if (m) mapRef.current = m; }}
                >
                  {/* Google Satellite Tiles */}
                  <TileLayer
                    url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
                    maxZoom={20}
                    opacity={layers.oriImagery ? 1.0 : 0.6}
                  />

                  {/* DSM Hillshade Elevation Simulation Layer */}
                  {layers.dsmHillshade && (
                    <div className="leaflet-tile-pane mix-blend-overlay opacity-50" />
                  )}

                  {/* Land-Use Shaded Polygons */}
                  {layers.landUse && parcels.map((parcel, idx) => {
                    const lu = landUseClasses[idx] || { type: 'Residential' };
                    const col = getLandUseColor(lu.type);
                    const latlngs = parcel.aiGeometry.map(pt => localToLatLng(pt.x, pt.y));
                    return (
                      <LeafletPolygon
                        key={`lu-${parcel.id}`}
                        positions={latlngs}
                        pathOptions={{
                          fillColor: col.fill,
                          fillOpacity: 0.35,
                          stroke: false,
                        }}
                      />
                    );
                  })}

                  {/* Existing GIS Boundaries (Cyan Outlines) */}
                  {layers.existingGis && parcels.map((parcel) => {
                    const latlngs = (parcel.existingGeometry || parcel.aiGeometry).map(pt => localToLatLng(pt.x, pt.y));
                    return (
                      <LeafletPolygon
                        key={`ex-${parcel.id}`}
                        positions={latlngs}
                        pathOptions={{
                          color: '#06b6d4',
                          weight: 1.8,
                          dashArray: '4, 4',
                          fill: false,
                        }}
                      />
                    );
                  })}

                  {/* AI Predicted Parcel Boundaries (Yellow Polygons) */}
                  {layers.parcels && parcels.map((parcel) => {
                    const latlngs = parcel.aiGeometry.map(pt => localToLatLng(pt.x, pt.y));
                    return (
                      <LeafletPolygon
                        key={`p-${parcel.id}`}
                        positions={latlngs}
                        pathOptions={{
                          color: '#eab308', // Yellow outline matching diagram legend
                          weight: 2.2,
                          fill: false,
                        }}
                      >
                        <Popup>
                          <div className="text-xs p-1">
                            <div className="font-bold text-slate-800">{parcel.id}</div>
                            <div className="text-slate-500">Survey No: {parcel.surveyNumber}</div>
                            <div className="text-slate-500">Area: {parcel.aiArea} m²</div>
                            <div className="text-blue-600 font-semibold">Conf: {parcel.confidence}%</div>
                          </div>
                        </Popup>
                      </LeafletPolygon>
                    );
                  })}

                  {/* Building Footprints (Red / Terracotta Outlines) */}
                  {layers.buildings && buildings.map((building) => {
                    const latlngs = building.geometry.map(pt => localToLatLng(pt.x, pt.y));
                    return (
                      <LeafletPolygon
                        key={`b-${building.id}`}
                        positions={latlngs}
                        pathOptions={{
                          color: '#ef4444', // Red outline matching diagram legend
                          weight: 2,
                          fillColor: '#b91c1c',
                          fillOpacity: 0.25,
                        }}
                      />
                    );
                  })}

                  {/* Road Centerlines / Corridors (White Lines) */}
                  {layers.roads && roads.map((road) => {
                    const latlngs = road.path.map(pt => localToLatLng(pt.x, pt.y));
                    return (
                      <Polyline
                        key={`r-${road.id}`}
                        positions={latlngs}
                        pathOptions={{
                          color: '#ffffff', // White road/path matching diagram legend
                          weight: 3.5,
                          opacity: 0.9,
                        }}
                      />
                    );
                  })}

                  {/* Overlap Issues (Red Dashed Outlines) */}
                  {overlapZones.map((zone) => (
                    <LeafletPolygon
                      key={zone.id}
                      positions={zone.coords}
                      pathOptions={{
                        color: '#ef4444',
                        dashArray: '6, 6',
                        weight: 2.5,
                        fillColor: '#ef4444',
                        fillOpacity: 0.2,
                      }}
                    >
                      <Popup>
                        <div className="text-xs font-bold text-red-600">{zone.label}</div>
                      </Popup>
                    </LeafletPolygon>
                  ))}

                  {/* Gap Issues (Orange Dashed Outlines) */}
                  {gapZones.map((zone) => (
                    <LeafletPolygon
                      key={zone.id}
                      positions={zone.coords}
                      pathOptions={{
                        color: '#f97316',
                        dashArray: '6, 6',
                        weight: 2.5,
                        fillColor: '#f97316',
                        fillOpacity: 0.2,
                      }}
                    >
                      <Popup>
                        <div className="text-xs font-bold text-orange-600">{zone.label}</div>
                      </Popup>
                    </LeafletPolygon>
                  ))}

                  {/* GT Points (Green Pins) */}
                  {layers.gtPoints && gtPointsList.map((gt) => (
                    <Marker
                      key={gt.id}
                      position={[gt.latitude, gt.longitude]}
                      icon={gtIcon}
                    >
                      <Popup>
                        <div className="text-xs p-1">
                          <div className="font-bold text-emerald-700">{gt.id} (Ground Truth)</div>
                          <div className="text-slate-500">Type: {gt.type}</div>
                          <div className="text-slate-400">Lat: {gt.latitude}, Lng: {gt.longitude}</div>
                        </div>
                      </Popup>
                    </Marker>
                  ))}

                  {/* GNSS / CORS Points (Crosshair Pins) */}
                  {layers.gnssPoints && gnssPoints.map((gnss) => (
                    <Marker
                      key={gnss.id}
                      position={[gnss.latitude, gnss.longitude]}
                      icon={gnssIcon}
                    >
                      <Popup>
                        <div className="text-xs p-1">
                          <div className="font-bold text-orange-600">{gnss.id} (GNSS/CORS)</div>
                          <div className="text-slate-500">RMSE Accuracy: ±0.18m</div>
                          <div className="text-slate-400">{gnss.surveyDate}</div>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>

                {/* Bottom Map Attribution & Scale */}
                <div className="absolute bottom-2 right-2 z-[400] bg-black/60 backdrop-blur-xs text-[10px] text-white/90 px-2 py-0.5 rounded font-mono pointer-events-none">
                  Google | Imagery Map Data ©2025 | Scale: 1:2,500
                </div>
              </div>
            </div>

            {/* B. ANALYTICS & SUMMARY (8 KPI GRID MATCHING DIAGRAM) */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <h3 className="font-bold text-sm text-slate-800 tracking-wide uppercase">
                  B. ANALYTICS & SUMMARY
                </h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                {/* 1. Parcels Extracted */}
                <div className="bg-white rounded-xl p-3.5 border border-slate-200/90 shadow-2xs text-center">
                  <div className="text-2xl font-black text-slate-900">126</div>
                  <div className="text-[11px] font-semibold text-slate-500 mt-0.5">Parcels Extracted</div>
                </div>

                {/* 2. High Confidence */}
                <div className="bg-white rounded-xl p-3.5 border border-slate-200/90 shadow-2xs text-center">
                  <div className="text-2xl font-black text-blue-600">118</div>
                  <div className="text-[11px] font-semibold text-slate-500 mt-0.5">
                    High Confidence <span className="text-[10px] text-blue-500 font-normal">(93.7%)</span>
                  </div>
                </div>

                {/* 3. Buildings Detected */}
                <div className="bg-white rounded-xl p-3.5 border border-slate-200/90 shadow-2xs text-center">
                  <div className="text-2xl font-black text-amber-600">94</div>
                  <div className="text-[11px] font-semibold text-slate-500 mt-0.5">Buildings Detected</div>
                </div>

                {/* 4. Road Segments */}
                <div className="bg-white rounded-xl p-3.5 border border-slate-200/90 shadow-2xs text-center">
                  <div className="text-2xl font-black text-slate-800">16</div>
                  <div className="text-[11px] font-semibold text-slate-500 mt-0.5">Road Segments</div>
                </div>

                {/* 5. Pathways / Access */}
                <div className="bg-white rounded-xl p-3.5 border border-slate-200/90 shadow-2xs text-center">
                  <div className="text-2xl font-black text-slate-800">9</div>
                  <div className="text-[11px] font-semibold text-slate-500 mt-0.5">Pathways / Access</div>
                </div>

                {/* 6. Land-Use Classes */}
                <div className="bg-white rounded-xl p-3.5 border border-slate-200/90 shadow-2xs text-center">
                  <div className="text-2xl font-black text-purple-600">5</div>
                  <div className="text-[11px] font-semibold text-slate-500 mt-0.5">Land-Use Classes</div>
                </div>

                {/* 7. Overlaps */}
                <div className="bg-white rounded-xl p-3.5 border border-red-200 bg-red-50/30 shadow-2xs text-center">
                  <div className="text-2xl font-black text-red-600">3</div>
                  <div className="text-[11px] font-semibold text-red-700 mt-0.5">Overlaps</div>
                </div>

                {/* 8. Gaps */}
                <div className="bg-white rounded-xl p-3.5 border border-amber-200 bg-amber-50/30 shadow-2xs text-center">
                  <div className="text-2xl font-black text-amber-600">2</div>
                  <div className="text-[11px] font-semibold text-amber-700 mt-0.5">Gaps</div>
                </div>
              </div>
            </div>

            {/* C & D: TOPOLOGY STATUS & VALIDATION RESULTS (2-COLUMN SPLIT) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* C. TOPOLOGY STATUS */}
              <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <h3 className="font-bold text-sm text-slate-800 tracking-wide uppercase">
                      C. TOPOLOGY STATUS
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                    {/* Left Breakdown List */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50/80 border border-emerald-100">
                        <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Valid Parcels</span>
                        </div>
                        <span className="text-xs font-black text-emerald-900">120 (95.2%)</span>
                      </div>

                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-red-50/80 border border-red-100">
                        <div className="flex items-center gap-2 text-xs font-bold text-red-800">
                          <AlertTriangle className="w-4 h-4 text-red-600" />
                          <span>Overlapping Parcels</span>
                        </div>
                        <span className="text-xs font-black text-red-900">3 (2.4%)</span>
                      </div>

                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50/80 border border-amber-100">
                        <div className="flex items-center gap-2 text-xs font-bold text-amber-800">
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                          <span>Parcel Gaps</span>
                        </div>
                        <span className="text-xs font-black text-amber-900">2 (1.6%)</span>
                      </div>

                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-rose-50/80 border border-rose-100">
                        <div className="flex items-center gap-2 text-xs font-bold text-rose-800">
                          <AlertCircle className="w-4 h-4 text-rose-600" />
                          <span>Invalid Geometry</span>
                        </div>
                        <span className="text-xs font-black text-rose-900">1 (0.8%)</span>
                      </div>
                    </div>

                    {/* Right: Sample Issue View Thumbnail */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-950 flex flex-col shadow-inner">
                      <div className="bg-slate-900 px-3 py-1.5 border-b border-slate-800 flex items-center justify-between text-[10px] font-bold text-slate-300">
                        <span>Sample Issue View</span>
                        <span className="text-red-400 font-mono">Overlap (T-0001)</span>
                      </div>
                      <div className="relative h-36 bg-slate-900 overflow-hidden flex items-center justify-center">
                        <img
                          src="/drone_orthomosaic_ward42.jpg"
                          alt="Sample Issue View"
                          className="w-full h-full object-cover opacity-60"
                        />
                        {/* Red Dashed Overlap Visual Callout */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-24 h-20 border-2 border-dashed border-red-500 bg-red-500/30 rounded flex items-center justify-center text-white text-[10px] font-bold shadow-lg">
                            <span className="bg-red-600 px-1.5 py-0.5 rounded text-[9px]">Overlap Zone</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* D. VALIDATION RESULTS */}
              <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                    <h3 className="font-bold text-sm text-slate-800 tracking-wide uppercase">
                      D. VALIDATION RESULTS
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    {/* Match with Existing GIS */}
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
                      <div className="text-xs text-slate-500 font-medium">Match with Existing GIS</div>
                      <div className="text-2xl font-black text-slate-900 mt-1">92.6%</div>
                      <div className="text-[10px] text-emerald-600 font-semibold mt-1">Cadastral Boundary Fit</div>
                    </div>

                    {/* GT Verified Parcels */}
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
                      <div className="text-xs text-slate-500 font-medium">GT Verified Parcels</div>
                      <div className="text-2xl font-black text-emerald-600 mt-1">87</div>
                      <div className="text-[10px] text-slate-400 mt-1">Field Validated Points</div>
                    </div>

                    {/* GNSS / CORS RMSE */}
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
                      <div className="text-xs text-slate-500 font-medium">GNSS / CORS RMSE</div>
                      <div className="text-2xl font-black text-blue-600 mt-1">0.18 m</div>
                      <div className="text-[10px] text-slate-400 mt-1">Positional Accuracy</div>
                    </div>

                    {/* Requires Field Verification */}
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
                      <div className="text-xs text-slate-500 font-medium">Requires Field Verification</div>
                      <div className="text-2xl font-black text-amber-600 mt-1">11</div>
                      <div className="text-[10px] text-amber-700 font-semibold mt-1">Surveyor Review Queue</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* E. EXPORTABLE OUTPUTS (5 DOWNLOAD TILES MATCHING DIAGRAM) */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                <h3 className="font-bold text-sm text-slate-800 tracking-wide uppercase">
                  E. EXPORTABLE OUTPUTS
                </h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
                {/* 1. GeoJSON */}
                <button
                  onClick={handleExportGeoJSON}
                  className="flex flex-col items-center justify-center p-4 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40 transition-all text-center cursor-pointer group shadow-2xs"
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 mb-2 group-hover:scale-105 transition-transform">
                    <FileJson className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-slate-800 group-hover:text-emerald-700">GeoJSON</span>
                  <span className="text-[10px] text-slate-400">.geojson standard</span>
                </button>

                {/* 2. Shapefile (.shp) */}
                <button
                  onClick={handleExportShapefile}
                  className="flex flex-col items-center justify-center p-4 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/40 transition-all text-center cursor-pointer group shadow-2xs"
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 mb-2 group-hover:scale-105 transition-transform">
                    <Layers className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-slate-800 group-hover:text-blue-700">Shapefile</span>
                  <span className="text-[10px] text-slate-400">.shp archive</span>
                </button>

                {/* 3. KML */}
                <button
                  onClick={handleExportKML}
                  className="flex flex-col items-center justify-center p-4 rounded-xl border border-slate-200 hover:border-purple-500 hover:bg-purple-50/40 transition-all text-center cursor-pointer group shadow-2xs"
                >
                  <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600 mb-2 group-hover:scale-105 transition-transform">
                    <Compass className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-slate-800 group-hover:text-purple-700">KML</span>
                  <span className="text-[10px] text-slate-400">.kml Google Earth</span>
                </button>

                {/* 4. DXF */}
                <button
                  onClick={handleExportDXF}
                  className="flex flex-col items-center justify-center p-4 rounded-xl border border-slate-200 hover:border-amber-500 hover:bg-amber-50/40 transition-all text-center cursor-pointer group shadow-2xs"
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 mb-2 group-hover:scale-105 transition-transform">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-slate-800 group-hover:text-amber-700">DXF</span>
                  <span className="text-[10px] text-slate-400">AutoCAD .dxf</span>
                </button>

                {/* 5. Cadastral Report (PDF) */}
                <button
                  onClick={handleExportPDF}
                  className="flex flex-col items-center justify-center p-4 rounded-xl border border-red-200 bg-red-50/20 hover:border-red-500 hover:bg-red-50 transition-all text-center cursor-pointer group shadow-2xs"
                >
                  <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-600 mb-2 group-hover:scale-105 transition-transform">
                    <Download className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-slate-800 group-hover:text-red-700">Cadastral Report</span>
                  <span className="text-[10px] text-red-600 font-semibold">(PDF Report)</span>
                </button>
              </div>
            </div>

            {/* BOTTOM SECTION: LEGEND (MAP SYMBOLS) */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                Legend (Map Symbols)
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs">
                {/* Parcel Boundary */}
                <div className="flex items-center gap-2">
                  <span className="w-4 h-0.5 bg-yellow-400" />
                  <span className="text-slate-600 font-medium">Parcel Boundary</span>
                </div>

                {/* Building Footprint */}
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-red-500/40 border border-red-500 rounded-xs" />
                  <span className="text-slate-600 font-medium">Building Footprint</span>
                </div>

                {/* Road / Path */}
                <div className="flex items-center gap-2">
                  <span className="w-4 h-1 bg-slate-400 rounded-xs" />
                  <span className="text-slate-600 font-medium">Road / Path</span>
                </div>

                {/* Land-Use Classes */}
                <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
                  <span className="text-slate-500 font-semibold">Land-Use:</span>
                  <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-bold rounded">Residential</span>
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-800 text-[10px] font-bold rounded">Commercial</span>
                  <span className="px-2 py-0.5 bg-green-100 text-green-800 text-[10px] font-bold rounded">Open / Vacant</span>
                  <span className="px-2 py-0.5 bg-cyan-100 text-cyan-800 text-[10px] font-bold rounded">Industrial</span>
                </div>

                {/* Overlap */}
                <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
                  <span className="w-3.5 h-3.5 border-2 border-dashed border-red-500 rounded-xs" />
                  <span className="text-slate-600 font-medium">Overlap (Topology Issue)</span>
                </div>

                {/* Gap */}
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-dashed border-orange-500 rounded-xs" />
                  <span className="text-slate-600 font-medium">Gap (Topology Issue)</span>
                </div>

                {/* GNSS / CORS Point */}
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full border border-orange-500 flex items-center justify-center">
                    <span className="w-1 h-1 rounded-full bg-orange-500" />
                  </span>
                  <span className="text-slate-600 font-medium">GNSS / CORS Point</span>
                </div>

                {/* GT Point */}
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                  <span className="text-slate-600 font-medium">GT Point</span>
                </div>
              </div>
            </div>

          </div>
        ) : (
          /* ========================================================================= */
          /* TAB 2: COMPLETE PLATFORM ARCHITECTURE - INTERACTIVE SYSTEM DIAGRAM FLOW   */
          /* ========================================================================= */
          <div className="space-y-6">
            
            {/* Architecture Overview Card */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6">
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 flex-wrap gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    AI-ENABLED AUTOMATED CADASTRAL MAPPING PLATFORM
                    <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">
                      End-to-End System Architecture
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Multi-modal data ingestion → Deep Learning Feature Extraction → Topology & GIS Validation → WebGIS Platform Outputs
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('outputs')}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Inspect Platform Outputs</span>
                </button>
              </div>

              {/* 3-Column Architecture Diagram Flow */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">

                {/* COLUMN 1: INPUTS (lg:col-span-3) */}
                <div className="lg:col-span-3 bg-slate-50 rounded-2xl border border-slate-200 p-4 flex flex-col justify-between space-y-3">
                  <div className="bg-slate-900 text-white text-xs font-bold px-3 py-1.5 rounded-xl text-center uppercase tracking-wider">
                    Inputs
                  </div>

                  <div className="space-y-2.5">
                    {/* 1. High-Res Drone Imagery */}
                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                      <div className="text-xs font-bold text-slate-800">1. High-Resolution Drone Imagery</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">• RGB Images • 3-10 cm GSD</div>
                    </div>

                    {/* 2. Orthorectified Imagery (ORI) */}
                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                      <div className="text-xs font-bold text-slate-800">2. Orthorectified Imagery (ORI)</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">• Georeferenced • Uniform Scale</div>
                    </div>

                    {/* 3. DSM / DTM (Height Data) */}
                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                      <div className="text-xs font-bold text-slate-800">3. DSM / DTM (Height Data)</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">• DSM (Surface) • DTM (Terrain)</div>
                    </div>

                    {/* 4. Existing GIS Parcel Layers */}
                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                      <div className="text-xs font-bold text-slate-800">4. Existing GIS Parcel Layers</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">• Shapefile / GeoDB • Parcel Boundaries</div>
                    </div>

                    {/* 5. Ground Truth (GT) Datasets */}
                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                      <div className="text-xs font-bold text-slate-800">5. Ground Truth (GT) Datasets</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">• Verified Parcels • Building Footprints</div>
                    </div>

                    {/* 6. GNSS / CORS Survey Data */}
                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                      <div className="text-xs font-bold text-slate-800">6. GNSS / CORS Survey Data</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">• Control Points • High Accuracy (±0.18m)</div>
                    </div>
                  </div>
                </div>

                {/* COLUMN 2: BACKEND PROCESSING PIPELINE (lg:col-span-6) */}
                <div className="lg:col-span-6 bg-blue-50/40 rounded-2xl border border-blue-200 p-4 space-y-3.5 flex flex-col justify-between">
                  <div className="bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl text-center uppercase tracking-wider shadow-xs">
                    Backend Processing Pipeline
                  </div>

                  <div className="space-y-3">
                    {/* Stage 1: Data Ingestion & Preprocessing */}
                    <div className="bg-white p-3 rounded-xl border border-blue-100 shadow-2xs">
                      <div className="text-xs font-bold text-blue-900 mb-1.5">1. DATA INGESTION & PREPROCESSING</div>
                      <div className="flex flex-wrap gap-1 text-[10px]">
                        <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-700 font-medium">Data Upload</span>
                        <span className="text-slate-400">→</span>
                        <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-700 font-medium">Format Standardization</span>
                        <span className="text-slate-400">→</span>
                        <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-700 font-medium">Georeferencing & Tiling</span>
                      </div>
                    </div>

                    {/* Stage 2: AI / Deep Learning Modules */}
                    <div className="bg-white p-3 rounded-xl border border-blue-100 shadow-2xs">
                      <div className="text-xs font-bold text-blue-900 mb-1.5">2. AI / DEEP LEARNING MODULES</div>
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="p-2 bg-rose-50 border border-rose-100 rounded-lg">
                          <span className="font-bold text-rose-800">Parcel Segmentation</span>
                          <div className="text-rose-600">PyTorch U-Net</div>
                        </div>
                        <div className="p-2 bg-amber-50 border border-amber-100 rounded-lg">
                          <span className="font-bold text-amber-800">Building Footprints</span>
                          <div className="text-amber-600">SegFormer</div>
                        </div>
                        <div className="p-2 bg-blue-50 border border-blue-100 rounded-lg">
                          <span className="font-bold text-blue-800">Road & Path Detection</span>
                          <div className="text-blue-600">DeepLabV3+</div>
                        </div>
                        <div className="p-2 bg-purple-50 border border-purple-100 rounded-lg">
                          <span className="font-bold text-purple-800">Height Analysis</span>
                          <div className="text-purple-600">DSM/DTM Normalization</div>
                        </div>
                      </div>
                    </div>

                    {/* Stage 3: Vectorization & Feature Generation */}
                    <div className="bg-white p-3 rounded-xl border border-blue-100 shadow-2xs">
                      <div className="text-xs font-bold text-blue-900 mb-1.5">3. VECTORIZATION & FEATURE GENERATION</div>
                      <div className="flex flex-wrap gap-1 text-[10px]">
                        <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-700 font-medium">Mask Post-processing</span>
                        <span className="text-slate-400">→</span>
                        <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-700 font-medium">Contour Extraction</span>
                        <span className="text-slate-400">→</span>
                        <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-700 font-medium">Polygon/Line Gen</span>
                      </div>
                    </div>

                    {/* Stage 4: Topology & Geometry Validation */}
                    <div className="bg-white p-3 rounded-xl border border-blue-100 shadow-2xs">
                      <div className="text-xs font-bold text-blue-900 mb-1.5">4. TOPOLOGY & GEOMETRY VALIDATION</div>
                      <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                        <span className="p-1.5 bg-slate-50 border border-slate-200 rounded text-center font-medium">Overlap Check</span>
                        <span className="p-1.5 bg-slate-50 border border-slate-200 rounded text-center font-medium">Gap Check</span>
                        <span className="p-1.5 bg-slate-50 border border-slate-200 rounded text-center font-medium">Self-Intersection</span>
                      </div>
                    </div>

                    {/* Stage 5: Database & Services Layer */}
                    <div className="bg-white p-3 rounded-xl border border-blue-100 shadow-2xs flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-blue-900">5. DATABASE & SERVICES LAYER</span>
                        <div className="text-[10px] text-slate-500">PostGIS • FastAPI REST API • Redis/Celery Task Queue</div>
                      </div>
                      <Database className="w-5 h-5 text-blue-500" />
                    </div>
                  </div>
                </div>

                {/* COLUMN 3: OUTPUTS (lg:col-span-3) */}
                <div className="lg:col-span-3 bg-emerald-50/40 rounded-2xl border border-emerald-200 p-4 flex flex-col justify-between space-y-3">
                  <div className="bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl text-center uppercase tracking-wider shadow-xs">
                    Outputs
                  </div>

                  <div className="space-y-2.5">
                    <div className="bg-white p-3 rounded-xl border border-emerald-100 shadow-2xs">
                      <div className="text-xs font-bold text-emerald-900">A. Web-GIS Dashboard</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">2D & 3D Interactive Map with Cadastral Draping</div>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-emerald-100 shadow-2xs">
                      <div className="text-xs font-bold text-emerald-900">B. Analytics & Summary</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">126 Parcels, 94 Buildings, 16 Roads, 5 Land Uses</div>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-emerald-100 shadow-2xs">
                      <div className="text-xs font-bold text-emerald-900">C. Topology Status</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">95.2% Valid, 3 Overlaps, 2 Gaps</div>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-emerald-100 shadow-2xs">
                      <div className="text-xs font-bold text-emerald-900">D. Validation Results</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">92.6% GIS Match, 87 GT Verified, 0.18m RMSE</div>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-emerald-100 shadow-2xs">
                      <div className="text-xs font-bold text-emerald-900">E. Exportable Outputs</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">GeoJSON, Shapefile (.shp), KML, DXF, PDF</div>
                    </div>
                  </div>

                  <button
                    onClick={() => setActiveTab('outputs')}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>View Interactive Output</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

              </div>
            </div>

            {/* Bottom Architecture Reference Blocks (Matching Diagram Footers) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              
              {/* Block 1: AI / Deep Learning Models */}
              <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4">
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-blue-600" />
                  AI / Deep Learning Models
                </div>
                <div className="space-y-1.5 text-xs text-slate-600">
                  <div className="p-2 bg-slate-50 rounded-lg">
                    <span className="font-bold text-slate-800">1. U-Net</span>
                    <div className="text-[11px] text-slate-500">Parcel Boundary Segmentation</div>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg">
                    <span className="font-bold text-slate-800">2. SegFormer</span>
                    <div className="text-[11px] text-slate-500">Building Footprints + Land-Use Classification</div>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg">
                    <span className="font-bold text-slate-800">3. DeepLabV3+</span>
                    <div className="text-[11px] text-slate-500">Road & Path Detection</div>
                  </div>
                </div>
              </div>

              {/* Block 2: Dataset Sources (For Training) */}
              <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4">
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-600" />
                  Dataset Sources (For Training)
                </div>
                <div className="space-y-1.5 text-xs text-slate-600">
                  <div className="p-2 bg-slate-50 rounded-lg">
                    <span className="font-bold text-slate-800">Parcel Boundaries (U-Net)</span>
                    <div className="text-[11px] text-slate-500">AI4Boundaries Dataset (1 m Aerial Orthophoto)</div>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg">
                    <span className="font-bold text-slate-800">Buildings & Land-Use (SegFormer)</span>
                    <div className="text-[11px] text-slate-500">LoveDA Dataset (High-Resolution 0.3 m)</div>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg">
                    <span className="font-bold text-slate-800">Roads & Paths (DeepLabV3+)</span>
                    <div className="text-[11px] text-slate-500">SpaceNet 3 Roads Dataset (8,000+ km labelled roads)</div>
                  </div>
                </div>
              </div>

              {/* Block 3: Technology Stack */}
              <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4">
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Server className="w-4 h-4 text-purple-600" />
                  Technology Stack
                </div>
                <div className="p-3 bg-slate-50 rounded-xl space-y-2 text-xs text-slate-600">
                  <div className="flex flex-wrap gap-1.5">
                    {['Python', 'PyTorch', 'TensorFlow', 'FastAPI', 'PostGIS', 'GeoPandas', 'Shapely', 'GDAL', 'React', 'Leaflet', 'Docker', 'Redis'].map((tech) => (
                      <span key={tech} className="px-2 py-0.5 bg-white border border-slate-200 rounded font-mono text-[11px] font-semibold text-slate-700">
                        {tech}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500 pt-1">
                    End-to-end cloud-native microservices architecture compliant with national cadastre standards.
                  </p>
                </div>
              </div>

            </div>

          </div>
        )}

      </div>
    </div>
  );
}
