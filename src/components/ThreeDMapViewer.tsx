import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import type { Parcel, Building, Road, GNSSPoint, LayerState } from '@/types';
import {
  Maximize2, RotateCcw, Sun, Eye, EyeOff, Layers, Compass,
  Box, Mountain, HelpCircle, Check, MapPin, ZoomIn, ZoomOut,
  Sparkles, Sliders, Play, Pause, Ruler, Building2, ShieldCheck,
  ChevronRight, ChevronDown, ChevronUp, Activity, Info, AlertCircle, Home, CheckCircle2, ShieldAlert, X
} from 'lucide-react';
import {
  buildProceduralBuilding,
  buildSimplifiedExtrusionBuilding,
} from '@/services/gis3d/proceduralBuildingEngine';
import { getArchitecturalMaterials } from '@/services/gis3d/materialSystem';
import type { RoofStyle } from '@/services/gis3d/roofGenerator';
import type { SemanticColorMode } from '@/utils/mapStyles';

interface ThreeDMapViewerProps {
  parcels: Parcel[];
  buildings: Building[];
  roads?: Road[];
  gnssPoints?: GNSSPoint[];
  selectedParcelId?: string | null;
  onSelectParcel?: (id: string | null) => void;
  layers?: Partial<LayerState>;
  height?: string;
  uploadedImage?: string | null;
  baseCenter?: [number, number];
  threeDMode?: 'survey' | 'analysis' | 'presentation';
  onThreeDModeChange?: (mode: 'survey' | 'analysis' | 'presentation') => void;
  semanticColorMode?: SemanticColorMode;
  onSemanticColorModeChange?: (mode: SemanticColorMode) => void;
  elevationMode?: 'off' | 'hillshade' | 'elevation' | 'slope' | 'ndsm';
  onViewChange?: (center: [number, number], zoom: number) => void;
}

// Architectural color palette for cadastral boundaries & terrain
const PALETTE = {
  amber: 0xf59e0b,
  terracotta: 0xd97706,
  sandstone: 0xfde68a,
  ochre: 0xfbbf24,
  coral: 0xf87171,
  peach: 0xfb923c,
  warmBrown: 0xb45309,
  lightSlate: 0xe2e8f0,
  darkOutline: 0x0f172a,
  selectedHighlight: 0x2563eb,
  hoverHighlight: 0x38bdf8,
  terrainGreen: 0x86efac,
  waterBlue: 0x0284c7,
  roadGrey: 0x475569,
};

// Item 16: Realistic Aerial Orthomosaic Ground Texture Generator
function createDefaultAerialTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Base aerial tone: cadastral soil and vegetation mosaic
    ctx.fillStyle = '#47584a';
    ctx.fillRect(0, 0, 1024, 1024);

    // Soil & agricultural lot patches
    const lotColors = ['#526848', '#4b5e43', '#394d33', '#686f58', '#546646', '#415039', '#576c4e'];
    for (let x = 0; x < 1024; x += 128) {
      for (let y = 0; y < 1024; y += 128) {
        ctx.fillStyle = lotColors[(x * 7 + y * 13) % lotColors.length];
        ctx.fillRect(x + 2, y + 2, 124, 124);

        // Faint agricultural rows / texture
        ctx.fillStyle = 'rgba(0, 0, 0, 0.07)';
        for (let r = 8; r < 120; r += 12) {
          ctx.fillRect(x + 4, y + r, 116, 2);
        }
      }
    }

    // Asphalt road network traces in aerial view
    ctx.strokeStyle = '#262d33';
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(0, 480);
    ctx.lineTo(1024, 480);
    ctx.stroke();

    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(320, 0);
    ctx.lineTo(320, 1024);
    ctx.moveTo(720, 0);
    ctx.lineTo(720, 1024);
    ctx.stroke();

    // Subtle orthomosaic grid overlay
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 1;
    for (let g = 0; g < 1024; g += 128) {
      ctx.beginPath();
      ctx.moveTo(g, 0);
      ctx.lineTo(g, 1024);
      ctx.moveTo(0, g);
      ctx.lineTo(1024, g);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// 3D Tree Builder
const trunkGeoShared = new THREE.CylinderGeometry(0.5, 0.8, 4.0, 7);
const canopy1GeoShared = new THREE.DodecahedronGeometry(3.0, 1);
const canopy2GeoShared = new THREE.DodecahedronGeometry(2.2, 1);

function create3DTree(
  x: number,
  y: number,
  z: number,
  scale = 1,
  matWood: THREE.Material,
  matFoliage: THREE.Material
): THREE.Group {
  const tree = new THREE.Group();

  const trunk = new THREE.Mesh(trunkGeoShared, matWood);
  trunk.position.set(0, 2.0 * scale, 0);
  trunk.scale.set(scale, scale, scale);
  tree.add(trunk);

  const canopy1 = new THREE.Mesh(canopy1GeoShared, matFoliage);
  canopy1.position.set(0, 4.8 * scale, 0);
  canopy1.scale.set(scale, scale, scale);
  tree.add(canopy1);

  const canopy2 = new THREE.Mesh(canopy2GeoShared, matFoliage);
  canopy2.position.set(0.6 * scale, 6.2 * scale, -0.4 * scale);
  canopy2.scale.set(scale, scale, scale);
  tree.add(canopy2);

  tree.position.set(x, y, z);
  return tree;
}

// Dispose utility to prevent WebGL VRAM memory leaks
function disposeHierarchy(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else if (mesh.material) {
        mesh.material.dispose();
      }
    }
  });
}

// Semantic 3D Coloring helper
function getSemanticBuildingColor(
  building: Building,
  parcel: Parcel | undefined,
  mode: SemanticColorMode,
  calcHeight: number
): THREE.Color {
  if (mode === 'status') {
    const s = parcel?.status;
    if (s === 'verified') return new THREE.Color(0x10b981);
    if (s === 'requires_review') return new THREE.Color(0xf59e0b);
    if (s === 'field_verification') return new THREE.Color(0xef4444);
    return new THREE.Color(0x3b82f6);
  }
  if (mode === 'land_use') {
    const lu = (building.type || parcel?.buildingType || parcel?.landUse || 'residential').toLowerCase();
    if (lu.includes('comm')) return new THREE.Color(0xf97316);
    if (lu.includes('civic') || lu.includes('public')) return new THREE.Color(0xa855f7);
    if (lu.includes('indus')) return new THREE.Color(0x64748b);
    return new THREE.Color(0x38bdf8);
  }
  if (mode === 'height') {
    const t = Math.max(0, Math.min(1, (calcHeight - 6) / 24));
    return new THREE.Color().setHSL(0.55 * (1 - t), 0.85, 0.5);
  }
  if (mode === 'confidence') {
    const conf = parcel?.confidence ?? 90;
    if (conf >= 90) return new THREE.Color(0x10b981);
    if (conf >= 80) return new THREE.Color(0xeab308);
    return new THREE.Color(0xef4444);
  }
  if (mode === 'conflict') {
    if (parcel?.isIssue || parcel?.conflictType || (parcel?.boundaryDisplacement && parcel.boundaryDisplacement >= 0.3)) {
      return new THREE.Color(0xef4444);
    }
    return new THREE.Color(0x94a3b8);
  }
  return new THREE.Color(0xe2e8f0);
}

