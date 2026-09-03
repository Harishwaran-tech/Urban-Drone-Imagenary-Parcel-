import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import type { Parcel, Building, Road, GNSSPoint, LayerState } from '@/types';
import {
  Maximize2, RotateCcw, Sun, Eye, EyeOff, Layers, Compass,
  Box, Mountain, HelpCircle, Check, MapPin, ZoomIn, ZoomOut,
  Sparkles, Sliders, Play, Pause, Ruler, Building2, ShieldCheck,
  ChevronRight, Info, AlertCircle, Home, CheckCircle2, ShieldAlert
} from 'lucide-react';
import {
  buildProceduralBuilding,
  buildSimplifiedExtrusionBuilding,
} from '@/services/gis3d/proceduralBuildingEngine';
import { getArchitecturalMaterials } from '@/services/gis3d/materialSystem';
import type { RoofStyle } from '@/services/gis3d/roofGenerator';

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
}: ThreeDMapViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 3D Engine State
  const [realisticBuildings, setRealisticBuildings] = useState<boolean>(true);
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
  const [showTrees, setShowTrees] = useState<boolean>(true);
  const [isolateMode, setIsolateMode] = useState<boolean>(false);
  const [hoveredParcel, setHoveredParcel] = useState<Parcel | null>(null);
  const [hoveredBuilding, setHoveredBuilding] = useState<Building | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [cameraPreset, setCameraPreset] = useState<'oblique' | 'iso' | 'topdown' | 'birdseye'>('oblique');
  const [showSettingsPanel, setShowSettingsPanel] = useState<boolean>(false);
  const [activeLodLevel, setActiveLodLevel] = useState<number>(0);

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
  const labelsGroupRef = useRef<THREE.Group | null>(null);
  const terrainMeshRef = useRef<THREE.Mesh | null>(null);
  const contoursGroupRef = useRef<THREE.Group | null>(null);
  const waterMeshRef = useRef<THREE.Mesh | null>(null);
  const dimensionsGroupRef = useRef<THREE.Group | null>(null);
  const orthoTextureRef = useRef<THREE.Texture | null>(null);

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

  // Camera Presets
  const applyCameraPreset = useCallback((preset: 'oblique' | 'iso' | 'topdown' | 'birdseye') => {
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
    }
  }, []);

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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    rendererRef.current = renderer;

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

    // 5. Scene Groups
    const buildingsGroup = new THREE.Group();
    const parcelsGroup = new THREE.Group();
    const labelsGroup = new THREE.Group();
    const contoursGroup = new THREE.Group();
    const dimensionsGroup = new THREE.Group();
    scene.add(buildingsGroup);
    scene.add(parcelsGroup);
    scene.add(labelsGroup);
    scene.add(contoursGroup);
    scene.add(dimensionsGroup);

    buildingsGroupRef.current = buildingsGroup;
    parcelsGroupRef.current = parcelsGroup;
    labelsGroupRef.current = labelsGroup;
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

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const elev = getElevationAt(x, z);
      pos.setY(i, elev);

      let r = 0.92, g = 0.94, b = 0.96;
      if (z > 580) {
        r = 0.85; g = 0.95; b = 0.87;
      } else if (z < 350) {
        r = 0.75; g = 0.88; b = 0.65;
      } else if (Math.abs(z - 480) < 32) {
        r = 0.86; g = 0.90; b = 0.94;
      }

      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    terrainGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: !orthoTextureRef.current,
      map: orthoTextureRef.current || null,
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
  }, [getElevationAt, showContours, showWater, terrainExaggeration, wireframeMode, selectedParcelId]);

  // Build / Rebuild Procedural 3D Buildings & Cadastral Overlays
  useEffect(() => {
    if (!buildingsGroupRef.current || !parcelsGroupRef.current || !labelsGroupRef.current || !dimensionsGroupRef.current) return;

    const bGroup = buildingsGroupRef.current;
    const pGroup = parcelsGroupRef.current;
    const lGroup = labelsGroupRef.current;
    const dGroup = dimensionsGroupRef.current;

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

    raycastTargetsRef.current = [];

    if (!showBuildings) return;

    const hasSelection = !!selectedParcelId;
    const isNight = timeOfDay > 18.5;
    const mats = getArchitecturalMaterials(isNight, wireframeMode);

    // 1. Draped Cadastral Parcel Boundaries
    parcels.forEach((parcel) => {
      const isSelected = parcel.id === selectedParcelId;
      const pts = parcel.aiGeometry;
      if (pts.length < 3) return;

      const linePoints: THREE.Vector3[] = [];
      let avgX = 0, avgZ = 0;

      for (let i = 0; i <= pts.length; i++) {
        const pt = pts[i % pts.length];
        const elev = getElevationAt(pt.x, pt.y) + (isSelected ? 1.4 : 0.7);
        linePoints.push(new THREE.Vector3(pt.x, elev, pt.y));
        if (i < pts.length) {
          avgX += pt.x;
          avgZ += pt.y;
        }
      }
      avgX /= pts.length;
      avgZ /= pts.length;

      const lineColor = isSelected
        ? 0x2563eb
        : parcel.conflictType
        ? 0xef4444
        : parcel.status === 'verified'
        ? 0x16a34a
        : 0x64748b;

      const lineMat = new THREE.LineBasicMaterial({
        color: lineColor,
        linewidth: isSelected ? 3.5 : 1.5,
        transparent: hasSelection && !isSelected && isolateMode,
        opacity: hasSelection && !isSelected && isolateMode ? 0.35 : 1.0,
      });

      const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
      const parcelLine = new THREE.Line(lineGeo, lineMat);
      parcelLine.userData = { parcelId: parcel.id };
      pGroup.add(parcelLine);

      // Survey Lot Number Labels
      if (showLotLabels && (!hasSelection || isSelected || !isolateMode)) {
        const lotNum = parcel.surveyNumber || parcel.id.replace('P-00', '');
        const labelTex = createLabelTexture(
          lotNum,
          isSelected ? '#1d4ed8' : '#334155',
          isSelected ? 'rgba(239, 246, 255, 0.95)' : 'rgba(255, 255, 255, 0.88)'
        );
        if (labelTex) {
          const spriteMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true });
          const sprite = new THREE.Sprite(spriteMat);
          sprite.position.set(avgX, getElevationAt(avgX, avgZ) + (isSelected ? 8 : 5), avgZ);
          sprite.scale.set(isSelected ? 32 : 24, isSelected ? 11 : 9, 1);
          sprite.userData = { parcelId: parcel.id };
          lGroup.add(sprite);
        }
      }
    });

    // 2. Build Procedural 3D Buildings preserving exact GIS Footprints
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

      if (realisticBuildings) {
        // High-realism procedural building
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
        // Simplified GIS block extrusion
        buildingObj = buildSimplifiedExtrusionBuilding(
          building,
          groundElev,
          buildingHeightScale,
          isSelected,
          isNight
        );
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
        const dimMat = new THREE.LineBasicMaterial({ color: 0x2563eb, linewidth: 3 });
        dGroup.add(new THREE.Line(dimGeo, dimMat));

        // Floating Height & Floor Tag Sprite
        const heightLabel = `H: ${calculatedHeight.toFixed(1)}m (${calculatedFloors}F) ${isEstimated ? '[Est]' : '[Surv]'}`;
        const heightTex = createLabelTexture(heightLabel, '#1e40af', '#eff6ff');
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

    // 3. Populate 3D Landscape Foliage Trees
    if (showTrees && !wireframeMode) {
      parcels.forEach((parcel, pIdx) => {
        if (parcel.aiGeometry.length < 3) return;
        const pt = parcel.aiGeometry[pIdx % parcel.aiGeometry.length];
        const elev = getElevationAt(pt.x, pt.y);
        const tree = create3DTree(
          pt.x + 4,
          elev,
          pt.y + 4,
          0.95 + (pIdx % 3) * 0.15,
          mats.treeWood,
          mats.treeFoliage
        );
        pGroup.add(tree);
      });
    }
  }, [
    buildings,
    parcels,
    selectedParcelId,
    buildingHeightScale,
    getElevationAt,
    showBuildings,
    showLotLabels,
    showTrees,
    wireframeMode,
    isolateMode,
    timeOfDay,
    realisticBuildings,
    roofStyleFilter,
    activeLodLevel,
  ]);

  // Pointer Handlers for Smooth Orbit & Throttled Raycasting
  const handlePointerDown = (e: React.PointerEvent) => {
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
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const o = orbitState.current;
    o.distance = Math.max(120, Math.min(1800, o.distance + e.deltaY * 0.7));
    updateCameraPosition();
  };

  const handleClick = (e: React.MouseEvent) => {
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

      {/* Top Navigation & Camera Controls Toolbar */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-none gap-2 flex-wrap">
        {/* Left: Brand & Camera Presets */}
        <div className="flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 p-1.5 rounded-xl text-white shadow-xl pointer-events-auto flex-wrap">
          <span className="text-xs font-bold text-blue-400 flex items-center gap-1.5 px-2 border-r border-slate-700">
            <Box className="w-4 h-4 text-blue-400" /> 3D Digital Twin
          </span>

          {/* Realistic 3D Buildings ON/OFF Toggle */}
          <button
            onClick={() => setRealisticBuildings(!realisticBuildings)}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
              realisticBuildings
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md ring-1 ring-emerald-400'
                : 'bg-amber-700/80 text-white hover:bg-amber-600'
            }`}
            title="Toggle between Enhanced Realistic Procedural Architecture and Basic GIS Polygon Extrusion"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Realistic 3D: {realisticBuildings ? 'ON' : 'OFF'}</span>
          </button>

          {/* Camera Presets */}
          <div className="flex items-center gap-1 bg-slate-800/90 p-0.5 rounded-lg">
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
              Isometric
            </button>
            <button
              onClick={() => applyCameraPreset('topdown')}
              className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-all ${
                cameraPreset === 'topdown' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
              }`}
              title="2D Top Down"
            >
              Top Down
            </button>
            <button
              onClick={() => applyCameraPreset('birdseye')}
              className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-all ${
                cameraPreset === 'birdseye' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
              }`}
              title="Bird's Eye"
            >
              Bird's Eye
            </button>
          </div>

          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`p-1.5 rounded-lg border transition-colors ${
              autoRotate ? 'bg-amber-600 border-amber-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
            }`}
            title="Toggle Auto-Orbit"
          >
            {autoRotate ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>

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

      {/* 3D Parameter Sliders Panel (Top Right) */}
      {showSettingsPanel && (
        <div className="absolute top-14 right-3 z-20 flex flex-col gap-2.5 bg-slate-900/95 backdrop-blur-xl border border-slate-700 p-4 rounded-2xl text-white shadow-2xl w-72 animate-in fade-in slide-in-from-top-2">
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

      {/* Selected Building Rich Cadastral & Architectural Inspection Badge (Bottom Left) */}
      {selectedParcel && (
        <div className="absolute bottom-14 left-3 z-30 flex flex-col gap-2 bg-slate-900/95 backdrop-blur-xl border border-blue-500/80 p-3.5 rounded-2xl shadow-2xl text-white max-w-md animate-in fade-in slide-in-from-bottom-2">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-ping" />
              <div>
                <span className="font-bold text-sm text-blue-300 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-blue-400" />
                  <span>{selectedBuilding?.id || selectedParcel.id}</span>
                  <span className="text-[10px] px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded font-mono font-bold">
                    Lot #{selectedParcel.surveyNumber}
                  </span>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-slate-700">
                {selectedParcel.status}
              </span>
              <button
                onClick={() => onSelectParcel?.(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg text-xs ml-1"
                title="Deselect"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Architectural & Survey Metadata Grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-slate-300 py-1">
            <div className="flex items-center justify-between bg-slate-800/60 px-2 py-1 rounded-lg">
              <span className="text-slate-400 text-[11px]">Height:</span>
              <span className="font-mono font-bold text-amber-300">
                {((selectedParcel.buildingHeight || 14) * buildingHeightScale).toFixed(1)} m{' '}
                <span className="text-[9px] font-normal text-slate-400">
                  {selectedBuilding?.isHeightEstimated ? '(Est.)' : '(Surveyed)'}
                </span>
              </span>
            </div>

            <div className="flex items-center justify-between bg-slate-800/60 px-2 py-1 rounded-lg">
              <span className="text-slate-400 text-[11px]">Floors:</span>
              <span className="font-mono font-bold text-amber-300">
                {selectedParcel.floors || 3} Floors <span className="text-[9px] font-normal text-slate-400">(~3.2m/F)</span>
              </span>
            </div>

            <div className="flex items-center justify-between bg-slate-800/60 px-2 py-1 rounded-lg">
              <span className="text-slate-400 text-[11px]">Type:</span>
              <span className="font-semibold text-blue-300 capitalize">
                {selectedBuilding?.type || selectedParcel.buildingType || 'Residential'}
              </span>
            </div>

            <div className="flex items-center justify-between bg-slate-800/60 px-2 py-1 rounded-lg">
              <span className="text-slate-400 text-[11px]">Footprint:</span>
              <span className="font-mono font-bold text-white">
                {selectedBuilding?.area || selectedParcel.aiArea} m²
              </span>
            </div>

            <div className="flex items-center justify-between bg-slate-800/60 px-2 py-1 rounded-lg">
              <span className="text-slate-400 text-[11px]">Roof Style:</span>
              <span className="font-medium text-emerald-300 capitalize">
                {selectedBuilding?.roofType ? selectedBuilding.roofType.replace('_', ' ') : 'Flat with Parapet'}
              </span>
            </div>

            <div className="flex items-center justify-between bg-slate-800/60 px-2 py-1 rounded-lg">
              <span className="text-slate-400 text-[11px]">Elevation:</span>
              <span className="font-mono font-semibold text-slate-200">
                {selectedParcel.elevation || 250} m ASL
              </span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
            <button
              onClick={() => {
                const target = targetOrbit.current;
                target.distance = 110;
                target.elevation = 0.32;
                target.animating = true;
              }}
              className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
              title="Zoom in closer to examine 3D architectural facade"
            >
              <Building2 className="w-3.5 h-3.5" /> Facade Close-Up
            </button>
            <button
              onClick={() => {
                const target = targetOrbit.current;
                target.distance = 680;
                target.elevation = 0.72;
                target.animating = true;
              }}
              className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
              title="Reset to district overview"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Overview
            </button>
          </div>
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
