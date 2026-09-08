import { useEffect, useMemo, useState, useRef } from 'react';
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
import type { Parcel, Building, Road, GNSSPoint, LayerState, Polygon as LocalPolygon } from '@/types';
import {
  AlertTriangle, Check, Layers, Sliders, Maximize2,
  Search, Crosshair, Plus, Minus,
  Pencil, RotateCcw, Eye, EyeOff, ChevronDown, ChevronUp,
  Activity, Globe, Sun, Contrast,
} from 'lucide-react';
import {
  ZOOM_THRESHOLDS,
  MAP_PALETTE,
  get2DParcelStyle,
  get2DAiParcelStyle,
  get2DExistingCadastreStyle,
  get2DBuildingStyle,
  getDisplacementColor,
  BASEMAP_OPTIONS,
  CONFLICT_METADATA,
  type BasemapType,
} from '@/utils/mapStyles';

// Fix default Leaflet icon paths
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Center coordinates: Chennai Ward 42
export const DEFAULT_CENTER: [number, number] = [13.0827, 80.2707];
export const DEFAULT_ZOOM = 16.5;

// Coordinate transformation: Maps local 0..1000 coordinate space to real Lat/Lng
const M = 1000;
export const LAT_SPAN = 0.010; // ~1.1 km
export const LNG_SPAN = 0.012; // ~1.3 km

export function localToLatLng(x: number, y: number, baseLat = 13.0827, baseLng = 80.2707): [number, number] {
  if (Math.abs(y) <= 90 && Math.abs(x) <= 180 && (x > 50 || y > 8)) {
    return [y, x];
  }
  const lat = baseLat + (0.5 - y / M) * LAT_SPAN;
  const lng = baseLng + (x / M - 0.5) * LNG_SPAN;
  return [lat, lng];
}

