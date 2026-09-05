/**
 * CadastraAI Unified Map Styling & Visual Configuration Engine
 * Centralizes styling for 2D WebGIS (Leaflet) and 3D Digital Twin (Three.js).
 * Enforces reduced visual clutter, restrained PBR palettes, and clear information hierarchy.
 */

export type MapPresetKey =
  | 'survey'
  | 'ai_review'
  | 'topology'
  | 'ground_truth'
  | 'land_use'
  | 'clean_imagery'
  | 'presentation';

export type BasemapType = 'ori' | 'satellite' | 'streets' | 'terrain' | 'dark';

export type ThreeDViewMode = 'survey' | 'analysis' | 'presentation';

export type SemanticColorMode =
  | 'realistic'
  | 'status'
  | 'land_use'
  | 'height'
  | 'confidence'
  | 'conflict';

export const ZOOM_THRESHOLDS = {
  DETAILED_LABELS: 18,
  PARCEL_IDS: 16,
  BUILDING_IDS: 16.5,
  GNSS_POINTS: 16,
  EDITING_VERTICES: 17.5,
  ROADS_CENTERLINES: 15,
};

export const MAP_PALETTE = {
  // 2D Status & Boundaries
  verified: '#10b981',        // Emerald green
  aiPreliminary: '#8b5cf6',   // Purple/violet (AI prediction)
  requiresReview: '#f59e0b',  // Amber
  fieldVerification: '#dc2626',// Crimson red
  rejected: '#64748b',        // Muted slate
  existingCadastre: '#06b6d4',// Subtle cyan (Existing cadastre record)

  // Features
  buildingFootprint: '#475569',
  roadCorridor: '#334155',    // Restrained dark neutral asphalt
  roadCenterline: '#64748b',
  gnssPoint: '#10b981',
  gtPoint: '#f59e0b',
  conflictWarning: '#ef4444',

  // Difference View (Item 3)
  diffMatched: '#10b981',     // Green: Matched boundaries (< 0.15m deviation)
  diffAiOnly: '#8b5cf6',      // Purple/Blue: AI-only boundary segments
  diffExistingOnly: '#f59e0b',// Amber: Existing-only record boundary segments
  diffDiscrepancyFill: 'rgba(239, 68, 68, 0.28)', // Translucent red discrepancy polygons

  // Boundary Displacement Heatmap (Item 4)
  displacementUnder15cm: '#10b981', // < 0.15m: Green (Normal/Survey-grade)
  displacement15to30cm: '#eab308',  // 0.15 - 0.30m: Yellow (Minor discrepancy)
  displacement30to50cm: '#f97316',  // 0.30 - 0.50m: Orange (Significant deviation)
  displacementOver50cm: '#ef4444',  // > 0.50m: Red (Severe conflict)

  // Specific Conflict Taxonomy (Item 8)
  conflictOverlap: '#ef4444',        // Red
  conflictGap: '#f59e0b',            // Amber
  conflictInvalidGeom: '#a855f7',    // Purple
  conflictDisplacement: '#f97316',   // Orange
  conflictEncroachment: '#e11d48',   // Rose/Crimson

  // 3D Restrained Architectural Palette
  threeConcrete: 0xe2e8f0,
  threeDarkRoof: 0x334155,
  threeGlass: 0x64748b,
  threeAsphalt: 0x1e293b,            // Restrained neutral asphalt (Item 19)
  threeRoadLine: 0x64748b,
  threeExistingLine: 0x06b6d4,       // Subtle solid cyan (Item 20)
  threeAiLine: 0x8b5cf6,             // Subtle dashed purple (Item 20)
  threeSelectedHighlight: 0x00e5ff,  // Luminous cyan highlight
  threeConflictGlow: 0xef4444,       // Red/orange conflict
  threeCurtainFill: 0x00e5ff,        // Selected parcel vertical curtain
};

// Item 2: Existing vs AI Boundary Styling
export const get2DExistingCadastreStyle = (isSelected: boolean) => ({
  color: isSelected ? '#00e5ff' : MAP_PALETTE.existingCadastre, // Subtle cyan
  weight: isSelected ? 3.0 : 1.6,
  dashArray: undefined, // Thin SOLID line (Item 2)
  fillColor: '#06b6d4',
  fillOpacity: isSelected ? 0.12 : 0.03,
  opacity: isSelected ? 1.0 : 0.85,
});

