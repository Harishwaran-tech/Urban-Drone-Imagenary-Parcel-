import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  MapContainer,
  TileLayer,
  ImageOverlay,
  Polygon,
  Polyline,
  CircleMarker,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import type { Parcel, Building, Road, GNSSPoint, LayerState } from '@/types';
import {
  AlertTriangle, ShieldAlert, Check, X, MapPin,
  Eye, EyeOff, Layers, Sparkles, Focus, Sliders, Maximize2,
  Search, Crosshair, Plus, Minus, Compass, Map as MapIcon,
} from 'lucide-react';

// Fix default Leaflet icon paths
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Center coordinates: Default fallback anchor (Chennai Ward 42)
export const DEFAULT_CENTER: [number, number] = [13.0827, 80.2707];
export const DEFAULT_ZOOM = 17;

// Coordinate transformation: Maps local 0..1000 coordinate space to real Lat/Lng
const M = 1000;
export const LAT_SPAN = 0.007; // ~770 meters
export const LNG_SPAN = 0.008; // ~790 meters

export function localToLatLng(x: number, y: number, baseLat = 13.0827, baseLng = 80.2707): [number, number] {
  // Check if coordinates are already geographic
  if (Math.abs(y) <= 90 && Math.abs(x) <= 180 && (x > 50 || y > 8)) {
    return [y, x];
  }
  const lat = baseLat + (0.5 - y / M) * LAT_SPAN;
  const lng = baseLng + (x / M - 0.5) * LNG_SPAN;
  return [lat, lng];
}

export function pointsToLatLngs(
  points: { x: number; y: number; lat?: number; lng?: number }[],
  baseLat = 13.0827,
  baseLng = 80.2707
): [number, number][] {
  if (!points || points.length === 0) return [];
  return points.map(p => {
    if (p.lat !== undefined && p.lng !== undefined && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && (p.lng > 50 || p.lat > 8)) {
      return [p.lat, p.lng];
    }
    return localToLatLng(p.x, p.y, baseLat, baseLng);
  });
}