// ============================================================================
// MAIN 3D MAP VIEWER COMPONENT
// ============================================================================
export default function ThreeDMapViewer({
  parcels,
  buildings,
  roads = [],
  gnssPoints = [],
  selectedParcelId = null,
  onSelectParcel,
  layers,
  height = '100%',
  uploadedImage = null,
  baseCenter = [26.9124, 75.7873],
  threeDMode = 'survey',
  onThreeDModeChange,
  semanticColorMode = 'realistic',
  onSemanticColorModeChange,
  elevationMode = 'off',
  onViewChange,
}: ThreeDMapViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 3D Engine State
  const [realisticBuildings, setRealisticBuildings] = useState<boolean>(() => threeDMode === 'presentation');
  const [roofStyleFilter, setRoofStyleFilter] = useState<RoofStyle | 'auto'>('auto');
  const [terrainExaggeration, setTerrainExaggeration] = useState<number>(1.2);
  const [buildingHeightScale, setBuildingHeightScale] = useState<number>(1.2);
  const [timeOfDay, setTimeOfDay] = useState<number>(14); // 14:00 (2 PM)
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [wireframeMode, setWireframeMode] = useState<boolean>(false);
  const [showContours, setShowContours] = useState<boolean>(true);
  const [showLotLabels, setShowLotLabels] = useState<boolean>(true);
  const [showWater, setShowWater] = useState<boolean>(true);
  const [showBuildings, setShowBuildings] = useState<boolean>(true);
  const [showTrees, setShowTrees] = useState<boolean>(() => threeDMode === 'presentation');
  const [isolateMode, setIsolateMode] = useState<boolean>(false);
  const [hoveredParcel, setHoveredParcel] = useState<Parcel | null>(null);
  const [hoveredBuilding, setHoveredBuilding] = useState<Building | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [cameraPreset, setCameraPreset] = useState<'oblique' | 'iso' | 'topdown' | 'birdseye' | 'northup' | 'fit_project' | 'fit_selection'>('oblique');
  const [showSettingsPanel, setShowSettingsPanel] = useState<boolean>(false);
  const [activeLodLevel, setActiveLodLevel] = useState<number>(0);
  const [isInspectorExpanded, setIsInspectorExpanded] = useState<boolean>(false);

  // Sync threeDMode prop (Item 22 & 30: Survey & Analysis static, Presentation interactive)
  useEffect(() => {
    if (threeDMode === 'survey') {
      setRealisticBuildings(false);
      setShowTrees(false);
      setAutoRotate(false);
    } else if (threeDMode === 'analysis') {
      setRealisticBuildings(false);
      setShowTrees(false);
      setAutoRotate(false);
    } else {
      setRealisticBuildings(true);
      setShowTrees(true);
    }
  }, [threeDMode]);

  const selectedParcel = useMemo(
    () => parcels.find((p) => p.id === selectedParcelId) || null,
    [parcels, selectedParcelId]
  );

  const selectedBuilding = useMemo(
    () => buildings.find((b) => b.parcelId === selectedParcelId) || null,
    [buildings, selectedParcelId]
  );

  // Three.js References
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);
  const buildingsGroupRef = useRef<THREE.Group | null>(null);
  const parcelsGroupRef = useRef<THREE.Group | null>(null);
  const curtainsGroupRef = useRef<THREE.Group | null>(null);
  const labelsGroupRef = useRef<THREE.Group | null>(null);
  const roadsGroupRef = useRef<THREE.Group | null>(null);
  const encroachmentsGroupRef = useRef<THREE.Group | null>(null);
  const terrainMeshRef = useRef<THREE.Mesh | null>(null);
  const contoursGroupRef = useRef<THREE.Group | null>(null);
  const waterMeshRef = useRef<THREE.Mesh | null>(null);
  const dimensionsGroupRef = useRef<THREE.Group | null>(null);
  const orthoTextureRef = useRef<THREE.Texture | null>(null);
  const defaultAerialTexRef = useRef<THREE.Texture | null>(null);

  // Fast Raycast Targets Map
  const raycastTargetsRef = useRef<THREE.Object3D[]>([]);
  const raycastQueued = useRef<boolean>(false);

  // Orbit state
  const orbitState = useRef({
    isDragging: false,
    isPanning: false,
    prevMouseX: 0,
    prevMouseY: 0,
    azimuth: 0.58,
    elevation: 0.72,
    distance: 680,
    target: new THREE.Vector3(500, 0, 500),
  });

  const targetOrbit = useRef({
    azimuth: 0.58,
    elevation: 0.72,
    distance: 680,
    target: new THREE.Vector3(500, 0, 500),
    animating: false,
  });

  // Calculate terrain height at point (x, y)
  const getElevationAt = useCallback(
    (x: number, y: number, exag = terrainExaggeration) => {
      const hill1 = Math.sin(x / 220) * 14;
      const hill2 = Math.cos(y / 280) * 12;
      const slope = ((1000 - y) / 1000) * 22;
      const riverValley = Math.exp(-Math.pow((y - 480) / 70, 2)) * -16;
      return (hill1 + hill2 + slope + riverValley) * exag;
    },
    [terrainExaggeration]
  );

  // Label Texture Helper
  const createLabelTexture = (text: string, color = '#1e293b', bgColor = 'rgba(255, 255, 255, 0.94)') => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 56;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = bgColor;
    ctx.roundRect ? ctx.roundRect(4, 4, 152, 48, 10) : ctx.rect(4, 4, 152, 48);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 80, 28);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    return texture;
  };

  // Camera Presets (Item 29: Oblique, Iso, Top Down, North Up, Fit Project, Fit Selection)
  const applyCameraPreset = useCallback((preset: 'oblique' | 'iso' | 'topdown' | 'birdseye' | 'northup' | 'fit_project' | 'fit_selection') => {
    setCameraPreset(preset);
    const t = targetOrbit.current;
    t.animating = true;
    if (preset === 'oblique') {
      t.azimuth = 0.58;
      t.elevation = 0.72;
      t.distance = 680;
      t.target.set(500, 0, 500);
    } else if (preset === 'iso') {
      t.azimuth = Math.PI / 4;
      t.elevation = 0.615;
      t.distance = 780;
      t.target.set(500, 0, 500);
    } else if (preset === 'topdown') {
      t.azimuth = 0;
      t.elevation = Math.PI / 2 - 0.02;
      t.distance = 920;
      t.target.set(500, 0, 500);
    } else if (preset === 'birdseye') {
      t.azimuth = 1.1;
      t.elevation = 0.48;
      t.distance = 850;
      t.target.set(500, 0, 500);
    } else if (preset === 'northup') {
      t.azimuth = 0;
      t.elevation = 0.65;
      t.distance = 680;
      t.target.set(500, 0, 500);
    } else if (preset === 'fit_project') {
      t.azimuth = 0.58;
      t.elevation = 0.75;
      t.distance = 820;
      t.target.set(500, 0, 500);
    } else if (preset === 'fit_selection') {
      if (selectedParcel && selectedParcel.aiGeometry.length >= 3) {
        const cx = selectedParcel.aiGeometry.reduce((s, pt) => s + pt.x, 0) / selectedParcel.aiGeometry.length;
        const cz = selectedParcel.aiGeometry.reduce((s, pt) => s + pt.y, 0) / selectedParcel.aiGeometry.length;
        const elev = getElevationAt(cx, cz);
        t.target.set(cx, elev + 8, cz);
        t.distance = 180;
        t.elevation = 0.52;
      } else {
        t.azimuth = 0.58;
        t.elevation = 0.72;
        t.distance = 680;
        t.target.set(500, 0, 500);
      }
    }
  }, [selectedParcel, getElevationAt]);

  // Update Camera Position
  const updateCameraPosition = useCallback(() => {
    if (!cameraRef.current) return;
    const o = orbitState.current;
    const cam = cameraRef.current;

    const x = o.target.x + o.distance * Math.cos(o.elevation) * Math.sin(o.azimuth);
    const y = o.target.y + o.distance * Math.sin(o.elevation);
    const z = o.target.z + o.distance * Math.cos(o.elevation) * Math.cos(o.azimuth);

    cam.position.set(x, y, z);
    cam.lookAt(o.target);

    // Compute dynamic LOD level from camera distance
    const dist = o.distance;
    const newLod = dist > 750 ? 2 : dist > 350 ? 1 : 0;
    if (newLod !== activeLodLevel) {
      setActiveLodLevel(newLod);
    }
  }, [activeLodLevel]);

  // Smooth Zoom on Selected Building Change
  useEffect(() => {
    if (!selectedParcelId) {
      targetOrbit.current.target.set(500, 0, 500);
      targetOrbit.current.distance = 680;
      targetOrbit.current.elevation = 0.72;
      targetOrbit.current.animating = true;
      return;
    }

    const parcel = parcels.find((p) => p.id === selectedParcelId);
    if (!parcel || parcel.aiGeometry.length === 0) return;

    const cx = parcel.aiGeometry.reduce((s, pt) => s + pt.x, 0) / parcel.aiGeometry.length;
    const cz = parcel.aiGeometry.reduce((s, pt) => s + pt.y, 0) / parcel.aiGeometry.length;
    const groundElev = getElevationAt(cx, cz);
    const height = Math.max(6, (parcel.buildingHeight || 14) * buildingHeightScale);

    targetOrbit.current.target.set(cx, groundElev + height / 2, cz);
    targetOrbit.current.distance = 180;
    targetOrbit.current.elevation = 0.48;
    targetOrbit.current.animating = true;
  }, [selectedParcelId, parcels, buildingHeightScale, getElevationAt]);

  // Load uploaded drone orthomosaic image as Three.js texture
  useEffect(() => {
    if (uploadedImage) {
      const loader = new THREE.TextureLoader();
      loader.load(
        uploadedImage,
        (tex) => {
          tex.wrapS = THREE.ClampToEdgeWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          orthoTextureRef.current = tex;
          // Re-render terrain with orthomosaic
          if (terrainMeshRef.current) {
            (terrainMeshRef.current.material as THREE.MeshStandardMaterial).map = tex;
            (terrainMeshRef.current.material as THREE.MeshStandardMaterial).needsUpdate = true;
          }
        },
        undefined,
        () => {
          orthoTextureRef.current = null;
        }
      );
    } else {
      orthoTextureRef.current = null;
    }
  }, [uploadedImage]);

  // Initial Scene Setup
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 600;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);
    scene.fog = new THREE.FogExp2(0xf1f5f9, 0.00032);
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 10, 5000);
    cameraRef.current = camera;
    updateCameraPosition();

    // 3. WebGL Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    rendererRef.current = renderer;

    if (!defaultAerialTexRef.current) {
      defaultAerialTexRef.current = createDefaultAerialTexture();
    }

    // 4. Calibrated Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.82);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xfffbeb, 0x64748b, 0.65);
    hemiLight.position.set(0, 500, 0);
    scene.add(hemiLight);
    hemiLightRef.current = hemiLight;

    const dirLight = new THREE.DirectionalLight(0xfffaed, 1.45);
    dirLight.position.set(450, 650, 450);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 50;
    dirLight.shadow.camera.far = 1800;
    const d = 650;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0004;
    scene.add(dirLight);
    dirLightRef.current = dirLight;

    // 5. Scene Groups (Buildings, Parcels, Curtains, Labels, Roads, Encroachments, Contours, Dimensions)
    const buildingsGroup = new THREE.Group();
    const parcelsGroup = new THREE.Group();
    const curtainsGroup = new THREE.Group();
    const labelsGroup = new THREE.Group();
    const roadsGroup = new THREE.Group();
    const encroachmentsGroup = new THREE.Group();
    const contoursGroup = new THREE.Group();
    const dimensionsGroup = new THREE.Group();
    scene.add(buildingsGroup);
    scene.add(parcelsGroup);
    scene.add(curtainsGroup);
    scene.add(labelsGroup);
    scene.add(roadsGroup);
    scene.add(encroachmentsGroup);
    scene.add(contoursGroup);
    scene.add(dimensionsGroup);

    buildingsGroupRef.current = buildingsGroup;
    parcelsGroupRef.current = parcelsGroup;
    curtainsGroupRef.current = curtainsGroup;
    labelsGroupRef.current = labelsGroup;
    roadsGroupRef.current = roadsGroup;
    encroachmentsGroupRef.current = encroachmentsGroup;
    contoursGroupRef.current = contoursGroup;
    dimensionsGroupRef.current = dimensionsGroup;

    // Resize Handler
    const handleResize = () => {
      if (!containerRef.current || !renderer || !camera) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // 60 FPS Render Loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);

      if (targetOrbit.current.animating) {
        const o = orbitState.current;
        const t = targetOrbit.current;

        o.target.lerp(t.target, 0.08);
        o.distance += (t.distance - o.distance) * 0.08;
        o.elevation += (t.elevation - o.elevation) * 0.08;
        o.azimuth += (t.azimuth - o.azimuth) * 0.08;

        if (
          o.target.distanceTo(t.target) < 0.5 &&
          Math.abs(o.distance - t.distance) < 0.5 &&
          Math.abs(o.elevation - t.elevation) * 100 < 1
        ) {
          t.animating = false;
        }
        updateCameraPosition();
      } else if (autoRotate) {
        orbitState.current.azimuth += 0.0025;
        updateCameraPosition();
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, [autoRotate, updateCameraPosition]);

  // Update Sunlight & Atmosphere based on Time of Day
  useEffect(() => {
    if (!dirLightRef.current || !sceneRef.current) return;
    const hour = timeOfDay;
    const angle = ((hour - 6) / 14) * Math.PI;
    const sunX = Math.cos(angle) * 700 + 500;
    const sunY = Math.sin(angle) * 650 + 100;
    const sunZ = Math.sin(angle) * 350 + 300;

    dirLightRef.current.position.set(sunX, sunY, sunZ);
    dirLightRef.current.intensity = hour < 7 || hour > 19 ? 0.2 : Math.sin(angle) * 1.5 + 0.25;

    const isNight = hour > 18.5;
    const bgColor = isNight ? 0x0f172a : 0xf1f5f9;
    sceneRef.current.background = new THREE.Color(bgColor);
    if (sceneRef.current.fog) {
      (sceneRef.current.fog as THREE.FogExp2).color = new THREE.Color(bgColor);
    }
  }, [timeOfDay]);

  // Build 3D Terrain, River & Orthomosaic Integration
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    if (terrainMeshRef.current) {
      disposeHierarchy(terrainMeshRef.current);
      scene.remove(terrainMeshRef.current);
    }
    if (waterMeshRef.current) {
      disposeHierarchy(waterMeshRef.current);
      scene.remove(waterMeshRef.current);
    }

    const segs = 80;
    const terrainGeo = new THREE.PlaneGeometry(1000, 1000, segs, segs);
    terrainGeo.rotateX(-Math.PI / 2);
    terrainGeo.translate(500, 0, 500);

    const pos = terrainGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    const activeGroundTexture = orthoTextureRef.current || defaultAerialTexRef.current || createDefaultAerialTexture();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const elev = getElevationAt(x, z);
      pos.setY(i, elev);

      let r = 0.92, g = 0.94, b = 0.96;
      if (elevationMode === 'elevation') {
        const normH = Math.max(0, Math.min(1, (elev + 16) / 50));
        const col = new THREE.Color().setHSL(0.6 * (1 - normH), 0.9, 0.48);
        r = col.r; g = col.g; b = col.b;
      } else if (elevationMode === 'hillshade') {
        const dx = getElevationAt(x + 6, z) - getElevationAt(x - 6, z);
        const dz = getElevationAt(x, z + 6) - getElevationAt(x, z - 6);
        const shade = Math.max(0.25, Math.min(0.95, 0.62 - (dx * 0.045 - dz * 0.045)));
        r = shade; g = shade; b = shade;
      } else if (elevationMode === 'slope') {
        const dx = getElevationAt(x + 6, z) - getElevationAt(x - 6, z);
        const dz = getElevationAt(x, z + 6) - getElevationAt(x, z - 6);
        const slopeVal = Math.min(1, Math.hypot(dx, dz) / 4.5);
        const col = new THREE.Color().setHSL(0.35 * (1 - slopeVal), 0.85, 0.48);
        r = col.r; g = col.g; b = col.b;
      } else if (elevationMode === 'ndsm') {
        const normN = Math.max(0, Math.min(1, Math.abs(elev) / 28));
        const col = new THREE.Color().setHSL(0.55 - normN * 0.42, 0.85, 0.5);
        r = col.r; g = col.g; b = col.b;
      } else {
        if (z > 580) {
          r = 0.85; g = 0.95; b = 0.87;
        } else if (z < 350) {
          r = 0.75; g = 0.88; b = 0.65;
        } else if (Math.abs(z - 480) < 32) {
          r = 0.86; g = 0.90; b = 0.94;
        }
      }

      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    terrainGeo.computeVertexNormals();

    const isAnalyticalElevation = elevationMode !== 'off';
    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: isAnalyticalElevation,
      map: isAnalyticalElevation ? null : activeGroundTexture,
      roughness: 0.88,
      metalness: 0.05,
      wireframe: wireframeMode,
      transparent: !!selectedParcelId,
      opacity: selectedParcelId ? 0.94 : 1.0,
    });

    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);
    terrainMeshRef.current = terrainMesh;

    // Water Canal / River
    if (showWater) {
      const waterGeo = new THREE.PlaneGeometry(1000, 48, 40, 1);
      waterGeo.rotateX(-Math.PI / 2);
      waterGeo.translate(500, -5.5 * terrainExaggeration, 480);
      const waterMat = new THREE.MeshStandardMaterial({
        color: PALETTE.waterBlue,
        roughness: 0.08,
        metalness: 0.6,
        transparent: true,
        opacity: 0.85,
      });
      const waterMesh = new THREE.Mesh(waterGeo, waterMat);
      scene.add(waterMesh);
      waterMeshRef.current = waterMesh;
    }

    // Topographic Contours
    if (contoursGroupRef.current) {
      const cGroup = contoursGroupRef.current;
      while (cGroup.children.length > 0) {
        disposeHierarchy(cGroup.children[0]);
        cGroup.remove(cGroup.children[0]);
      }

      if (showContours) {
        const lineMat = new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.35 });
        for (let y = 100; y <= 900; y += 75) {
          const pts: THREE.Vector3[] = [];
          for (let x = 0; x <= 1000; x += 25) {
            pts.push(new THREE.Vector3(x, getElevationAt(x, y) + 0.4, y));
          }
          const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
          cGroup.add(new THREE.Line(lineGeo, lineMat));
        }
      }
    }
  }, [getElevationAt, showContours, showWater, terrainExaggeration, wireframeMode, selectedParcelId, elevationMode]);

  // Build / Rebuild Procedural 3D Buildings, Vertical Projection Curtains & Cadastral Overlays
  useEffect(() => {
    if (!buildingsGroupRef.current || !parcelsGroupRef.current || !labelsGroupRef.current || !dimensionsGroupRef.current) return;

    const bGroup = buildingsGroupRef.current;
    const pGroup = parcelsGroupRef.current;
    const lGroup = labelsGroupRef.current;
    const dGroup = dimensionsGroupRef.current;
    const cGroup = curtainsGroupRef.current;

    while (bGroup.children.length > 0) {
      disposeHierarchy(bGroup.children[0]);
      bGroup.remove(bGroup.children[0]);
    }
    while (pGroup.children.length > 0) {
      disposeHierarchy(pGroup.children[0]);
      pGroup.remove(pGroup.children[0]);
    }
    while (lGroup.children.length > 0) {
      disposeHierarchy(lGroup.children[0]);
      lGroup.remove(lGroup.children[0]);
    }
    while (dGroup.children.length > 0) {
      disposeHierarchy(dGroup.children[0]);
      dGroup.remove(dGroup.children[0]);
    }
    if (cGroup) {
      while (cGroup.children.length > 0) {
        disposeHierarchy(cGroup.children[0]);
        cGroup.remove(cGroup.children[0]);
      }
    }

    if (roadsGroupRef.current) {
      while (roadsGroupRef.current.children.length > 0) {
        disposeHierarchy(roadsGroupRef.current.children[0]);
        roadsGroupRef.current.remove(roadsGroupRef.current.children[0]);
      }
    }
    if (encroachmentsGroupRef.current) {
      while (encroachmentsGroupRef.current.children.length > 0) {
        disposeHierarchy(encroachmentsGroupRef.current.children[0]);
        encroachmentsGroupRef.current.remove(encroachmentsGroupRef.current.children[0]);
      }
    }

    raycastTargetsRef.current = [];

    if (!showBuildings) return;

    const hasSelection = !!selectedParcelId;
    const isNight = timeOfDay > 18.5;
    const mats = getArchitecturalMaterials(isNight, wireframeMode);

    // 1. Draped Cadastral Parcel Boundaries (Item 20: Thin, subdued solid cyan for existing, dashed purple for AI)
    parcels.forEach((parcel) => {
      const isSelected = parcel.id === selectedParcelId;

      // 1A. Existing parcel record (Subtle Solid Cyan Line)
      if (layers?.existingCadastralParcels !== false && parcel.hasExistingBoundary !== false) {
        const existPts = parcel.existingGeometry;
        if (existPts && existPts.length >= 3) {
          const linePoints: THREE.Vector3[] = [];
          for (let i = 0; i <= existPts.length; i++) {
            const pt = existPts[i % existPts.length];
            const elev = getElevationAt(pt.x, pt.y) + (isSelected ? 1.5 : 0.6);
            linePoints.push(new THREE.Vector3(pt.x, elev, pt.y));
          }
          const lineMat = new THREE.LineBasicMaterial({
            color: isSelected ? 0x00e5ff : 0x06b6d4, // Subtle Cyan (Solid)
            linewidth: isSelected ? 3.0 : 1.4,
            transparent: true,
            opacity: isSelected ? 1.0 : hasSelection && !isSelected && isolateMode ? 0.35 : 0.75,
          });
          const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
          const parcelLine = new THREE.Line(lineGeo, lineMat);
          parcelLine.userData = { parcelId: parcel.id, type: 'existing' };
          pGroup.add(parcelLine);
        }
      }

      // 1B. AI Predicted Boundary (Subtle Dashed Purple Line)
      if (layers?.aiParcelBoundaries !== false && parcel.hasAiBoundary !== false) {
        const aiPts = parcel.aiGeometry;
        if (aiPts && aiPts.length >= 3) {
          const linePoints: THREE.Vector3[] = [];
          let avgX = 0, avgZ = 0;

          for (let i = 0; i <= aiPts.length; i++) {
            const pt = aiPts[i % aiPts.length];
            const elev = getElevationAt(pt.x, pt.y) + (isSelected ? 1.6 : 0.7);
            linePoints.push(new THREE.Vector3(pt.x, elev, pt.y));
            if (i < aiPts.length) {
              avgX += pt.x;
              avgZ += pt.y;
            }
          }
          avgX /= aiPts.length;
          avgZ /= aiPts.length;

          const isConflict = parcel.isIssue || parcel.conflictType !== null;
          const lineMat = new THREE.LineDashedMaterial({
            color: isSelected ? 0x00e5ff : isConflict ? 0xef4444 : 0x8b5cf6, // Purple / Conflict Red
            linewidth: isSelected ? 3.0 : 1.4,
            scale: 1,
            dashSize: 3,
            gapSize: 2,
            transparent: true,
            opacity: isSelected ? 1.0 : hasSelection && !isSelected && isolateMode ? 0.35 : 0.70,
          });
          const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
          const parcelLine = new THREE.Line(lineGeo, lineMat);
          parcelLine.computeLineDistances();
          parcelLine.userData = { parcelId: parcel.id, type: 'ai' };
          pGroup.add(parcelLine);

          // Survey Lot Number Labels
          if (showLotLabels && (!hasSelection || isSelected || !isolateMode)) {
            const lotNum = parcel.surveyNumber || parcel.id.replace('TN-CHN-W42-', '');
            const labelTex = createLabelTexture(
              lotNum,
              isSelected ? '#0284c7' : '#7c3aed',
              isSelected ? 'rgba(239, 246, 255, 0.95)' : 'rgba(255, 255, 255, 0.88)'
            );
            if (labelTex) {
              const spriteMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true });
              const sprite = new THREE.Sprite(spriteMat);
              sprite.position.set(avgX, getElevationAt(avgX, avgZ) + (isSelected ? 8 : 5), avgZ);
              sprite.scale.set(isSelected ? 30 : 22, isSelected ? 10 : 8, 1);
              sprite.userData = { parcelId: parcel.id };
              lGroup.add(sprite);
            }
          }
        }
      }
    });

    // 2. Vertical Projection Curtain (Item 26: Subtle translucent curtain rising from ground along boundary)
    if (cGroup && selectedParcel) {
      const curtainPts = (selectedParcel.aiGeometry && selectedParcel.aiGeometry.length >= 3)
        ? selectedParcel.aiGeometry
        : (selectedParcel.existingGeometry && selectedParcel.existingGeometry.length >= 3 ? selectedParcel.existingGeometry : null);

      if (curtainPts && curtainPts.length >= 3) {
        const curtainHeight = Math.max(22, ((selectedParcel.buildingHeight || 14) * buildingHeightScale) + 10);
        const positions: number[] = [];

        for (let i = 0; i < curtainPts.length; i++) {
          const p1 = curtainPts[i];
          const p2 = curtainPts[(i + 1) % curtainPts.length];
          const elev1 = getElevationAt(p1.x, p1.y);
          const elev2 = getElevationAt(p2.x, p2.y);

          positions.push(p1.x, elev1, p1.y);
          positions.push(p2.x, elev2, p2.y);
          positions.push(p1.x, elev1 + curtainHeight, p1.y);

          positions.push(p2.x, elev2, p2.y);
          positions.push(p2.x, elev2 + curtainHeight, p2.y);
          positions.push(p1.x, elev1 + curtainHeight, p1.y);
        }

        const curtainGeo = new THREE.BufferGeometry();
        curtainGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        curtainGeo.computeVertexNormals();

        const curtainMat = new THREE.MeshBasicMaterial({
          color: 0x00e5ff,
          transparent: true,
          opacity: 0.18,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        cGroup.add(new THREE.Mesh(curtainGeo, curtainMat));

        // Luminous top rim outline
        const topRimPoints: THREE.Vector3[] = [];
        for (let i = 0; i <= curtainPts.length; i++) {
          const pt = curtainPts[i % curtainPts.length];
          topRimPoints.push(new THREE.Vector3(pt.x, getElevationAt(pt.x, pt.y) + curtainHeight, pt.y));
        }
        const topRimGeo = new THREE.BufferGeometry().setFromPoints(topRimPoints);
        const topRimMat = new THREE.LineBasicMaterial({
          color: 0x00e5ff,
          linewidth: 2.0,
          transparent: true,
          opacity: 0.85,
        });
        cGroup.add(new THREE.Line(topRimGeo, topRimMat));
      }
    }

    // 3. Build Draped Asphalt Roads (Item 19: Restrained dark neutral asphalt with centerline)
    if (roadsGroupRef.current && layers?.roads !== false && roads.length > 0) {
      const rGroup = roadsGroupRef.current;
      const roadMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.92,
        metalness: 0.04,
      });
      const centerlineMat = new THREE.LineBasicMaterial({
        color: 0x64748b,
        linewidth: 1.5,
        transparent: true,
        opacity: 0.55,
      });

      roads.forEach((road) => {
        if (road.path.length < 2) return;
        const roadWidth = Math.max(3.2, road.width / 2.8);
        const positions: number[] = [];
        const centerPts: THREE.Vector3[] = [];

        for (let i = 0; i < road.path.length - 1; i++) {
          const p1 = road.path[i];
          const p2 = road.path[i + 1];
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = (-dy / len) * (roadWidth / 2);
          const ny = (dx / len) * (roadWidth / 2);

          const elev1 = getElevationAt(p1.x, p1.y) + 0.35;
          const elev2 = getElevationAt(p2.x, p2.y) + 0.35;

          positions.push(p1.x - nx, elev1, p1.y - ny);
          positions.push(p1.x + nx, elev1, p1.y + ny);
          positions.push(p2.x - nx, elev2, p2.y - ny);

          positions.push(p1.x + nx, elev1, p1.y + ny);
          positions.push(p2.x + nx, elev2, p2.y + ny);
          positions.push(p2.x - nx, elev2, p2.y - ny);

          centerPts.push(new THREE.Vector3(p1.x, elev1 + 0.1, p1.y));
          if (i === road.path.length - 2) {
            centerPts.push(new THREE.Vector3(p2.x, elev2 + 0.1, p2.y));
          }
        }

        const ribbonGeo = new THREE.BufferGeometry();
        ribbonGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        ribbonGeo.computeVertexNormals();
        rGroup.add(new THREE.Mesh(ribbonGeo, roadMat));

        const centerGeo = new THREE.BufferGeometry().setFromPoints(centerPts);
        rGroup.add(new THREE.Line(centerGeo, centerlineMat));
      });
    }

    // 4. Build 3D Cadastral Encroachments & Conflict Volumes (Item 25)
    if (encroachmentsGroupRef.current && (threeDMode === 'analysis' || layers?.conflictAreas)) {
      const eGroup = encroachmentsGroupRef.current;
      parcels.filter(p => p.isIssue || p.conflictType).forEach(p => {
        const geom = p.aiGeometry?.length >= 3 ? p.aiGeometry : p.existingGeometry;
        if (!geom || geom.length < 3) return;

        const cx = geom.reduce((s, pt) => s + pt.x, 0) / geom.length;
        const cz = geom.reduce((s, pt) => s + pt.y, 0) / geom.length;
        const elev = getElevationAt(cx, cz);

        // Render 3D beacon marker on conflict parcels
        const conflictGeo = new THREE.CylinderGeometry(4, 9, 14, 12);
        const conflictMat = new THREE.MeshBasicMaterial({
          color: p.conflictType === 'building_encroachment' ? 0xe11d48 : 0xef4444,
          transparent: true,
          opacity: 0.38,
          wireframe: true,
        });
        const conflictMesh = new THREE.Mesh(conflictGeo, conflictMat);
        conflictMesh.position.set(cx, elev + 7, cz);
        eGroup.add(conflictMesh);
      });
    }

    // 5. Build 3D Buildings (Item 18 & 22: Survey nDSM massing vs Presentation PBR architecture)
    const useRealistic = threeDMode === 'presentation' && realisticBuildings;

    buildings.forEach((building) => {
      const pts = building.geometry;
      if (pts.length < 3) return;

      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cz = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      const groundElev = getElevationAt(cx, cz);
      const isSelected = building.parcelId === selectedParcelId;
      const isGhosted = hasSelection && !isSelected && isolateMode;

      let buildingObj: THREE.Group;
      let calculatedHeight = (building.height || 14) * buildingHeightScale;
      let calculatedFloors = building.floors || 3;
      let isEstimated = building.isHeightEstimated ?? true;

      if (useRealistic) {
        // High-realism procedural building (Presentation Mode)
        const result = buildProceduralBuilding({
          building,
          groundElevation: groundElev,
          heightScale: buildingHeightScale,
          isSelected,
          isGhosted,
          wireframe: wireframeMode,
          isNight,
          lodLevel: activeLodLevel,
          forcedRoofStyle: roofStyleFilter,
        });
        buildingObj = result.group;
        calculatedHeight = result.heightResult.totalHeight;
        calculatedFloors = result.heightResult.floors;
        isEstimated = result.heightResult.isHeightEstimated;
      } else {
        // Simplified GIS block extrusion with neutral survey materials (Survey / Analysis Mode)
        buildingObj = buildSimplifiedExtrusionBuilding(
          building,
          groundElev,
          buildingHeightScale,
          isSelected,
          isNight
        );
      }

      // Apply Semantic Color override when not in default realistic mode
      if (semanticColorMode !== 'realistic' || threeDMode === 'analysis') {
        const matchingParcel = parcels.find((p) => p.id === building.parcelId);
        const semColor = getSemanticBuildingColor(
          building,
          matchingParcel || null,
          semanticColorMode !== 'realistic' ? semanticColorMode : 'status',
          calculatedHeight
        );
        buildingObj.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.material = new THREE.MeshStandardMaterial({
              color: semColor,
              roughness: 0.65,
              metalness: 0.1,
              wireframe: wireframeMode,
            });
          }
        });
      }

      // Register root meshes for fast raycasting
      buildingObj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh && child.userData?.parcelId) {
          raycastTargetsRef.current.push(child);
        }
      });

      // Selected Building 3D Dimension Annotation Tag
      if (isSelected) {
        const markerX = cx + 18;
        const markerZ = cz;
        const dimensionPts = [
          new THREE.Vector3(markerX, groundElev, markerZ),
          new THREE.Vector3(markerX, groundElev + calculatedHeight, markerZ),
        ];
        const dimGeo = new THREE.BufferGeometry().setFromPoints(dimensionPts);
        const dimMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, linewidth: 2.5 });
        dGroup.add(new THREE.Line(dimGeo, dimMat));

        // Floating Height & Floor Tag Sprite (Item 23: Provenance Badges)
        const provenanceTag = isEstimated ? '[Est.]' : '[DSM/DTM]';
        const heightLabel = `H: ${calculatedHeight.toFixed(1)}m (${calculatedFloors}F) ${provenanceTag}`;
        const heightTex = createLabelTexture(heightLabel, '#0284c7', '#eff6ff');
        if (heightTex) {
          const hSpriteMat = new THREE.SpriteMaterial({ map: heightTex, transparent: true });
          const hSprite = new THREE.Sprite(hSpriteMat);
          hSprite.position.set(markerX, groundElev + calculatedHeight / 2, markerZ);
          hSprite.scale.set(38, 12, 1);
          dGroup.add(hSprite);
        }
      }

      bGroup.add(buildingObj);
    });

    // 6. Populate 3D Landscape Foliage Trees (Item 35: Strictly in Presentation Mode via Instancing)
    if (threeDMode === 'presentation' && showTrees && !wireframeMode) {
      const validParcels = parcels.filter(p => p.aiGeometry && p.aiGeometry.length >= 3);
      if (validParcels.length > 0) {
        const trunkMesh = new THREE.InstancedMesh(trunkGeoShared, mats.treeWood, validParcels.length);
        const canopyMesh = new THREE.InstancedMesh(canopy1GeoShared, mats.treeFoliage, validParcels.length);
        const dummy = new THREE.Object3D();

        validParcels.forEach((parcel, idx) => {
          const pt = parcel.aiGeometry[idx % parcel.aiGeometry.length];
          const elev = getElevationAt(pt.x, pt.y);
          const scale = 0.95 + (idx % 3) * 0.15;

          // Trunk instance
          dummy.position.set(pt.x + 4, elev + 2.0 * scale, pt.y + 4);
          dummy.scale.set(scale, scale, scale);
          dummy.updateMatrix();
          trunkMesh.setMatrixAt(idx, dummy.matrix);

          // Canopy instance
          dummy.position.set(pt.x + 4, elev + 4.8 * scale, pt.y + 4);
          dummy.scale.set(scale, scale, scale);
          dummy.updateMatrix();
          canopyMesh.setMatrixAt(idx, dummy.matrix);
        });

        trunkMesh.instanceMatrix.needsUpdate = true;
        canopyMesh.instanceMatrix.needsUpdate = true;
        pGroup.add(trunkMesh);
        pGroup.add(canopyMesh);
      }
    }
  }, [
    buildings,
    parcels,
    roads,
    selectedParcelId,
    selectedParcel,
    buildingHeightScale,
    getElevationAt,
    showBuildings,
    showLotLabels,
    showTrees,
    wireframeMode,
    isolateMode,
    timeOfDay,
    realisticBuildings,
    threeDMode,
    semanticColorMode,
    roofStyleFilter,
    activeLodLevel,
    layers,
  ]);

  // Pointer Handlers for Smooth Orbit & Throttled Raycasting
  const handlePointerDown = (e: React.PointerEvent) => {
    // Only drag and orbit when interacting directly with the 3D WebGL canvas
    if (e.target !== canvasRef.current) return;
    const o = orbitState.current;
    o.isDragging = e.button === 0;
    o.isPanning = e.button === 2;
    o.prevMouseX = e.clientX;
    o.prevMouseY = e.clientY;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const o = orbitState.current;
    if (o.isDragging || o.isPanning) {
      const dx = e.clientX - o.prevMouseX;
      const dy = e.clientY - o.prevMouseY;
      o.prevMouseX = e.clientX;
      o.prevMouseY = e.clientY;

      if (o.isDragging) {
        o.azimuth -= dx * 0.0055;
        o.elevation = Math.max(0.1, Math.min(Math.PI / 2 - 0.02, o.elevation + dy * 0.0055));
        updateCameraPosition();
      } else if (o.isPanning) {
        const panSpeed = o.distance * 0.0014;
        const forward = new THREE.Vector3(-Math.sin(o.azimuth), 0, -Math.cos(o.azimuth));
        const right = new THREE.Vector3(Math.cos(o.azimuth), 0, -Math.sin(o.azimuth));

        o.target.addScaledVector(right, -dx * panSpeed);
        o.target.addScaledVector(forward, dy * panSpeed);
        updateCameraPosition();
      }
      return;
    }

    // Do not raycast if cursor is over HTML overlay elements
    if (e.target !== canvasRef.current) {
      setHoveredParcel(null);
      setHoveredBuilding(null);
      return;
    }

    // Throttled Raycast on Hover
    if (raycastQueued.current || !containerRef.current || !cameraRef.current) return;
    raycastQueued.current = true;

    const clientX = e.clientX;
    const clientY = e.clientY;

    requestAnimationFrame(() => {
      raycastQueued.current = false;
      if (!containerRef.current || !cameraRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cameraRef.current);

      const intersects = raycaster.intersectObjects(raycastTargetsRef.current, false);

      if (intersects.length > 0) {
        const targetObj = intersects[0].object;
        if (targetObj.userData?.parcelId) {
          const foundParcel = parcels.find((p) => p.id === targetObj.userData.parcelId);
          const foundBuilding = buildings.find((b) => b.parcelId === targetObj.userData.parcelId);
          if (foundParcel) {
            setHoveredParcel(foundParcel);
            setHoveredBuilding(foundBuilding || null);
            setHoverPos({ x: clientX - rect.left, y: clientY - rect.top });
            return;
          }
        }
      }
      setHoveredParcel(null);
      setHoveredBuilding(null);
    });
  };

  const handlePointerUp = () => {
    orbitState.current.isDragging = false;
    orbitState.current.isPanning = false;

    if (onViewChange) {
      const o = orbitState.current;
      const dX = (o.target.x - 500) * 0.00001;
      const dZ = (o.target.z - 500) * 0.00001;
      const curLat = baseCenter[0] - dZ;
      const curLng = baseCenter[1] + dX;
      const curZoom = Math.round(17 - Math.log2(Math.max(120, o.distance) / 680));
      onViewChange([curLat, curLng], Math.max(14, Math.min(20, curZoom)));
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const o = orbitState.current;
    o.distance = Math.max(120, Math.min(1800, o.distance + e.deltaY * 0.7));
    updateCameraPosition();
  };

  const handleClick = (e: React.MouseEvent) => {
    // Only raycast click when clicking directly on the 3D canvas
    if (e.target !== canvasRef.current) return;
    if (!containerRef.current || !cameraRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);

    const intersects = raycaster.intersectObjects(raycastTargetsRef.current, false);

    if (intersects.length > 0) {
      const targetObj = intersects[0].object;
      if (targetObj.userData?.parcelId) {
        onSelectParcel?.(targetObj.userData.parcelId);
        return;
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-slate-900 overflow-hidden select-none rounded-xl border border-slate-800"
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
      onClick={handleClick}
    >
      <canvas ref={canvasRef} className="w-full h-full block cursor-grab active:cursor-grabbing" />

      {/* Top Navigation & Camera Controls Toolbar (Row 2, placed cleanly below WebGIS Presets Bar) */}
      <div className="absolute top-14 left-3 right-3 z-20 flex items-center justify-between pointer-events-none gap-2 flex-wrap">
        {/* Left: Brand & Camera Presets */}
        <div className="flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 p-1.5 rounded-xl text-white shadow-xl pointer-events-auto flex-wrap">
          <span className="text-xs font-bold text-blue-400 flex items-center gap-1.5 px-2 border-r border-slate-700">
            <Box className="w-4 h-4 text-blue-400" /> 3D Digital Twin
          </span>

          {/* 3D Modes: Survey | Analysis | Presentation (Item 22) */}
          <div className="flex items-center bg-slate-800/90 p-0.5 rounded-lg border border-slate-700/80">
            <button
              onClick={() => {
                onThreeDModeChange?.('survey');
                onSemanticColorModeChange?.('realistic');
              }}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                threeDMode === 'survey'
                  ? 'bg-blue-600 text-white shadow-xs ring-1 ring-blue-400'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Survey Mode: Precise cadastral boundary massing, neutral materials, vertical curtains"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Survey</span>
            </button>
            <button
              onClick={() => {
                onThreeDModeChange?.('analysis');
                onSemanticColorModeChange?.('conflict');
              }}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                threeDMode === 'analysis'
                  ? 'bg-amber-600 text-white shadow-xs ring-1 ring-amber-400'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Analysis Mode: Thematic coloring, conflict extrusion, displacement heights, error beacons"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Analysis</span>
            </button>
            <button
              onClick={() => {
                onThreeDModeChange?.('presentation');
                onSemanticColorModeChange?.('realistic');
              }}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                threeDMode === 'presentation'
                  ? 'bg-emerald-600 text-white shadow-xs ring-1 ring-emerald-400'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Presentation Mode: High-realism procedural architecture, trees, atmosphere"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Presentation</span>
            </button>
          </div>

          {/* Semantic Coloring Mode Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-800/90 px-2 py-1 rounded-lg border border-slate-700/80 text-xs">
            <span className="text-[10px] uppercase font-bold text-slate-400">Color:</span>
            <select
              value={semanticColorMode}
              onChange={(e) => onSemanticColorModeChange?.(e.target.value as any)}
              className="bg-transparent text-xs text-white focus:outline-none cursor-pointer"
              title="Semantic Building Coloring"
            >
              <option value="realistic" className="bg-slate-800 text-white">Realistic / Default</option>
              <option value="status" className="bg-slate-800 text-white">By Status</option>
              <option value="landuse" className="bg-slate-800 text-white">By Land Use</option>
              <option value="height" className="bg-slate-800 text-white">By Height Ramp</option>
              <option value="confidence" className="bg-slate-800 text-white">By Confidence</option>
              <option value="conflict" className="bg-slate-800 text-white">By Conflict / Dispute</option>
            </select>
          </div>

          {/* Camera Navigation Presets (Item 29) */}
          <div className="flex items-center gap-1 bg-slate-800/90 p-0.5 rounded-lg border border-slate-700/80">
            <button
              onClick={() => applyCameraPreset('fit_project')}
              className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-all ${
                cameraPreset === 'fit_project' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
              }`}
              title="Fit Entire Project Extents"
            >
              Fit Project
            </button>
            <button
              onClick={() => applyCameraPreset('fit_selection')}
              className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-all ${
                cameraPreset === 'fit_selection' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
              }`}
              title="Fit Camera to Selected Feature"
            >
              Fit Selection
            </button>
            <button
              onClick={() => applyCameraPreset('northup')}
              className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-all ${
                cameraPreset === 'northup' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
              }`}
              title="North Up (0° Azimuth Survey Orientation)"
            >
              North Up
            </button>
            <button
              onClick={() => applyCameraPreset('oblique')}
              className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-all ${
                cameraPreset === 'oblique' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
              }`}
              title="Oblique 3D (Architectural Perspective)"
            >
              Oblique
            </button>
            <button
              onClick={() => applyCameraPreset('iso')}
              className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-all ${
                cameraPreset === 'iso' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
              }`}
              title="Isometric 3D"
            >
              Iso
            </button>
            <button
              onClick={() => applyCameraPreset('topdown')}
              className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-all ${
                cameraPreset === 'topdown' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
              }`}
              title="2D Top Down Orthographic"
            >
              Top Down
            </button>
          </div>

          {/* Item 30: Auto-Orbit tour enabled only in presentation mode */}
          {threeDMode === 'presentation' && (
            <button
              onClick={() => setAutoRotate(!autoRotate)}
              className={`p-1.5 rounded-lg border transition-colors ${
                autoRotate ? 'bg-amber-600 border-amber-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
              }`}
              title="Toggle Auto-Orbit Presentation Tour"
            >
              {autoRotate ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
          )}

          <button
            onClick={() => applyCameraPreset('oblique')}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 hover:text-white"
            title="Reset Camera Orientation"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Quick Action Toggles & Settings Dropdown */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          {/* Roof Style Selector (when realistic buildings are enabled) */}
          {realisticBuildings && (
            <div className="flex items-center gap-1 bg-slate-900/90 backdrop-blur-md border border-slate-700 p-1 rounded-xl text-white shadow-xl text-xs">
              <span className="text-[11px] text-slate-400 px-1 font-semibold">Roofs:</span>
              <select
                value={roofStyleFilter}
                onChange={(e) => setRoofStyleFilter(e.target.value as any)}
                className="bg-slate-800 border border-slate-700 rounded-lg text-xs px-2 py-1 text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="auto">Auto Plausible</option>
                <option value="flat_parapet">Flat + Parapet</option>
                <option value="gable">Gable Pitch</option>
                <option value="hip">Hip Roof</option>
                <option value="shed">Industrial Shed</option>
                <option value="flat">Terrace Slab</option>
              </select>
            </div>
          )}

          <button
            onClick={() => setIsolateMode(!isolateMode)}
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all backdrop-blur-md flex items-center gap-1.5 shadow-xl ${
              isolateMode ? 'bg-indigo-600/90 border-indigo-500 text-white' : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:text-white'
            }`}
            title="Toggle soft focus dimming on unselected buildings"
          >
            <Sparkles className="w-3.5 h-3.5" /> Focus Dim: {isolateMode ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={() => setShowSettingsPanel(!showSettingsPanel)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all backdrop-blur-md flex items-center gap-1.5 shadow-xl ${
              showSettingsPanel ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:text-white'
            }`}
            title="Toggle Lighting, Terrain, and Architectural Controls"
          >
            <Sun className="w-3.5 h-3.5 text-amber-400" /> 3D Controls
          </button>
        </div>
      </div>

      {/* 3D Parameter Sliders Panel (Top Right, drops below 3D Controls button) */}
      {showSettingsPanel && (
        <div className="absolute top-26 right-3 z-30 flex flex-col gap-2.5 bg-slate-900/95 backdrop-blur-xl border border-slate-700 p-4 rounded-2xl text-white shadow-2xl w-72 animate-in fade-in slide-in-from-top-2">
          <div className="text-xs font-bold text-slate-300 flex items-center justify-between pb-1.5 border-b border-slate-800">
            <span className="flex items-center gap-1.5"><Sun className="w-3.5 h-3.5 text-amber-400" /> Sunlight & Shadows</span>
            <span className="text-amber-400 font-mono font-bold">{timeOfDay}:00</span>
          </div>
          <input
            type="range"
            min={7}
            max={20}
            step={0.5}
            value={timeOfDay}
            onChange={(e) => setTimeOfDay(parseFloat(e.target.value))}
            className="w-full accent-amber-500 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
          />

          <div className="pt-2 border-t border-slate-800">
            <div className="text-xs font-bold text-slate-300 flex items-center justify-between mb-1">
              <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-blue-400" /> Building Height Scale</span>
              <span className="text-blue-400 font-mono font-bold">{buildingHeightScale.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2.5}
              step={0.1}
              value={buildingHeightScale}
              onChange={(e) => setBuildingHeightScale(parseFloat(e.target.value))}
              className="w-full accent-blue-500 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
            />
          </div>

          <div className="pt-2 border-t border-slate-800">
            <div className="text-xs font-bold text-slate-300 flex items-center justify-between mb-1">
              <span className="flex items-center gap-1.5"><Mountain className="w-3.5 h-3.5 text-green-400" /> DTM Terrain Relief</span>
              <span className="text-green-400 font-mono font-bold">{terrainExaggeration.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min={0.2}
              max={2.5}
              step={0.1}
              value={terrainExaggeration}
              onChange={(e) => setTerrainExaggeration(parseFloat(e.target.value))}
              className="w-full accent-green-500 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
            />
          </div>

          {/* 3D Layer Toggles */}
          <div className="pt-2 border-t border-slate-800 grid grid-cols-3 gap-1.5 text-[10px]">
            <button
              onClick={() => setShowLotLabels(!showLotLabels)}
              className={`py-1.5 rounded font-medium transition-colors ${showLotLabels ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}
            >
              Lot Labels
            </button>
            <button
              onClick={() => setShowContours(!showContours)}
              className={`py-1.5 rounded font-medium transition-colors ${showContours ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}
            >
              Contours
            </button>
            <button
              onClick={() => setShowTrees(!showTrees)}
              className={`py-1.5 rounded font-medium transition-colors ${showTrees ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}
            >
              Trees
            </button>
            <button
              onClick={() => setShowWater(!showWater)}
              className={`py-1.5 rounded font-medium transition-colors ${showWater ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400'}`}
            >
              Water
            </button>
            <button
              onClick={() => setWireframeMode(!wireframeMode)}
              className={`py-1.5 rounded font-medium transition-colors ${wireframeMode ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'}`}
            >
              Wireframe
            </button>
            <button
              onClick={() => setRealisticBuildings(!realisticBuildings)}
              className={`py-1.5 rounded font-medium transition-colors ${realisticBuildings ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}
            >
              Realistic 3D
            </button>
          </div>
        </div>
      )}

      {/* Selected Building Compact Cadastral & Architectural Inspection Card (Items 23 & 24) */}
      {selectedParcel && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          className="absolute bottom-12 left-4 z-40 flex flex-col gap-2 bg-slate-900/95 backdrop-blur-xl border border-blue-500/80 p-3 rounded-2xl shadow-2xl text-white max-w-sm w-80 animate-in fade-in slide-in-from-bottom-2"
        >
          {/* Header: Lot ID + Status + Close */}
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-ping" />
              <div>
                <span className="font-bold text-sm text-blue-300 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-blue-400" />
                  <span>{selectedBuilding?.id || selectedParcel.id}</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded font-mono font-bold">
                    Lot #{selectedParcel.surveyNumber}
                  </span>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${
                selectedParcel.status === 'verified'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : selectedParcel.status === 'requires_review'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : 'bg-red-500/20 text-red-300 border-red-500/30'
              }`}>
                {selectedParcel.status === 'requires_review' ? 'Review' : selectedParcel.status}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onSelectParcel?.(null);
                }}
                className="p-1 text-slate-400 hover:text-white rounded-lg text-xs hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close building inspection"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Core Essential Metrics (Compact View - Item 23) */}
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
            {/* Height + Provenance Badge (Item 24) */}
            <div className="flex flex-col bg-slate-800/70 p-1.5 rounded-lg border border-slate-700/60">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Height</span>
                {selectedBuilding?.heightProvenance === 'measured' || selectedParcel.heightProvenance === 'measured' ? (
                  <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" title="DSM/DTM LiDAR Measured">[Measured]</span>
                ) : selectedBuilding?.heightProvenance === 'inferred' || selectedParcel.heightProvenance === 'inferred' ? (
                  <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40" title="Inferred by Zoning Rules">[Inferred]</span>
                ) : (
                  <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40" title="Estimated from Shadow AI">[Estimated]</span>
                )}
              </div>
              <span className="font-mono font-bold text-amber-300 text-sm mt-0.5">
                {((selectedParcel.buildingHeight || 14) * buildingHeightScale).toFixed(1)} m
              </span>
            </div>

            {/* Footprint Area */}
            <div className="flex flex-col bg-slate-800/70 p-1.5 rounded-lg border border-slate-700/60">
              <span className="text-[11px] text-slate-400">Footprint</span>
              <span className="font-mono font-bold text-white text-sm mt-0.5">
                {selectedBuilding?.area || selectedParcel.aiArea} m²
              </span>
            </div>

            {/* Floors + Provenance Badge */}
            <div className="flex flex-col bg-slate-800/70 p-1.5 rounded-lg border border-slate-700/60">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Floors</span>
                {selectedBuilding?.floorsProvenance === 'measured' || selectedParcel.floorsProvenance === 'measured' ? (
                  <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" title="Measured">[Measured]</span>
                ) : (
                  <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40" title="Estimated">[Estimated]</span>
                )}
              </div>
              <span className="font-mono font-bold text-amber-300 text-sm mt-0.5">
                {selectedParcel.floors || 3} Floors
              </span>
            </div>

            {/* AI Confidence */}
            <div className="flex flex-col bg-slate-800/70 p-1.5 rounded-lg border border-slate-700/60">
              <span className="text-[11px] text-slate-400">Confidence</span>
              <span className="font-mono font-bold text-emerald-400 text-sm mt-0.5">
                {selectedParcel.confidence || 94.2}%
              </span>
            </div>
          </div>

          {/* Active Conflict Strip (if issue present) */}
          {(selectedParcel.isIssue || selectedParcel.conflictType || (selectedParcel.boundaryDisplacement && selectedParcel.boundaryDisplacement >= 0.15)) && (
            <div className="flex items-center justify-between bg-red-950/60 border border-red-500/50 px-2.5 py-1.5 rounded-lg text-xs text-red-200">
              <span className="flex items-center gap-1 font-semibold">
                <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                {selectedParcel.conflictType === 'building_encroachment' || selectedParcel.encroachmentDistance
                  ? `Encroachment: ${selectedParcel.encroachmentDistance || 1.8} m`
                  : selectedParcel.conflictType === 'overlap' || selectedParcel.overlapArea
                  ? `Overlap: ${selectedParcel.overlapArea || 14.8} m²`
                  : selectedParcel.conflictType === 'gap' || selectedParcel.gapDistance
                  ? `Gap: ${selectedParcel.gapDistance || 0.65} m`
                  : `Displacement: ${selectedParcel.boundaryDisplacement || 0.38} m`}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 bg-red-500/30 rounded text-red-300 font-mono font-bold">
                HIGH CONFLICT
              </span>
            </div>
          )}

          {/* Expand Toggle Button (Item 23) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsInspectorExpanded(!isInspectorExpanded);
            }}
            className="w-full py-1 px-2 text-[11px] font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded-lg flex items-center justify-between transition-colors cursor-pointer border border-slate-700/60"
          >
            <span>{isInspectorExpanded ? 'Hide Detailed Attributes' : 'Show Detailed Attributes'}</span>
            {isInspectorExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {/* Detailed Attributes (Expanded View - Item 23 & 24) */}
          {isInspectorExpanded && (
            <div className="flex flex-col gap-1.5 pt-1 border-t border-slate-800 text-xs animate-in fade-in duration-150">
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-300">
                <div className="flex items-center justify-between bg-slate-800/40 px-2 py-1 rounded">
                  <span className="text-slate-400">Type:</span>
                  <span className="font-semibold text-blue-300 capitalize">
                    {selectedBuilding?.type || selectedParcel.buildingType || 'Residential'}
                  </span>
                </div>
                <div className="flex items-center justify-between bg-slate-800/40 px-2 py-1 rounded">
                  <span className="text-slate-400">Elevation:</span>
                  <span className="font-mono text-slate-200">
                    {selectedParcel.elevation || 250} m ASL
                  </span>
                </div>
                <div className="flex items-center justify-between bg-slate-800/40 px-2 py-1 rounded col-span-2">
                  <div className="flex items-center gap-1 text-slate-400">
                    <span>Roof Style:</span>
                    {selectedBuilding?.roofProvenance === 'measured' ? (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">[Measured]</span>
                    ) : (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">[Inferred]</span>
                    )}
                  </div>
                  <span className="font-medium text-emerald-300 capitalize">
                    {selectedBuilding?.roofType ? selectedBuilding.roofType.replace('_', ' ') : 'Flat with Parapet'}
                  </span>
                </div>
                {selectedParcel.owner && (
                  <div className="flex items-center justify-between bg-slate-800/40 px-2 py-1 rounded col-span-2">
                    <span className="text-slate-400">Owner:</span>
                    <span className="font-medium text-slate-200 truncate max-w-[160px]">
                      {selectedParcel.owner}
                    </span>
                  </div>
                )}
              </div>

              {/* Quick Actions in Expanded View */}
              <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const target = targetOrbit.current;
                    target.distance = 110;
                    target.elevation = 0.32;
                    target.animating = true;
                  }}
                  className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                  title="Zoom in closer to examine 3D architectural facade"
                >
                  <Building2 className="w-3.5 h-3.5" /> Facade Close-Up
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const target = targetOrbit.current;
                    target.distance = 680;
                    target.elevation = 0.72;
                    target.animating = true;
                  }}
                  className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Reset to district overview"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Overview
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hover Tooltip */}
      {hoveredParcel && hoverPos && !selectedParcel && (
        <div
          className="absolute z-30 pointer-events-none bg-slate-900/95 backdrop-blur-md border border-blue-500/60 p-2.5 rounded-xl shadow-2xl text-white text-xs max-w-xs transition-all duration-75"
          style={{ left: hoverPos.x + 15, top: hoverPos.y - 15 }}
        >
          <div className="font-bold text-blue-400 text-sm mb-1 flex items-center justify-between">
            <span>{hoveredBuilding?.id || hoveredParcel.id}</span>
            <span className="text-[10px] px-1.5 py-0.2 bg-blue-500/20 text-blue-300 rounded font-mono">
              Lot #{hoveredParcel.surveyNumber}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-300">
            <div>Type: <strong className="text-white capitalize">{hoveredBuilding?.type || hoveredParcel.buildingType || 'Residential'}</strong></div>
            <div>Area: <strong className="text-white">{hoveredBuilding?.area || hoveredParcel.aiArea} m²</strong></div>
            <div>Height: <strong className="text-amber-300">{((hoveredParcel.buildingHeight || 14) * buildingHeightScale).toFixed(1)}m</strong></div>
            <div>Floors: <strong className="text-amber-300">{hoveredParcel.floors || 3}F</strong></div>
            <div>Elevation: <strong className="text-slate-300">{hoveredParcel.elevation || 250}m ASL</strong></div>
            <div>Status: <strong className="text-blue-300 uppercase text-[10px]">{hoveredParcel.status}</strong></div>
          </div>
          <div className="mt-1.5 pt-1 border-t border-slate-700 text-[10px] text-slate-400">
            Click to inspect and isolate 3D building
          </div>
        </div>
      )}

      {/* Bottom Status & Diagnostics Bar */}
      <div className="absolute bottom-3 left-3 right-3 z-20 flex items-center justify-between bg-slate-900/85 backdrop-blur-md border border-slate-700/80 px-4 py-2 rounded-xl text-white text-xs shadow-2xl flex-wrap gap-2">
        <div className="flex items-center gap-4 text-slate-300 font-mono text-[11px]">
          <span>RENDER: <strong className="text-emerald-400">WebGL 60 FPS PBR</strong></span>
          <span>MODE: <strong className={realisticBuildings ? 'text-teal-400' : 'text-amber-400'}>{realisticBuildings ? 'Realistic Procedural 3D' : 'Simplified Extrusion'}</strong></span>
          <span>BUILDINGS: <strong className="text-amber-300">{buildings.length} Architectural</strong></span>
          <span>PARCELS: <strong className="text-blue-300">{parcels.length} Cadastral</strong></span>
          <span>LOD: <strong className="text-indigo-400">LOD {activeLodLevel} ({activeLodLevel === 0 ? 'Full' : activeLodLevel === 1 ? 'Medium' : 'Massing'})</strong></span>
        </div>
        <div className="flex items-center gap-2 text-slate-400 text-[11px]">
          <span>Click: <strong>Inspect & Zoom</strong></span>
          <span>|</span>
          <span>Left Drag: <strong>Orbit</strong></span>
          <span>|</span>
          <span>Right Drag: <strong>Pan</strong></span>
          <span>|</span>
          <span>Scroll: <strong>Zoom</strong></span>
        </div>
      </div>
    </div>
  );
}