export const get2DAiParcelStyle = (
  status: string,
  isSelected: boolean,
  isNeighbour: boolean,
  hasSelection: boolean
) => {
  if (isSelected) {
    return {
      color: '#00e5ff',
      weight: 3.5, // Stronger 3px highlight (Item 2)
      dashArray: undefined,
      fillColor: '#00e5ff',
      fillOpacity: 0.22, // Selected fill ~0.20–0.25
      opacity: 1.0,
    };
  }

  if (isNeighbour) {
    return {
      color: '#38bdf8',
      weight: 2.0,
      dashArray: '4, 4',
      fillColor: '#0284c7',
      fillOpacity: 0.10,
      opacity: 0.9,
    };
  }

  if (hasSelection) {
    // Fade non-selected parcels to reduce visual prominence (Item 5)
    return {
      color: MAP_PALETTE.aiPreliminary,
      weight: 1.2,
      dashArray: '5, 5', // Dashed blue/purple with lower opacity (Item 2)
      fillColor: MAP_PALETTE.aiPreliminary,
      fillOpacity: 0.02,
      opacity: 0.35,
    };
  }

  // Default AI Prediction: dashed blue/purple with lower opacity
  return {
    color: MAP_PALETTE.aiPreliminary,
    weight: 1.8,
    dashArray: '5, 5',
    fillColor: MAP_PALETTE.aiPreliminary,
    fillOpacity: 0.05,
    opacity: 0.75,
  };
};

export const get2DParcelStyle = (
  status: string,
  isSelected: boolean,
  isNeighbour: boolean,
  hasSelection: boolean
) => {
  return get2DAiParcelStyle(status, isSelected, isNeighbour, hasSelection);
};

export const get2DBuildingStyle = (isSelected: boolean) => ({
  color: isSelected ? '#38bdf8' : '#64748b',
  weight: isSelected ? 2.2 : 1.2,
  fillColor: '#94a3b8',
  fillOpacity: isSelected ? 0.28 : 0.12, // Building fill ~0.12-0.15
  opacity: 0.85,
});

export const getDisplacementColor = (displacementM: number): string => {
  if (displacementM < 0.15) return MAP_PALETTE.displacementUnder15cm;
  if (displacementM <= 0.30) return MAP_PALETTE.displacement15to30cm;
  if (displacementM <= 0.50) return MAP_PALETTE.displacement30to50cm;
  return MAP_PALETTE.displacementOver50cm;
};

// Item 8: Conflict Marker Styles & Metadata
export const CONFLICT_METADATA: Record<
  string,
  {
    label: string;
    badgeColor: string;
    bgHex: string;
    iconSymbol: string;
    description: string;
  }
> = {
  overlap: {
    label: 'Parcel Overlap',
    badgeColor: 'bg-red-500 text-white',
    bgHex: MAP_PALETTE.conflictOverlap,
    iconSymbol: '⧉',
    description: 'Geometric overlap between two or more cadastral polygons',
  },
  gap: {
    label: 'Cadastral Gap',
    badgeColor: 'bg-amber-500 text-white',
    bgHex: MAP_PALETTE.conflictGap,
    iconSymbol: '⫿',
    description: 'Unclaimed gap / sliver between adjoining parcel boundaries',
  },
  invalid_geometry: {
    label: 'Invalid Geometry',
    badgeColor: 'bg-purple-600 text-white',
    bgHex: MAP_PALETTE.conflictInvalidGeom,
    iconSymbol: '✕',
    description: 'Self-intersecting loop or unclosed boundary node',
  },
  self_intersection: {
    label: 'Self Intersection',
    badgeColor: 'bg-purple-600 text-white',
    bgHex: MAP_PALETTE.conflictInvalidGeom,
    iconSymbol: '✕',
    description: 'Boundary edge crosses itself',
  },
  boundary_displacement: {
    label: 'Boundary Displacement',
    badgeColor: 'bg-orange-500 text-white',
    bgHex: MAP_PALETTE.conflictDisplacement,
    iconSymbol: '↔',
    description: 'Local offset between AI prediction and legal survey record > 0.15m',
  },
  building_encroachment: {
    label: 'Building Encroachment',
    badgeColor: 'bg-rose-600 text-white',
    bgHex: MAP_PALETTE.conflictEncroachment,
    iconSymbol: '⌂',
    description: 'Building footprint crosses parcel boundary line into adjacent lot',
  },
  missing_parcel: {
    label: 'Missing Record',
    badgeColor: 'bg-slate-700 text-white',
    bgHex: '#64748b',
    iconSymbol: '?',
    description: 'AI detected boundary without matching registry record',
  },
  new_structure: {
    label: 'Unregistered Structure',
    badgeColor: 'bg-blue-600 text-white',
    bgHex: '#2563eb',
    iconSymbol: '+',
    description: 'New building detected not present in baseline cadastral map',
  },
};