// Custom Issue / Conflict Marker Icon (matching Image 2 red exclamation circle)
const createConflictIcon = () => {
  return L.divIcon({
    className: 'custom-conflict-pin-marker',
    html: `
      <div style="
        width: 20px;
        height: 20px;
        background: #ef4444;
        border: 2px solid #ffffff;
        border-radius: 50%;
        box-shadow: 0 0 8px rgba(239, 68, 68, 0.8), 0 2px 4px rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #ffffff;
        font-weight: 900;
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        line-height: 1;
        cursor: pointer;
        transform: translate(-10px, -10px);
        transition: transform 0.15s ease;
      ">!</div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

interface MapViewProps {
  parcels: Parcel[];
  buildings: Building[];
  roads: Road[];
  gnssPoints: GNSSPoint[];
  layers: LayerState;
  selectedParcelId: string | null;
  onSelectParcel: (id: string | null) => void;
  uploadedImage?: string | null;
  imageBounds?: [[number, number], [number, number]] | null;
  orthoOpacity?: number;
  baseCenter?: [number, number];
  baseZoom?: number;
  compareMode?: boolean;
  compareSlider?: number;
  basemapMode?: 'satellite' | 'street';
  highlightConflicts?: boolean;
  showGrid?: boolean;
  height?: string;
  searchParcelId?: string | null;
  measureMode?: boolean;
  onAcceptParcel?: (id: string) => void;
  onRejectParcel?: (id: string) => void;
  onRequestFieldVerification?: (id: string) => void;
}

// Styling configurations matching Image 2
const PARCEL_DEFAULT_STYLE = {
  color: '#06b6d4', // Cyan boundary outline
  weight: 1.8,
  fillColor: '#0891b2',
  fillOpacity: 0.04,
};

const PARCEL_SELECTED_STYLE = {
  color: '#00e5ff',
  weight: 3.5,
  fillColor: '#00e5ff',
  fillOpacity: 0.22,
};

const AI_PREDICTED_STYLE = {
  color: '#d946ef', // Magenta / Purple
  weight: 2,
  dashArray: '5, 3',
  fillColor: '#c026d3',
  fillOpacity: 0.08,
};

const BUILDING_STYLE = {
  color: '#f59e0b', // Amber / Orange
  weight: 1.6,
  fillColor: '#fbbf24',
  fillOpacity: 0.18,
};

const LULC_COLORS: Record<string, string> = {
  residential: '#38bdf8',
  commercial: '#f97316',
  civic: '#a855f7',
  industrial: '#64748b',
};

// Component to handle auto-fitting, location bounds and center changes
function MapController({
  selectedParcelId,
  searchParcelId,
  parcels,
  baseCenter,
  imageBounds,
  onCursorMove,
  fitTrigger,
  onZoomChange,
}: {
  selectedParcelId: string | null;
  searchParcelId?: string | null;
  parcels: Parcel[];
  baseCenter: [number, number];
  imageBounds: [[number, number], [number, number]] | null;
  onCursorMove: (coords: { lat: number; lng: number; zoom: number }) => void;
  fitTrigger: number;
  onZoomChange?: (z: number) => void;
}) {
  const map = useMap();
  const initialFitDone = useRef(false);

  useMapEvents({
    mousemove(e) {
      onCursorMove({
        lat: Number(e.latlng.lat.toFixed(5)),
        lng: Number(e.latlng.lng.toFixed(5)),
        zoom: map.getZoom(),
      });
    },
    zoomend() {
      const center = map.getCenter();
      const z = map.getZoom();
      if (onZoomChange) onZoomChange(z);
      onCursorMove({
        lat: Number(center.lat.toFixed(5)),
        lng: Number(center.lng.toFixed(5)),
        zoom: z,
      });
    },
  });

  // Fit to imageBounds or parcels on initial load or trigger
  useEffect(() => {
    if (imageBounds) {
      map.fitBounds(imageBounds, { padding: [20, 20], maxZoom: 18, animate: true });
      initialFitDone.current = true;
    } else if (baseCenter) {
      map.setView(baseCenter, DEFAULT_ZOOM, { animate: true });
      initialFitDone.current = true;
    }
  }, [imageBounds, baseCenter, map, fitTrigger]);

  // Zoom to parcel when search or selected changes
  useEffect(() => {
    const targetId = searchParcelId || selectedParcelId;
    if (targetId) {
      const p = parcels.find(item => item.id === targetId);
      if (p && p.aiGeometry && p.aiGeometry.length > 0) {
        const latLngs = pointsToLatLngs(p.aiGeometry, baseCenter[0], baseCenter[1]);
        if (latLngs.length > 0) {
          const bounds = L.latLngBounds(latLngs);
          map.flyToBounds(bounds, { maxZoom: 19, padding: [80, 80], duration: 0.6 });
        }
      }
    }
  }, [selectedParcelId, searchParcelId, parcels, baseCenter, map]);

  return null;
}

// Interactive Map Tools (Zoom + Locate)
function MapToolButtons({
  onZoomIn,
  onZoomOut,
  onResetView,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
}) {
  return (
    <div className="absolute top-16 left-4 z-[400] flex flex-col gap-2">
      <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-lg border border-slate-200/80 overflow-hidden flex flex-col">
        <button
          onClick={onZoomIn}
          className="w-8 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-100 transition-colors border-b border-slate-100 active:bg-slate-200"
          title="Zoom In"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={onZoomOut}
          className="w-8 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-100 transition-colors active:bg-slate-200"
          title="Zoom Out"
        >
          <Minus className="w-4 h-4" />
        </button>
      </div>

      <button
        onClick={onResetView}
        className="w-8 h-8 bg-white/95 backdrop-blur-md rounded-xl shadow-lg border border-slate-200/80 flex items-center justify-center text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-colors"
        title="Recenter to Survey AOI"
      >
        <Crosshair className="w-4 h-4" />
      </button>
    </div>
  );
}

// Interactive Measure Tool Layer
function MeasureToolLayer({
  active,
  points,
  onAddPoint,
}: {
  active: boolean;
  points: [number, number][];
  onAddPoint: (pt: [number, number]) => void;
}) {
  const map = useMap();

  useMapEvents({
    click(e) {
      if (!active) return;
      onAddPoint([e.latlng.lat, e.latlng.lng]);
    },
  });

  useEffect(() => {
    const container = map.getContainer();
    if (active) {
      L.DomUtil.addClass(container, 'cursor-crosshair');
    } else {
      L.DomUtil.removeClass(container, 'cursor-crosshair');
    }
    return () => {
      L.DomUtil.removeClass(container, 'cursor-crosshair');
    };
  }, [active, map]);

  if (!active || points.length === 0) return null;

  return (
    <>
      <Polyline
        positions={points}
        pathOptions={{ color: '#06b6d4', weight: 3, dashArray: '6, 6' }}
      />
      {points.length >= 3 && (
        <Polygon
          positions={points}
          pathOptions={{ color: '#06b6d4', fillColor: '#22d3ee', fillOpacity: 0.25, weight: 2 }}
        />
      )}
      {points.map((pt, idx) => (
        <CircleMarker
          key={idx}
          center={pt}
          radius={idx === 0 ? 8 : 6}
          pathOptions={{
            color: '#0891b2',
            fillColor: idx === 0 ? '#10b981' : '#06b6d4',
            fillOpacity: 0.95,
            weight: 2,
          }}
        />
      ))}
    </>
  );
}

export default function MapView({
  parcels,
  buildings,
  roads,
  gnssPoints,
  layers,
  selectedParcelId,
  onSelectParcel,
  uploadedImage = null,
  imageBounds = null,
  orthoOpacity = 90,
  baseCenter = DEFAULT_CENTER,
  baseZoom = DEFAULT_ZOOM,
  compareMode = false,
  compareSlider = 50,
  basemapMode = 'satellite',
  highlightConflicts = true,
  showGrid = true,
  height = '100%',
  searchParcelId = null,
  measureMode = false,
  onAcceptParcel,
  onRejectParcel,
  onRequestFieldVerification,
}: MapViewProps) {
  const [coords, setCoords] = useState<{ lat: number; lng: number; zoom: number }>({
    lat: baseCenter[0],
    lng: baseCenter[1],
    zoom: baseZoom,
  });
  const [localOrthoOpacity, setLocalOrthoOpacity] = useState(orthoOpacity);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [measurePoints, setMeasurePoints] = useState<[number, number][]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [elevationSlider, setElevationSlider] = useState(50);
  const mapRef = useRef<L.Map | null>(null);

  // Exact Bounding Box for the 0..1000 Orthomosaic Image Layer
  const orthoBounds: [[number, number], [number, number]] = useMemo(() => [
    [baseCenter[0] - LAT_SPAN / 2, baseCenter[1] - LNG_SPAN / 2],
    [baseCenter[0] + LAT_SPAN / 2, baseCenter[1] + LNG_SPAN / 2],
  ], [baseCenter]);

  // Strict Bounding Box for the Survey Area of Interest (AOI)
  // This constrains panning and zooming strictly to the project location
  const aoiBounds = useMemo((): [[number, number], [number, number]] => {
    return [
      [baseCenter[0] - LAT_SPAN * 0.75, baseCenter[1] - LNG_SPAN * 0.75],
      [baseCenter[0] + LAT_SPAN * 0.75, baseCenter[1] + LNG_SPAN * 0.75],
    ];
  }, [baseCenter]);

  // AOI Survey Boundary polygon
  const aoiPolygonLatLngs = useMemo((): [number, number][] => {
    return [
      [orthoBounds[0][0], orthoBounds[0][1]],
      [orthoBounds[0][0], orthoBounds[1][1]],
      [orthoBounds[1][0], orthoBounds[1][1]],
      [orthoBounds[1][0], orthoBounds[0][1]],
    ];
  }, [orthoBounds]);

  // Compute centroid for parcel to place conflict pin
  const parcelCentroids = useMemo(() => {
    const map = new Map<string, [number, number]>();
    for (const p of parcels) {
      const latLngs = pointsToLatLngs(p.aiGeometry, baseCenter[0], baseCenter[1]);
      if (latLngs.length > 0) {
        const avgLat = latLngs.reduce((s, pt) => s + pt[0], 0) / latLngs.length;
        const avgLng = latLngs.reduce((s, pt) => s + pt[1], 0) / latLngs.length;
        map.set(p.id, [avgLat, avgLng]);
      }
    }
    return map;
  }, [parcels, baseCenter]);

  // Search filter
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return parcels.filter(p =>
      p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.surveyNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.landUse && p.landUse.toLowerCase().includes(searchQuery.toLowerCase()))
    ).slice(0, 6);
  }, [parcels, searchQuery]);

  const handleZoomIn = () => {
    if (mapRef.current) mapRef.current.zoomIn();
  };

  const handleZoomOut = () => {
    if (mapRef.current) mapRef.current.zoomOut();
  };

  const handleResetView = () => {
    if (mapRef.current) {
      mapRef.current.setView(baseCenter, DEFAULT_ZOOM, { animate: true });
    }
  };

  const activeBasemap = basemapMode === 'satellite' || layers.satelliteImagery ? 'satellite' : 'street';
  const hasUploadedDroneImage = !!uploadedImage && layers.droneOrthomosaic !== false;

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-900 select-none" style={{ height: height || '100%' }}>
      {/* Top Search Location Bar (Image 2 style) */}
      <div className="absolute top-3.5 left-4 z-[400] w-72">
        <div className="relative group">
          <div className="flex items-center bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-xl px-3.5 py-2 shadow-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all">
            <Search className="w-4 h-4 text-slate-400 mr-2 flex-shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSearchDropdown(true);
              }}
              onFocus={() => setShowSearchDropdown(true)}
              placeholder="Search location / parcel..."
              className="bg-transparent text-xs text-slate-800 placeholder-slate-400 w-full focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setShowSearchDropdown(false);
                }}
                className="text-slate-400 hover:text-slate-600 ml-1 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Search dropdown results */}
          {showSearchDropdown && searchResults.length > 0 && (
            <div className="absolute top-full mt-1.5 left-0 w-full bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50 animate-in fade-in">
              <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wide border-b border-slate-100">
                Parcels in Location
              </div>
              {searchResults.map(p => (
                <button
                  key={p.id}
                  onClick={() => {
                    onSelectParcel(p.id);
                    setSearchQuery('');
                    setShowSearchDropdown(false);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-blue-50 flex items-center justify-between border-b border-slate-50 last:border-0 transition-colors"
                >
                  <div>
                    <div className="text-xs font-bold text-slate-800">{p.id}</div>
                    <div className="text-[10px] text-slate-500">Area: {p.existingArea} m² · {p.landUse || 'Residential'}</div>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold">
                    {p.confidence}%
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Map Control Buttons (Zoom +/- & Crosshair) */}
      <MapToolButtons
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetView={handleResetView}
      />

      {/* Right Vertical Slider Widget (Image 2 style) */}
      <div className="absolute top-3.5 right-4 z-[400] bg-white/95 backdrop-blur-md rounded-xl p-2 shadow-lg border border-slate-200/80 flex flex-col items-center gap-1.5">
        <Sliders className="w-3.5 h-3.5 text-slate-600" />
        <div className="h-28 flex items-center justify-center py-1">
          <input
            type="range"
            min={0}
            max={100}
            value={elevationSlider}
            onChange={(e) => setElevationSlider(Number(e.target.value))}
            className="h-24 w-1.5 accent-blue-600 cursor-pointer [writing-mode:bt-lr] [-webkit-appearance:slider-vertical]"
            title="Layer Depth / Opacity"
          />
        </div>
        <span className="text-[9px] font-bold text-slate-500 font-mono">{elevationSlider}%</span>
      </div>

      {/* Bottom Left Mini Locator Map Inset (Image 2 style) */}
      <div className="absolute bottom-6 left-4 z-[400] bg-white/95 backdrop-blur-md p-1.5 rounded-xl shadow-xl border border-slate-200/80 pointer-events-auto">
        <div className="w-24 h-20 bg-slate-100 rounded-lg relative overflow-hidden flex items-center justify-center border border-slate-200">
          <div className="absolute inset-0 opacity-40 bg-[radial-gradient(#94a3b8_1px,transparent_1px)] [background-size:8px_8px]" />
          {/* Outlined Ward Polygon in Mini Locator */}
          <svg className="w-full h-full p-2" viewBox="0 0 100 80">
            <path
              d="M 15 20 L 45 10 L 85 25 L 80 65 L 50 75 L 20 60 Z"
              fill="#dbeafe"
              stroke="#2563eb"
              strokeWidth="2"
              strokeDasharray="3 2"
            />
            <circle cx="50" cy="45" r="4" fill="#ef4444" className="animate-ping" />
            <circle cx="50" cy="45" r="3" fill="#2563eb" />
          </svg>
          <div className="absolute bottom-1 right-1 text-[8px] font-bold bg-white/90 px-1 py-0.2 rounded text-slate-600">
            Ward 42
          </div>
        </div>
      </div>

      {/* Bottom Right GIS & Fullscreen Buttons (Image 2 style) */}
      <div className="absolute bottom-6 right-4 z-[400] flex flex-col gap-2">
        <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-lg border border-slate-200/80 overflow-hidden flex flex-col">
          <button
            onClick={() => {
              if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
              } else {
                document.documentElement.requestFullscreen().catch(() => {});
              }
            }}
            className="w-8 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-100 transition-colors"
            title="Toggle Fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setFitTrigger(t => t + 1)}
            className="w-8 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-100 transition-colors border-t border-slate-100"
            title="Focus Survey Extent"
          >
            <Layers className="w-4 h-4 text-blue-600" />
          </button>
        </div>
      </div>

      {/* Main Map Engine */}
      <MapContainer
        center={baseCenter}
        zoom={baseZoom}
        minZoom={15}
        maxZoom={20}
        maxBounds={aoiBounds}
        maxBoundsViscosity={1.0}
        zoomControl={false}
        className="w-full h-full z-0"
        attributionControl={false}
        ref={(m) => { if (m) mapRef.current = m; }}
      >
        {/* Basemap Tile Layer: High Resolution Satellite Imagery */}
        {activeBasemap === 'satellite' ? (
          <TileLayer
            key="esri-satellite"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={20}
          />
        ) : (
          <TileLayer
            key="osm-streets"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
        )}

        {/* Uploaded Drone Orthomosaic Layer */}
        {hasUploadedDroneImage && (
          <ImageOverlay
            url={uploadedImage!}
            bounds={imageBounds || orthoBounds}
            opacity={localOrthoOpacity / 100}
            zIndex={10}
          />
        )}

        <MapController
          selectedParcelId={selectedParcelId}
          searchParcelId={searchParcelId}
          parcels={parcels}
          baseCenter={baseCenter}
          imageBounds={uploadedImage ? (imageBounds || orthoBounds) : null}
          onCursorMove={setCoords}
          fitTrigger={fitTrigger}
        />

        {/* Survey AOI Extent Boundary Outline */}
        <Polygon
          positions={aoiPolygonLatLngs}
          pathOptions={{
            color: '#38bdf8',
            weight: 2,
            dashArray: '6, 6',
            fillColor: '#0284c7',
            fillOpacity: 0.0,
            interactive: false,
          }}
        />

        {/* Roads Layer (clean road corridors separating blocks) */}
        {layers.roads && roads.map(road => {
          const positions = road.path.map(pt => localToLatLng(pt.x, pt.y, baseCenter[0], baseCenter[1]));
          return (
            <Polyline
              key={road.id}
              positions={positions}
              pathOptions={{
                color: activeBasemap === 'satellite' ? '#94a3b8' : '#64748b',
                weight: Math.max(3, road.width / 3),
                opacity: 0.65,
                lineCap: 'round',
              }}
            />
          );
        })}

        {/* LULC (Land Use / Land Cover) Fill Tints */}
        {layers.lulc && parcels.map(p => {
          const positions = pointsToLatLngs(p.existingGeometry, baseCenter[0], baseCenter[1]);
          if (positions.length < 3) return null;
          const lulcColor = LULC_COLORS[p.buildingType || 'residential'] || '#38bdf8';
          return (
            <Polygon
              key={`lulc-${p.id}`}
              positions={positions}
              pathOptions={{
                color: 'transparent',
                fillColor: lulcColor,
                fillOpacity: 0.15,
              }}
              eventHandlers={{
                click: () => onSelectParcel(p.id),
              }}
            />
          );
        })}

        {/* Existing / Registered Cadastral Parcel Boundaries (Cyan Lines) */}
        {layers.existingCadastralParcels && parcels.map(p => {
          const positions = pointsToLatLngs(p.existingGeometry, baseCenter[0], baseCenter[1]);
          if (positions.length < 3) return null;
          const isSelected = p.id === selectedParcelId;

          return (
            <Polygon
              key={`existing-${p.id}`}
              positions={positions}
              pathOptions={isSelected ? PARCEL_SELECTED_STYLE : PARCEL_DEFAULT_STYLE}
              eventHandlers={{
                click: () => onSelectParcel(p.id),
              }}
            />
          );
        })}

        {/* AI Predicted Boundaries Layer (Magenta / Purple Lines) */}
        {layers.aiParcelBoundaries && parcels.map(p => {
          // Render AI predicted boundary lines
          const positions = pointsToLatLngs(p.aiGeometry, baseCenter[0], baseCenter[1]);
          if (positions.length < 3) return null;
          const isSelected = p.id === selectedParcelId;

          return (
            <Polygon
              key={`ai-${p.id}`}
              positions={positions}
              pathOptions={isSelected ? PARCEL_SELECTED_STYLE : AI_PREDICTED_STYLE}
              eventHandlers={{
                click: () => onSelectParcel(p.id),
              }}
            />
          );
        })}

        {/* Building Footprints Layer (Amber / Orange Outlines) */}
        {layers.buildings && buildings.map(b => {
          const positions = pointsToLatLngs(b.geometry, baseCenter[0], baseCenter[1]);
          if (positions.length < 3) return null;
          return (
            <Polygon
              key={`bld-${b.id}`}
              positions={positions}
              pathOptions={BUILDING_STYLE}
              eventHandlers={{
                click: () => {
                  if (b.parcelId) onSelectParcel(b.parcelId);
                },
              }}
            />
          );
        })}

        {/* Issues / Conflicts Red Exclamation Pins (!) */}
        {layers.conflictAreas && parcels.filter(p => p.isIssue || p.conflictType !== null).map(p => {
          const pos = parcelCentroids.get(p.id);
          if (!pos) return null;
          const isSelected = p.id === selectedParcelId;

          return (
            <Marker
              key={`issue-${p.id}`}
              position={pos}
              icon={createConflictIcon()}
              eventHandlers={{
                click: () => onSelectParcel(p.id),
              }}
            >
              <Popup className="cadastra-popup">
                <div className="p-2 space-y-1.5 min-w-[190px] text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-red-600">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Issue / Conflict</span>
                  </div>
                  <div className="font-bold text-slate-800">{p.id}</div>
                  <div className="text-slate-600 text-[11px]">
                    {p.conflictReasons?.[0] || 'Boundary verification required'}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Confidence: <strong className="text-blue-600">{p.confidence}%</strong>
                  </div>
                  <button
                    onClick={() => onSelectParcel(p.id)}
                    className="w-full mt-1 px-2 py-1 bg-blue-600 text-white rounded text-[10px] font-bold"
                  >
                    View Details
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* GNSS / CORS Survey Benchmark Points */}
        {layers.gnssPoints && gnssPoints.map(pt => {
          const pos: [number, number] = pt.latitude && pt.longitude
            ? [pt.latitude, pt.longitude]
            : localToLatLng(pt.x, pt.y, baseCenter[0], baseCenter[1]);

          return (
            <CircleMarker
              key={pt.id}
              center={pos}
              radius={4}
              pathOptions={{
                color: '#10b981',
                fillColor: '#34d399',
                fillOpacity: 0.9,
                weight: 1.5,
              }}
              eventHandlers={{
                click: () => onSelectParcel(pt.parcelId),
              }}
            />
          );
        })}

        {/* Measure Tool Layer */}
        <MeasureToolLayer
          active={measureMode}
          points={measurePoints}
          onAddPoint={pt => setMeasurePoints(prev => [...prev, pt])}
        />
      </MapContainer>

      {/* Bottom Center Google/Map Attribution & Scale Bar (Image 2 style) */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-[400] bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-[10px] text-slate-600 shadow-sm border border-slate-200/60 flex items-center gap-3">
        <span className="font-semibold">Google / High-Res Drone Imagery</span>
        <span className="text-slate-300">|</span>
        <span>©2025 Google</span>
        <span className="text-slate-300">|</span>
        <span className="font-mono text-slate-700 font-semibold">Scale: 1:2,500</span>
      </div>
    </div>
  );
}