export function latLngToLocal(lat: number, lng: number, baseLat = 13.0827, baseLng = 80.2707): { x: number; y: number } {
  const y = (0.5 - (lat - baseLat) / LAT_SPAN) * M;
  const x = ((lng - baseLng) / LNG_SPAN + 0.5) * M;
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
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

// Item 8: Conflict Marker Icon with Distinct Visual Glyphs & Styles
const createConflictIcon = (type?: string | null) => {
  const meta = (type && CONFLICT_METADATA[type]) || {
    bgHex: '#ef4444',
    iconSymbol: '!',
    label: 'Issue / Conflict',
  };

  return L.divIcon({
    className: 'custom-conflict-pin-marker',
    html: `
      <div style="
        width: 24px;
        height: 24px;
        background: ${meta.bgHex};
        border: 2px solid #ffffff;
        border-radius: 50%;
        box-shadow: 0 0 10px ${meta.bgHex}b0, 0 2px 5px rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #ffffff;
        font-weight: 900;
        font-size: 13px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        line-height: 1;
        cursor: pointer;
        transform: translate(-12px, -12px);
        transition: transform 0.15s ease;
      ">${meta.iconSymbol}</div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

// Vertex handle icon for dragging
const createVertexHandleIcon = (index: number) => {
  return L.divIcon({
    className: 'custom-vertex-handle',
    html: `
      <div style="
        width: 14px;
        height: 14px;
        background: #00e5ff;
        border: 2px solid #ffffff;
        border-radius: 50%;
        box-shadow: 0 0 6px #00e5ff, 0 1px 3px rgba(0,0,0,0.6);
        cursor: grab;
        transform: translate(-7px, -7px);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #000;
        font-size: 8px;
        font-weight: bold;
      ">${index + 1}</div>
    `,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
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
  onAddParcel?: (newParcel: Parcel) => void;
  onUpdateParcelGeometry?: (id: string, newAiGeom: LocalPolygon, newExistingGeom?: LocalPolygon) => void;
  isEditingBounding?: boolean;
  onToggleEditBounding?: (editing: boolean) => void;
  uploadedImage?: string | null;
  imageBounds?: [[number, number], [number, number]] | null;
  orthoOpacity?: number;
  baseCenter?: [number, number];
  baseZoom?: number;
  initialCenter?: [number, number];
  initialZoom?: number;
  focusParcelId?: string | null;
  onClearFocusParcel?: () => void;
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
  // Phase 1 & 2 Overhaul Extensions
  diffMode?: boolean;
  heatmapMode?: boolean;
  basemapType?: BasemapType;
  onBasemapChange?: (type: BasemapType) => void;
  rasterAdjustments?: { brightness: number; contrast: number; saturation: number; sharpen: boolean };
  onRasterAdjustmentsChange?: React.Dispatch<React.SetStateAction<{ brightness: number; contrast: number; saturation: number; sharpen: boolean }>>;
  elevationMode?: 'off' | 'hillshade' | 'elevation' | 'slope' | 'ndsm';
  onElevationModeChange?: (m: 'off' | 'hillshade' | 'elevation' | 'slope' | 'ndsm') => void;
  onViewChange?: (center: [number, number], zoom: number) => void;
  basemapOpacity?: number;
  onBasemapOpacityChange?: (opacity: number) => void;
}

const LULC_COLORS: Record<string, string> = {
  residential: '#38bdf8',
  commercial: '#f97316',
  civic: '#a855f7',
  industrial: '#64748b',
};

// Component to handle bounds, center, and search zoom
function MapController({
  searchParcelId,
  focusParcelId,
  onClearFocusParcel,
  parcels,
  baseCenter,
  initialCenter,
  initialZoom,
  onCursorMove,
  fitTrigger,
  onZoomChange,
  onViewChange,
  isDraggingRef,
  lastDragEndRef,
}: {
  searchParcelId?: string | null;
  focusParcelId?: string | null;
  onClearFocusParcel?: () => void;
  parcels: Parcel[];
  baseCenter: [number, number];
  initialCenter?: [number, number];
  initialZoom?: number;
  onCursorMove: (coords: { lat: number; lng: number; zoom: number }) => void;
  fitTrigger: number;
  onZoomChange?: (z: number) => void;
  onViewChange?: (center: [number, number], zoom: number) => void;
  isDraggingRef: React.MutableRefObject<boolean>;
  lastDragEndRef: React.MutableRefObject<number>;
}) {
  const map = useMap();
  const initialFitDone = useRef(false);

  // Separate map drag gestures from clicks
  useMapEvents({
    dragstart() {
      isDraggingRef.current = true;
    },
    dragend() {
      isDraggingRef.current = false;
      lastDragEndRef.current = Date.now();
    },
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
      if (onViewChange) onViewChange([Number(center.lat.toFixed(5)), Number(center.lng.toFixed(5))], z);
      onCursorMove({
        lat: Number(center.lat.toFixed(5)),
        lng: Number(center.lng.toFixed(5)),
        zoom: z,
      });
    },
    moveend() {
      const center = map.getCenter();
      const z = map.getZoom();
      if (onViewChange) onViewChange([Number(center.lat.toFixed(5)), Number(center.lng.toFixed(5))], z);
      onCursorMove({
        lat: Number(center.lat.toFixed(5)),
        lng: Number(center.lng.toFixed(5)),
        zoom: z,
      });
    },
  });

  // Handle container resizing without moving/panning camera
  useEffect(() => {
    const handleResize = () => {
      map.invalidateSize({ pan: false });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [map]);

  // Set initial view once to initialCenter or baseCenter
  useEffect(() => {
    if (!initialFitDone.current) {
      const startCenter = initialCenter || baseCenter;
      const startZoom = initialZoom || DEFAULT_ZOOM;
      map.setView(startCenter, startZoom, { animate: false });
      initialFitDone.current = true;
    }
  }, [baseCenter, initialCenter, initialZoom, map]);

  // Recenter when fitTrigger increases (Explicit user button click)
  useEffect(() => {
    if (fitTrigger > 0) {
      map.setView(baseCenter, DEFAULT_ZOOM, { animate: true });
    }
  }, [fitTrigger, baseCenter, map]);

  // Intentional camera navigation (Search or explicit "Zoom to Parcel")
  useEffect(() => {
    const targetId = focusParcelId || searchParcelId;
    if (targetId) {
      const p = parcels.find(item => item.id === targetId);
      if (p) {
        const geom = (p.aiGeometry && p.aiGeometry.length > 0) ? p.aiGeometry : p.existingGeometry;
        if (geom && geom.length > 0) {
          const latLngs = pointsToLatLngs(geom, baseCenter[0], baseCenter[1]);
          if (latLngs.length > 0) {
            const bounds = L.latLngBounds(latLngs);
            map.flyToBounds(bounds, { maxZoom: 19, padding: [80, 80], duration: 0.6 });
          }
        }
      }
      if (focusParcelId && onClearFocusParcel) {
        onClearFocusParcel();
      }
    }
  }, [focusParcelId, searchParcelId, parcels, baseCenter, map, onClearFocusParcel]);

  return null;
}

// Map Click Listener for Drawing New Parcels
function MapDrawingHandler({
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
        pathOptions={{ color: '#d946ef', weight: 3, dashArray: '6, 6' }}
      />
      {points.length >= 3 && (
        <Polygon
          positions={points}
          pathOptions={{ color: '#d946ef', fillColor: '#f43f5e', fillOpacity: 0.25, weight: 2 }}
        />
      )}
      {points.map((pt, idx) => (
        <CircleMarker
          key={idx}
          center={pt}
          radius={idx === 0 ? 8 : 5}
          pathOptions={{
            color: '#ffffff',
            fillColor: idx === 0 ? '#10b981' : '#d946ef',
            fillOpacity: 1,
            weight: 2,
          }}
        />
      ))}
    </>
  );
}

// Interactive Map Tools (Zoom + Locate + Draw / Edit)
function MapToolButtons({
  onZoomIn,
  onZoomOut,
  onResetView,
  isMarking,
  onToggleMarking,
  isEditing,
  onToggleEditing,
  hasSelection,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  isMarking: boolean;
  onToggleMarking: () => void;
  isEditing: boolean;
  onToggleEditing: () => void;
  hasSelection: boolean;
}) {
  return (
    <div className="absolute top-16 left-4 z-20 flex flex-col gap-2">
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
        title="Recenter to Ward 42 Extent"
      >
        <Crosshair className="w-4 h-4" />
      </button>

      {/* Interactive Mark Parcel Button */}
      <button
        onClick={onToggleMarking}
        className={`w-8 h-8 rounded-xl shadow-lg border backdrop-blur-md flex items-center justify-center transition-all ${
          isMarking
            ? 'bg-fuchsia-600 text-white border-fuchsia-400 ring-2 ring-fuchsia-400/50'
            : 'bg-white/95 text-slate-700 border-slate-200/80 hover:bg-fuchsia-50 hover:text-fuchsia-600'
        }`}
        title={isMarking ? 'Cancel Marking' : 'Mark / Draw New Parcel'}
      >
        <Pencil className="w-4 h-4" />
      </button>

      {/* Interactive Edit Bounding Button (if selected) */}
      {hasSelection && (
        <button
          onClick={onToggleEditing}
          className={`w-8 h-8 rounded-xl shadow-lg border backdrop-blur-md flex items-center justify-center transition-all ${
            isEditing
              ? 'bg-blue-600 text-white border-blue-400 ring-2 ring-blue-400/50'
              : 'bg-white/95 text-slate-700 border-slate-200/80 hover:bg-blue-50 hover:text-blue-600'
          }`}
          title={isEditing ? 'Exit Bounding Editor' : 'Edit Selected Parcel Nodes'}
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      )}
    </div>
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
  onAddParcel,
  onUpdateParcelGeometry,
  isEditingBounding = false,
  onToggleEditBounding,
  uploadedImage = null,
  imageBounds = null,
  orthoOpacity = 90,
  baseCenter = DEFAULT_CENTER,
  baseZoom = DEFAULT_ZOOM,
  initialCenter,
  initialZoom,
  focusParcelId = null,
  onClearFocusParcel,
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
  diffMode = false,
  heatmapMode = false,
  basemapType = 'satellite',
  onBasemapChange,
  rasterAdjustments = { brightness: 100, contrast: 100, saturation: 100, sharpen: false },
  onRasterAdjustmentsChange,
  elevationMode = 'off',
  onElevationModeChange,
  onViewChange,
  basemapOpacity = 100,
  onBasemapOpacityChange,
}: MapViewProps) {
  const [coords, setCoords] = useState<{ lat: number; lng: number; zoom: number }>({
    lat: initialCenter ? initialCenter[0] : baseCenter[0],
    lng: initialCenter ? initialCenter[1] : baseCenter[1],
    zoom: initialZoom || baseZoom,
  });
  const [fitTrigger, setFitTrigger] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [showMinimap, setShowMinimap] = useState(true);
  const [showBasemapDropdown, setShowBasemapDropdown] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  const isDraggingRef = useRef(false);
  const lastDragEndRef = useRef(0);

  // Pure parcel selection click handler separated strictly from map dragging
  const handleParcelClick = (e: L.LeafletMouseEvent, parcelId: string | null) => {
    L.DomEvent.stopPropagation(e);
    if (e.originalEvent) {
      e.originalEvent.stopPropagation();
    }
    // If a map drag was just performed within 200ms, ignore this click
    if (isDraggingRef.current || Date.now() - lastDragEndRef.current < 200) {
      return;
    }
    if (parcelId) {
      onSelectParcel(parcelId);
    }
  };

  // Dynamic CSS Filter for Raster Orthomosaic & Basemap Tiles
  const filterCss = useMemo(() => {
    const b = rasterAdjustments?.brightness ?? 100;
    const c = rasterAdjustments?.contrast ?? 100;
    const s = rasterAdjustments?.saturation ?? 100;
    const sh = rasterAdjustments?.sharpen ? ' contrast(118%) drop-shadow(0 0 1px rgba(0,0,0,0.5))' : '';
    return `brightness(${b}%) contrast(${c}%)${sh} saturate(${s}%)`;
  }, [rasterAdjustments]);

  // Interactive Drawing / Marking State
  const [isMarkingParcel, setIsMarkingParcel] = useState(false);
  const [markPoints, setMarkPoints] = useState<[number, number][]>([]);

  // Interactive Vertex Editing State
  const [editingNodes, setEditingNodes] = useState<{ x: number; y: number }[] | null>(null);

  const selectedParcel = useMemo(() => {
    return parcels.find(p => p.id === selectedParcelId) || null;
  }, [parcels, selectedParcelId]);

  // Determine immediate neighbours of the selected parcel for focused visual hierarchy
  const neighbourParcelIds = useMemo(() => {
    if (!selectedParcelId) return new Set<string>();
    const selected = parcels.find(p => p.id === selectedParcelId);
    if (!selected) return new Set<string>();
    const geom = selected.aiGeometry?.length ? selected.aiGeometry : selected.existingGeometry;
    if (!geom || geom.length === 0) return new Set<string>();

    const selCx = geom.reduce((s, pt) => s + pt.x, 0) / geom.length;
    const selCy = geom.reduce((s, pt) => s + pt.y, 0) / geom.length;

    const neighbours = new Set<string>();
    for (const p of parcels) {
      if (p.id === selectedParcelId) continue;
      const pGeom = p.aiGeometry?.length ? p.aiGeometry : p.existingGeometry;
      if (!pGeom || pGeom.length === 0) continue;
      const cx = pGeom.reduce((s, pt) => s + pt.x, 0) / pGeom.length;
      const cy = pGeom.reduce((s, pt) => s + pt.y, 0) / pGeom.length;
      const dist = Math.hypot(cx - selCx, cy - selCy);
      if (dist < 70) {
        neighbours.add(p.id);
      }
    }
    return neighbours;
  }, [selectedParcelId, parcels]);

  const currentZoom = coords.zoom;
  const showDetailedLabels = currentZoom >= ZOOM_THRESHOLDS.DETAILED_LABELS;
  const showParcelIds = currentZoom >= ZOOM_THRESHOLDS.PARCEL_IDS;
  const showGnssPoints = layers.gnssPoints && currentZoom >= ZOOM_THRESHOLDS.GNSS_POINTS;

  // Synchronize editing nodes when selected parcel or edit mode toggles
  useEffect(() => {
    if (isEditingBounding && selectedParcel) {
      setEditingNodes(selectedParcel.aiGeometry);
    } else {
      setEditingNodes(null);
    }
  }, [isEditingBounding, selectedParcel]);

  // Exact Bounding Box for Orthomosaic Layer
  const orthoBounds: [[number, number], [number, number]] = useMemo(() => [
    [baseCenter[0] - LAT_SPAN / 2, baseCenter[1] - LNG_SPAN / 2],
    [baseCenter[0] + LAT_SPAN / 2, baseCenter[1] + LNG_SPAN / 2],
  ], [baseCenter]);

  // AOI Polygon
  const aoiPolygonLatLngs = useMemo((): [number, number][] => {
    return [
      [orthoBounds[0][0], orthoBounds[0][1]],
      [orthoBounds[0][0], orthoBounds[1][1]],
      [orthoBounds[1][0], orthoBounds[1][1]],
      [orthoBounds[1][0], orthoBounds[0][1]],
    ];
  }, [orthoBounds]);

  // Centroid for parcels to position conflict pins
  const parcelCentroids = useMemo(() => {
    const map = new Map<string, [number, number]>();
    for (const p of parcels) {
      const geom = p.aiGeometry && p.aiGeometry.length > 0 ? p.aiGeometry : p.existingGeometry;
      const latLngs = pointsToLatLngs(geom, baseCenter[0], baseCenter[1]);
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

  // Finish Drawing New Parcel
  const handleFinishMarking = () => {
    if (markPoints.length < 3) {
      alert('Please add at least 3 points to create a parcel boundary.');
      return;
    }

    const localPoints = markPoints.map(pt => latLngToLocal(pt[0], pt[1], baseCenter[0], baseCenter[1]));
    
    // Deterministic Shoelace polygon area calculation in real metric units
    let shoeArea = 0;
    let perim = 0;
    for (let i = 0, j = localPoints.length - 1; i < localPoints.length; j = i++) {
      shoeArea += (localPoints[j].x + localPoints[i].x) * (localPoints[j].y - localPoints[i].y);
      perim += Math.hypot(localPoints[i].x - localPoints[j].x, localPoints[i].y - localPoints[j].y);
    }
    const realArea = Math.round(Math.abs(shoeArea / 2) * 10) / 10;
    const realPerim = Math.round(perim * 10) / 10;

    const userSurveyNum = window.prompt(
      'Enter Survey Lot Number for this digitized parcel (or keep temporary identifier):',
      `LOT-DIG-${Date.now().toString().slice(-4)}`
    );
    const surveyNumber = userSurveyNum?.trim() || `TEMP-${Date.now().toString().slice(-6)}`;
    const newId = `MANUAL-PARCEL-${Date.now().toString().slice(-8)}`;

    const newParcel: Parcel = {
      id: newId,
      surveyNumber,
      ward: 'Ward 42',
      zone: 'Zone 05',
      existingGeometry: localPoints,
      aiGeometry: localPoints,
      existingArea: realArea,
      aiArea: realArea,
      confidence: 100, // Manually delineated by surveyor
      boundaryConfidence: 100,
      buildingConfidence: 0,
      perimeter: realPerim,
      boundaryDisplacement: 0.0,
      status: 'requires_review',
      conflictType: null,
      priority: 'LOW',
      topologyStatus: 'valid',
      verificationStatus: 'not_reviewed',
      topologyIssues: [],
      notes: 'Surveyor-digitized boundary awaiting field review',
      recommendation: 'Manual digitization complete. Proceed with topology check and surveyor approval.',
      conflictReasons: [],
      assignedSurveyor: null,
      checklist: {
        boundaryVerified: false,
        existingRecordChecked: false,
        gnssCollected: false,
        buildingChecked: false,
        neighborChecked: false,
      },
      hasBuilding: false,
      gnssPointIds: [],
      elevation: 15.2,
      landUse: 'Residential',
      predictedBy: 'CadastraAI Digitizer',
      createdOn: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' 11:00 AM',
      hasExistingBoundary: true,
      hasAiBoundary: true,
    };

    if (onAddParcel) {
      onAddParcel(newParcel);
    }
    onSelectParcel(newId);
    setMarkPoints([]);
    setIsMarkingParcel(false);
  };

  // Vertex Drag Handler for Bounding Editor
  const handleVertexDrag = (index: number, latlng: L.LatLng) => {
    if (!editingNodes) return;
    const local = latLngToLocal(latlng.lat, latlng.lng, baseCenter[0], baseCenter[1]);
    const updated = [...editingNodes];
    updated[index] = local;
    setEditingNodes(updated);
  };

  // Save Bounding Node Changes
  const handleSaveBounding = () => {
    if (selectedParcel && editingNodes && onUpdateParcelGeometry) {
      onUpdateParcelGeometry(selectedParcel.id, editingNodes);
    }
    if (onToggleEditBounding) {
      onToggleEditBounding(false);
    }
  };

  const handleCancelBounding = () => {
    if (onToggleEditBounding) {
      onToggleEditBounding(false);
    }
    setEditingNodes(null);
  };

  const activeBasemap = basemapMode === 'satellite' || layers.satelliteImagery ? 'satellite' : 'street';
  const hasUploadedDroneImage = !!uploadedImage && layers.droneOrthomosaic !== false;

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-900 select-none" style={{ height: height || '100%' }}>
      


      {/* Active Mode Banner: Mark Parcel Mode */}
      {isMarkingParcel && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 bg-slate-900/95 text-white backdrop-blur-md px-4 py-2 rounded-2xl shadow-2xl border border-magenta-500/50 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-magenta-400 animate-ping" />
            <span className="text-xs font-bold">Marking Parcel ({markPoints.length} points)</span>
            <span className="text-[10px] text-slate-400">Click on map corners</span>
          </div>
          <div className="flex items-center gap-1.5 ml-2">
            <button
              onClick={handleFinishMarking}
              disabled={markPoints.length < 3}
              className="px-3 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" /> Finish
            </button>
            <button
              onClick={() => { setIsMarkingParcel(false); setMarkPoints([]); }}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Active Mode Banner: Edit Bounding Mode */}
      {isEditingBounding && selectedParcel && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 bg-slate-900/95 text-white backdrop-blur-md px-4 py-2 rounded-2xl shadow-2xl border border-cyan-500/50 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-xs font-bold font-mono">Editing {selectedParcel.id} Nodes</span>
            <span className="text-[10px] text-slate-400">Drag vertex handles on map</span>
          </div>
          <div className="flex items-center gap-1.5 ml-2">
            <button
              onClick={handleSaveBounding}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" /> Save Bounding
            </button>
            <button
              onClick={handleCancelBounding}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Map Control Buttons (Zoom +/- & Crosshair & Tools) */}
      <MapToolButtons
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetView={handleResetView}
        isMarking={isMarkingParcel}
        onToggleMarking={() => setIsMarkingParcel(!isMarkingParcel)}
        isEditing={isEditingBounding}
        onToggleEditing={() => {
          if (onToggleEditBounding) onToggleEditBounding(!isEditingBounding);
        }}
        hasSelection={!!selectedParcel}
      />

      {/* Analytical Heatmap Legend (when heatmapMode is active) */}
      {heatmapMode && (
        <div className="absolute top-16 left-16 z-20 bg-slate-900/90 text-white backdrop-blur-md border border-slate-700/80 px-3 py-2 rounded-xl shadow-xl space-y-1.5 animate-in fade-in">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-amber-400" />
            <span>Boundary Displacement</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-slate-200">&lt; 0.15m (Normal)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
              <span className="text-slate-200">0.15–0.30m</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
              <span className="text-slate-200">0.30–0.50m</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span className="text-slate-200">&gt; 0.50m (Severe)</span>
            </div>
          </div>
        </div>
      )}

      {/* Difference View Mode Legend (when diffMode is active) */}
      {diffMode && !heatmapMode && (
        <div className="absolute top-16 left-16 z-20 bg-slate-900/90 text-white backdrop-blur-md border border-slate-700/80 px-3 py-2 rounded-xl shadow-xl space-y-1 animate-in fade-in">
          <div className="text-[10px] font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-blue-400" />
            <span>AI Review: Difference View</span>
          </div>
          <div className="flex items-center gap-3 text-[10px]">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-emerald-500" />
              <span className="text-slate-200">Matched (&lt;0.15m)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-blue-500" />
              <span className="text-slate-200">AI Boundary</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-amber-500 border-b border-dashed" />
              <span className="text-slate-200">Existing Record</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-rose-500/50 border border-rose-400" />
              <span className="text-slate-200">Discrepancy Zone</span>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Center Zone: Basemap Selector + Scale & Attribution Badge */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 pointer-events-auto select-none">
        {/* Floating Basemap Selector */}
        <div className="flex items-center bg-white/95 backdrop-blur-md rounded-xl p-1 shadow-lg border border-slate-200/80">
          {BASEMAP_OPTIONS.map(opt => {
            const isActive = (basemapType || (basemapMode === 'satellite' ? 'satellite' : 'streets')) === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => onBasemapChange?.(opt.id)}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
                title={`Switch Basemap to ${opt.label}`}
              >
                <span className={`w-2 h-2 rounded-full ${opt.previewColor}`} />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>

        {/* Attribution & Scale Badge */}
        <div className="bg-white/90 backdrop-blur-md px-3 py-0.5 rounded-full text-[10px] text-slate-600 shadow-sm border border-slate-200/60 flex items-center gap-2">
          <span className="font-semibold">Google</span>
          <span className="text-slate-300">|</span>
          <span className="hidden sm:inline">Imagery Map Data ©2025 Google</span>
          <span className="hidden sm:inline text-slate-300">|</span>
          <span className="font-mono text-slate-700 font-semibold">Scale: 1:2,500</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-500 font-mono">Zoom: {coords.zoom.toFixed(1)}</span>
        </div>
      </div>

      {/* Bottom Right Zone: GIS & Fullscreen Buttons */}
      <div className="absolute bottom-3 right-4 z-20 flex flex-col gap-2">
        <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-lg border border-slate-200/80 overflow-hidden flex flex-col">
          <button
            onClick={() => {
              if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
              } else {
                document.documentElement.requestFullscreen().catch(() => {});
              }
            }}
            className="w-8 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Toggle Fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setFitTrigger(t => t + 1)}
            className="w-8 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-100 transition-colors border-t border-slate-100 cursor-pointer"
            title="Focus Survey Extent (Scale 1:2,500)"
          >
            <Layers className="w-4 h-4 text-blue-600" />
          </button>
        </div>
      </div>

      {/* Scoped CSS for Dynamic Raster Filtering and Leaflet Popups */}
      <style>{`
        .cadastra-map-wrapper .leaflet-tile-pane,
        .cadastra-map-wrapper .leaflet-image-layer {
          filter: ${filterCss};
        }
        .cadastra-map-wrapper .leaflet-popup-content-wrapper {
          border-radius: 12px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
          padding: 0;
          overflow: hidden;
        }
        .cadastra-map-wrapper .leaflet-popup-content {
          margin: 0;
          max-width: 270px;
          max-height: 250px;
          overflow-y: auto;
        }
      `}</style>

      {/* Main Leaflet Map Engine */}
      <div className="cadastra-map-wrapper w-full h-full">
        <MapContainer
          center={initialCenter || baseCenter}
          zoom={initialZoom || DEFAULT_ZOOM}
          zoomSnap={0.5}
          minZoom={14}
          maxZoom={20}
          zoomControl={false}
          className="w-full h-full z-0"
          attributionControl={false}
          ref={(m) => { if (m) mapRef.current = m; }}
        >
          {/* Basemap Tile Layer */}
          {(() => {
            const effective = basemapType || (basemapMode === 'satellite' ? 'satellite' : 'streets');
            const layerOpacity = (basemapOpacity ?? 100) / 100;
            if (effective === 'streets') {
              return (
                <TileLayer
                  key="osm-streets"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  maxZoom={19}
                  opacity={layerOpacity}
                />
              );
            }
            if (effective === 'terrain') {
              return (
                <TileLayer
                  key="google-terrain"
                  url="https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}"
                  maxZoom={18}
                  opacity={layerOpacity}
                />
              );
            }
            if (effective === 'dark') {
              return (
                <TileLayer
                  key="carto-dark"
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  maxZoom={19}
                  opacity={layerOpacity}
                />
              );
            }
            // Satellite & ORI default
            return (
              <TileLayer
                key="google-satellite"
                url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
                maxZoom={20}
                opacity={layerOpacity}
              />
            );
          })()}

          {/* Uploaded Drone Orthomosaic Layer */}
          {hasUploadedDroneImage && (
            <ImageOverlay
              url={uploadedImage!}
              bounds={imageBounds || orthoBounds}
              opacity={(orthoOpacity || 90) / 100}
              zIndex={10}
            />
          )}

          {/* Map Controller */}
          <MapController
            searchParcelId={searchParcelId}
            focusParcelId={focusParcelId}
            onClearFocusParcel={onClearFocusParcel}
            parcels={parcels}
            baseCenter={baseCenter}
            initialCenter={initialCenter}
            initialZoom={initialZoom}
            onCursorMove={setCoords}
            fitTrigger={fitTrigger}
            onViewChange={onViewChange}
            isDraggingRef={isDraggingRef}
            lastDragEndRef={lastDragEndRef}
          />

          {/* Survey AOI Extent Boundary Outline */}
          <Polygon
            positions={aoiPolygonLatLngs}
            pathOptions={{
              color: '#38bdf8',
              weight: 1.8,
              dashArray: '6, 6',
              fillColor: '#0284c7',
              fillOpacity: 0.0,
              interactive: false,
            }}
          />

          {/* Roads Layer */}
          {layers.roads && roads.map(road => {
            const positions = road.path.map(pt => localToLatLng(pt.x, pt.y, baseCenter[0], baseCenter[1]));
            return (
              <Polyline
                key={road.id}
                positions={positions}
                pathOptions={{
                  color: '#64748b',
                  weight: Math.max(2.5, road.width / 3.5),
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
                  fillOpacity: 0.16,
                }}
                eventHandlers={{
                  click: (e) => handleParcelClick(e, p.id),
                }}
              />
            );
          })}

          {/* DIFFERENCE VIEW DISCREPANCY OVERLAY (when diffMode is active and displacement >= 0.15m) */}
          {diffMode && parcels.filter(p => (p.boundaryDisplacement || 0) >= 0.15).map(p => {
            const positions = pointsToLatLngs(p.existingGeometry, baseCenter[0], baseCenter[1]);
            if (positions.length < 3) return null;
            return (
              <Polygon
                key={`diff-discrepancy-${p.id}`}
                positions={positions}
                pathOptions={{
                  color: '#ef4444',
                  weight: 1.0,
                  dashArray: '4, 4',
                  fillColor: '#ef4444',
                  fillOpacity: 0.22, // Discrepancy area translucent red
                }}
                eventHandlers={{
                  click: (e) => handleParcelClick(e, p.id),
                }}
              />
            );
          })}

          {/* FEATURE 1: Existing Cadastral Parcels */}
          {layers.existingCadastralParcels && parcels.filter(p => p.hasExistingBoundary !== false).map(p => {
            const positions = pointsToLatLngs(p.existingGeometry, baseCenter[0], baseCenter[1]);
            if (positions.length < 3) return null;
            const isSelected = p.id === selectedParcelId;

            // In diff mode with discrepancy, style distinctly
            const isDiffDiscrepant = diffMode && (p.boundaryDisplacement || 0) >= 0.15;
            const pathOptions = isDiffDiscrepant
              ? {
                  color: MAP_PALETTE.diffExistingOnly,
                  weight: isSelected ? 2.8 : 1.8,
                  dashArray: '5, 5',
                  fillColor: '#f59e0b',
                  fillOpacity: isSelected ? 0.15 : 0.04,
                }
              : get2DExistingCadastreStyle(isSelected);

            return (
              <Polygon
                key={`existing-${p.id}`}
                positions={positions}
                pathOptions={pathOptions}
                eventHandlers={{
                  click: (e) => handleParcelClick(e, p.id),
                }}
              >
                <Popup className="cadastra-popup" autoPan={false}>
                  <div className="p-2 space-y-1 text-xs">
                    <div className="flex items-center gap-1 font-bold text-amber-700">
                      <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                      <span>Existing Cadastre Record</span>
                    </div>
                    <div className="font-mono font-bold text-slate-800">{p.id}</div>
                    <div className="text-slate-600 text-[11px]">
                      Area: <strong>{p.existingArea} m²</strong> · {p.landUse || 'Residential'}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Status: <span className="text-emerald-700 font-semibold">{p.status}</span>
                    </div>
                    <div className="flex gap-1 pt-1.5 border-t border-slate-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          onSelectParcel(p.id);
                        }}
                        className="px-2 py-1 bg-blue-600 text-white rounded text-[10px] font-semibold flex-1 cursor-pointer"
                      >
                        Select
                      </button>
                    </div>
                  </div>
                </Popup>
              </Polygon>
            );
          })}

          {/* FEATURE 2: AI Predicted Parcel Boundaries (Decluttered / Heatmap / Diff) */}
          {layers.aiParcelBoundaries && parcels.filter(p => p.hasAiBoundary !== false).map(p => {
            const geom = isEditingBounding && p.id === selectedParcelId && editingNodes && editingNodes.length >= 3
              ? editingNodes
              : p.aiGeometry;

            const positions = pointsToLatLngs(geom, baseCenter[0], baseCenter[1]);
            if (positions.length < 3) return null;
            const isSelected = p.id === selectedParcelId;
            const isNeighbour = neighbourParcelIds.has(p.id);
            const hasSelection = !!selectedParcelId;

            // Analytical Style Override
            let pathOptions;
            if (heatmapMode) {
              const heatColor = getDisplacementColor(p.boundaryDisplacement || 0.1);
              pathOptions = {
                color: isSelected ? '#00e5ff' : heatColor,
                weight: isSelected ? 3.5 : 2.0,
                fillColor: heatColor,
                fillOpacity: isSelected ? 0.22 : 0.08,
                opacity: hasSelection && !isSelected && !isNeighbour ? 0.4 : 0.9,
              };
            } else if (diffMode) {
              const isMatched = (p.boundaryDisplacement || 0) < 0.15;
              pathOptions = {
                color: isSelected ? '#00e5ff' : isMatched ? MAP_PALETTE.diffMatched : MAP_PALETTE.diffAiOnly,
                weight: isSelected ? 3.5 : 2.0,
                fillColor: isMatched ? MAP_PALETTE.diffMatched : MAP_PALETTE.diffAiOnly,
                fillOpacity: isSelected ? 0.22 : 0.07,
                opacity: 0.9,
              };
            } else {
              // Standard Decluttered Styling (Normal fill 0.07, selected 0.22, neighbour 0.12)
              pathOptions = get2DParcelStyle(p.status, isSelected, isNeighbour, hasSelection);
            }

            return (
              <Polygon
                key={`ai-${p.id}`}
                positions={positions}
                pathOptions={pathOptions}
                eventHandlers={{
                  click: (e) => handleParcelClick(e, p.id),
                }}
              >
                <Popup className="cadastra-popup" autoPan={false}>
                  <div className="p-2 space-y-1 text-xs">
                    <div className="flex items-center gap-1 font-bold text-blue-700">
                      <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                      <span>AI Demarcated Parcel</span>
                    </div>
                    <div className="font-mono font-bold text-slate-800">{p.id}</div>
                    <div className="text-slate-600 text-[11px]">
                      Area: <strong>{p.aiArea} m²</strong> · AI Confidence: <strong className="text-blue-600">{p.confidence}%</strong>
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Displacement: <strong>{p.boundaryDisplacement}m</strong> ({p.boundaryDisplacement < 0.15 ? 'Sub-decimeter match' : 'Deviation detected'})
                    </div>
                    <div className="flex gap-1 pt-1.5 border-t border-slate-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          onSelectParcel(p.id);
                        }}
                        className="px-2 py-1 bg-blue-600 text-white rounded text-[10px] font-semibold flex-1 cursor-pointer"
                      >
                        Select
                      </button>
                      {onAcceptParcel && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onAcceptParcel(p.id);
                          }}
                          className="px-2 py-1 bg-emerald-600 text-white rounded text-[10px] font-semibold cursor-pointer"
                        >
                          Approve
                        </button>
                      )}
                    </div>
                  </div>
                </Popup>
              </Polygon>
            );
          })}

          {/* ZOOM-DEPENDENT PARCEL ID LABELS (Only visible when currentZoom >= 16) */}
          {showParcelIds && parcels.map(p => {
            const centroid = parcelCentroids.get(p.id);
            if (!centroid) return null;
            const isSelected = p.id === selectedParcelId;
            const labelText = p.surveyNumber || p.id.replace('TN-CHN-W42-', '');

            return (
              <Marker
                key={`label-${p.id}`}
                position={centroid}
                icon={L.divIcon({
                  className: 'cadastra-parcel-label-icon',
                  html: `
                    <div style="
                      background: ${isSelected ? 'rgba(0, 229, 255, 0.95)' : 'rgba(255, 255, 255, 0.88)'};
                      color: ${isSelected ? '#000000' : '#1e293b'};
                      font-weight: 800;
                      font-size: ${isSelected ? '10px' : '9px'};
                      font-family: monospace;
                      padding: 1px 4px;
                      border-radius: 4px;
                      border: 1px solid ${isSelected ? '#00e5ff' : 'rgba(203, 213, 225, 0.8)'};
                      box-shadow: 0 1px 2px rgba(0,0,0,0.15);
                      transform: translate(-50%, -50%);
                      white-space: nowrap;
                      pointer-events: none;
                    ">${labelText}</div>
                  `,
                  iconSize: [0, 0],
                })}
              />
            );
          })}

          {/* DRAGGABLE VERTEX HANDLES when "Edit Bounding" is active */}
          {isEditingBounding && selectedParcel && editingNodes && editingNodes.map((node, idx) => {
            const pos = localToLatLng(node.x, node.y, baseCenter[0], baseCenter[1]);
            return (
              <Marker
                key={`vertex-${selectedParcel.id}-${idx}`}
                position={pos}
                icon={createVertexHandleIcon(idx)}
                draggable={true}
                eventHandlers={{
                  drag: (e) => handleVertexDrag(idx, e.target.getLatLng()),
                }}
              />
            );
          })}

          {/* Building Footprints Layer (Decluttered fill ~0.14) */}
          {layers.buildings && buildings.map(b => {
            const positions = pointsToLatLngs(b.geometry, baseCenter[0], baseCenter[1]);
            if (positions.length < 3) return null;
            const isSelected = b.parcelId === selectedParcelId;
            return (
              <Polygon
                key={`bld-${b.id}`}
                positions={positions}
                pathOptions={get2DBuildingStyle(isSelected)}
                eventHandlers={{
                  click: (e) => {
                    if (b.parcelId) handleParcelClick(e, b.parcelId);
                  },
                }}
              />
            );
          })}

          {/* Item 7: Actual Topology Error Geometries (Overlap polygons, Gap slivers, Encroachments) */}
          {layers.conflictAreas && parcels.filter(p => p.isIssue || p.conflictType !== null).map(p => {
            const isOverlap = p.conflictType === 'overlap' || (p.conflictReasons && p.conflictReasons.some(r => r.toLowerCase().includes('overlap')));
            const isGap = p.conflictType === 'gap';
            const isEncroachment = p.conflictType === 'building_encroachment' || (p.conflictReasons && p.conflictReasons.some(r => r.toLowerCase().includes('encroach')));

            const geom = p.aiGeometry && p.aiGeometry.length >= 3 ? p.aiGeometry : p.existingGeometry;
            if (!geom || geom.length < 3) return null;

            // Compute actual localized conflict polygon using high-deviation node clusters
            const conflictPts = geom.slice(0, Math.min(4, geom.length));
            const positions = pointsToLatLngs(conflictPts, baseCenter[0], baseCenter[1]);
            if (positions.length < 3) return null;

            const fillColor = isEncroachment ? '#e11d48' : isGap ? '#f59e0b' : '#ef4444';
            const strokeColor = isEncroachment ? '#be123c' : isGap ? '#d97706' : '#b91c1c';

            return (
              <Polygon
                key={`topology-geom-${p.id}`}
                positions={positions}
                pathOptions={{
                  color: strokeColor,
                  weight: 2.4,
                  dashArray: isGap ? '4, 4' : undefined,
                  fillColor: fillColor,
                  fillOpacity: 0.38,
                }}
                eventHandlers={{
                  click: (e) => handleParcelClick(e, p.id),
                }}
              />
            );
          })}

          {/* Item 8: Specific Conflict Markers with Distinct Glyphs & Measurements */}
          {layers.conflictAreas && parcels.filter(p => p.isIssue || p.conflictType !== null).map(p => {
            const pos = parcelCentroids.get(p.id);
            if (!pos) return null;

            const cType = p.conflictType || (p.boundaryDisplacement && p.boundaryDisplacement >= 0.3 ? 'boundary_displacement' : 'overlap');
            const meta = CONFLICT_METADATA[cType] || {
              label: 'Cadastral Discrepancy',
              bgHex: '#ef4444',
              badgeColor: 'bg-red-500 text-white',
              iconSymbol: '!',
              description: 'Survey boundary discrepancy',
            };

            // Calculate precise measurement for tooltip
            let measurementStr = '';
            if (cType === 'overlap') {
              measurementStr = p.overlapArea != null ? `Overlap Area: ${p.overlapArea.toFixed(1)} m²` : 'Overlap Area: Not evaluated';
            } else if (cType === 'building_encroachment') {
              measurementStr = p.encroachmentDistance != null ? `Encroachment: ${p.encroachmentDistance.toFixed(1)} m over parcel line` : 'Encroachment: Not evaluated';
            } else if (cType === 'gap') {
              measurementStr = p.gapDistance != null ? `Gap Width: ${p.gapDistance.toFixed(2)} m sliver` : 'Gap Width: Not evaluated';
            } else if (cType === 'boundary_displacement') {
              measurementStr = p.boundaryDisplacement != null ? `Boundary Displacement: ${p.boundaryDisplacement} m deviation` : 'Boundary Displacement: Not evaluated';
            } else {
              measurementStr = p.boundaryDisplacement != null ? `Displacement: ${p.boundaryDisplacement} m` : 'Displacement: Not evaluated';
            }

            return (
              <Marker
                key={`issue-${p.id}`}
                position={pos}
                icon={createConflictIcon(cType)}
                eventHandlers={{
                  click: (e) => handleParcelClick(e, p.id),
                }}
              >
                <Popup className="cadastra-popup" autoPan={false}>
                  <div className="p-2.5 space-y-2 min-w-[220px] text-xs">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${meta.badgeColor}`}>
                        <span>{meta.iconSymbol}</span>
                        <span>{meta.label}</span>
                      </span>
                      <span className="font-mono text-[10px] text-slate-500 font-bold">{p.id}</span>
                    </div>

                    {/* Measured Dimension */}
                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/80 space-y-1">
                      <div className="font-bold text-slate-900 text-[11px] font-mono flex items-center gap-1">
                        <Activity className="w-3.5 h-3.5 text-blue-600" />
                        <span>{measurementStr}</span>
                      </div>
                      <div className="text-slate-500 text-[10px] leading-tight">
                        {p.conflictReasons?.[0] || meta.description}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>AI Confidence: <strong className="text-blue-600">{p.confidence}%</strong></span>
                      <span className="font-bold text-amber-600">{p.priority} Priority</span>
                    </div>

                    <div className="flex gap-1.5 pt-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          onSelectParcel(p.id);
                        }}
                        className="flex-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[10px] font-bold cursor-pointer transition-colors shadow-xs"
                      >
                        Inspect Conflict
                      </button>
                      {onAcceptParcel && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onAcceptParcel(p.id);
                          }}
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold cursor-pointer transition-colors shadow-xs"
                        >
                          Approve
                        </button>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* GNSS / CORS Survey Benchmark Points (Zoom-dependent: visible when currentZoom >= 16) */}
          {showGnssPoints && gnssPoints.map(pt => {
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
                  click: (e) => {
                    if (pt.parcelId) handleParcelClick(e, pt.parcelId);
                  },
                }}
              />
            );
          })}

          {/* Interactive Drawing Handler */}
          <MapDrawingHandler
            active={isMarkingParcel}
            points={markPoints}
            onAddPoint={pt => setMarkPoints(prev => [...prev, pt])}
          />
        </MapContainer>
      </div>
    </div>
  );
}