// Item 1 & 9: Strict Map View Presets Definition
export const MAP_PRESETS: Record<
  MapPresetKey,
  {
    label: string;
    description: string;
    layers: Record<string, boolean>;
    viewMode?: 'webgis' | '3d_twin';
    diffMode?: boolean;
    heatmapMode?: boolean;
    threeDMode?: ThreeDViewMode;
  }
> = {
  survey: {
    label: 'Survey',
    description: 'ORI + Existing Parcels + GNSS + GT + Selected Feature (Default Cadastral View)',
    layers: {
      droneOrthomosaic: true,
      satelliteImagery: false,
      existingCadastralParcels: true, // Thin subtle cyan
      aiParcelBoundaries: false,       // Moved to AI Review to avoid clutter (Item 1)
      buildings: false,                // Moved to Land Use / Presentation
      roads: false,
      gnssPoints: true,
      conflictAreas: true,
    },
    diffMode: false,
    heatmapMode: false,
    threeDMode: 'survey',
  },
  ai_review: {
    label: 'AI Review',
    description: 'ORI + Existing Parcels + AI Parcels + Difference Layer + Confidence',
    layers: {
      droneOrthomosaic: true,
      satelliteImagery: false,
      existingCadastralParcels: true,
      aiParcelBoundaries: true,
      buildings: false,
      roads: false,
      gnssPoints: true,
      conflictAreas: true,
    },
    diffMode: true,
    heatmapMode: false,
    threeDMode: 'analysis',
  },
  topology: {
    label: 'Topology',
    description: 'Parcels + Overlap Areas + Gaps + Invalid Geometry',
    layers: {
      droneOrthomosaic: false,
      satelliteImagery: false,
      existingCadastralParcels: true,
      aiParcelBoundaries: true,
      buildings: false,
      roads: false,
      gnssPoints: false,
      conflictAreas: true,
    },
    diffMode: false,
    heatmapMode: false,
    threeDMode: 'analysis',
  },
  ground_truth: {
    label: 'Ground Truth',
    description: 'AI Output + GT + GNSS + Positional Error',
    layers: {
      droneOrthomosaic: true,
      satelliteImagery: false,
      existingCadastralParcels: true,
      aiParcelBoundaries: true,
      buildings: false,
      roads: false,
      gnssPoints: true,
      conflictAreas: false,
    },
    diffMode: false,
    heatmapMode: true, // Shows metric displacement heatmap
    threeDMode: 'survey',
  },
  land_use: {
    label: 'Land Use',
    description: 'ORI + Buildings + Roads + Land-use Classes',
    layers: {
      droneOrthomosaic: true,
      satelliteImagery: false,
      existingCadastralParcels: true,
      aiParcelBoundaries: false,
      buildings: true,
      roads: true,
      gnssPoints: false,
      conflictAreas: false,
    },
    diffMode: false,
    heatmapMode: false,
    threeDMode: 'analysis',
  },
  clean_imagery: {
    label: 'Clean Imagery',
    description: 'ORI only (Unobstructed high-resolution orthomosaic)',
    layers: {
      droneOrthomosaic: true,
      satelliteImagery: false,
      existingCadastralParcels: false,
      aiParcelBoundaries: false,
      buildings: false,
      roads: false,
      gnssPoints: false,
      conflictAreas: false,
    },
    diffMode: false,
    heatmapMode: false,
    threeDMode: 'survey',
  },
  presentation: {
    label: 'Presentation',
    description: 'Polished 3D Digital Twin with architectural facades, shadows, and trees',
    layers: {
      droneOrthomosaic: true,
      satelliteImagery: true,
      existingCadastralParcels: true,
      aiParcelBoundaries: true,
      buildings: true,
      roads: true,
      gnssPoints: false,
      conflictAreas: false,
    },
    viewMode: '3d_twin',
    diffMode: false,
    heatmapMode: false,
    threeDMode: 'presentation',
  },
};

// Basemap Tiles Metadata (Item 14)
export const BASEMAP_OPTIONS: { id: BasemapType; label: string; previewColor: string; description: string }[] = [
  { id: 'ori', label: 'Drone ORI', previewColor: 'bg-emerald-600', description: '0.1m Project Orthomosaic' },
  { id: 'satellite', label: 'Satellite', previewColor: 'bg-slate-800', description: 'High-Res Global Imagery' },
  { id: 'streets', label: 'Streets', previewColor: 'bg-sky-500', description: 'OpenStreetMap Cartography' },
  { id: 'terrain', label: 'Terrain', previewColor: 'bg-amber-600', description: 'Relief & Contours' },
  { id: 'dark', label: 'Dark', previewColor: 'bg-slate-950', description: 'CartoDB Dark Matter' },
];
