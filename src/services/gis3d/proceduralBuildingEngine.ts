import * as THREE from 'three';
import type { Building } from '@/types';
import { SeededRandom } from './proceduralSeed';
import { analyzeFootprint, type FootprintAnalysis } from './geometryAnalysis';
import { estimateBuildingHeight, type HeightCalculationResult } from './heightEstimator';
import {
  getArchitecturalMaterials,
  applyPlanarFacadeUVs,
  type ArchitecturalMaterials,
  RESIDENTIAL_WALL_COLORS,
} from './materialSystem';
import { generateProceduralRoof, type RoofStyle } from './roofGenerator';
import {
  generatePlinthFoundation,
  generateFloorSlabs,
  generateFacadeDetails,
} from './facadeGenerator';
import { generateRooftopDetails } from './rooftopGenerator';

export interface ProceduralBuildingOptions {
  building: Building;
  groundElevation: number;
  heightScale?: number;
  isSelected?: boolean;
  isGhosted?: boolean;
  wireframe?: boolean;
  isNight?: boolean;
  lodLevel?: number; // 0 = High (Near), 1 = Medium, 2 = Low (Far)
  forcedRoofStyle?: RoofStyle | 'auto';
}

export interface BuildingEngineResult {
  group: THREE.Group;
  analysis: FootprintAnalysis;
  heightResult: HeightCalculationResult;
  assignedRoofStyle: RoofStyle;
}

/**
 * Builds a realistic procedural 3D architectural building preserving exact GIS footprint.
 */
export function buildProceduralBuilding(options: ProceduralBuildingOptions): BuildingEngineResult {
  const {
    building,
    groundElevation,
    heightScale = 1.0,
    isSelected = false,
    isGhosted = false,
    wireframe = false,
    isNight = false,
    lodLevel = 0,
    forcedRoofStyle = 'auto',
  } = options;

  // 1. Analyze GIS footprint polygon
  const pts = building.geometry.map((p) => ({ x: p.x, y: p.y }));
  const analysis = analyzeFootprint(pts);

  // 2. Deterministic PRNG seeded by building ID
  const rng = new SeededRandom(building.id || 'BLD-DEFAULT');

  // 3. Estimate height, stories, and story elevations
  const heightResult = estimateBuildingHeight(building, analysis, rng, heightScale);

  // 4. Shared PBR Materials
  const mats = getArchitecturalMaterials(isNight, wireframe);

  const rawType = (building.type || 'residential').toLowerCase();
  const isCommercial = rawType.includes('commercial') || rawType.includes('office');
  const isIndustrial = rawType.includes('industrial') || rawType.includes('warehouse');
  const isCivic = rawType.includes('civic') || rawType.includes('government') || rawType.includes('public');

  // Facade Wall Material
  let primaryWallMat: THREE.Material;
  if (isGhosted) {
    primaryWallMat = mats.ghosted;
  } else if (isCommercial) {
    primaryWallMat = mats.wallCommercial;
  } else if (isIndustrial) {
    primaryWallMat = mats.wallIndustrial;
  } else if (isCivic) {
    primaryWallMat = mats.wallCivic;
  } else {
    primaryWallMat = mats.wallResidential;
  }

  // Determine Roof Style
  let roofStyle: RoofStyle;
  if (forcedRoofStyle && forcedRoofStyle !== 'auto') {
    roofStyle = forcedRoofStyle;
  } else if (building.roofType) {
    roofStyle = building.roofType;
  } else if (isIndustrial) {
    roofStyle = 'shed';
  } else if (isCommercial) {
    roofStyle = 'flat';
  } else if (analysis.isRectangular && rng.chance(0.35)) {
    roofStyle = rng.chance(0.5) ? 'gable' : 'hip';
  } else {
    roofStyle = 'flat_parapet'; // Standard RCC flat roof with parapet for Indian / modern urban GIS
  }

  const bGroup = new THREE.Group();
  bGroup.name = `building_${building.id}`;
  bGroup.userData = {
    buildingId: building.id,
    parcelId: building.parcelId,
    area: analysis.area,
    height: heightResult.totalHeight,
    floors: heightResult.floors,
    isHeightEstimated: heightResult.isHeightEstimated,
    roofStyle,
    type: building.type,
    elevation: groundElevation,
  };

  const cx = analysis.centroid.x;
  const cz = analysis.centroid.y;

  // 5. Plinth / Foundation Base (Ground Elevation anchoring)
  const plinth = generatePlinthFoundation(analysis, groundElevation, mats, isGhosted);
  plinth.userData = { parcelId: building.parcelId, buildingId: building.id };
  bGroup.add(plinth);

  const coreBaseY = groundElevation + 0.55;
  const totalCoreHeight = heightResult.totalHeight;

  // 6. Main Building Core Extrusion matching exact GIS polygon vertices
  const shape = new THREE.Shape();
  const nPts = analysis.normalizedPoints;
  shape.moveTo(nPts[0].x - cx, -(nPts[0].y - cz));
  for (let i = 1; i < nPts.length; i++) {
    shape.lineTo(nPts[i].x - cx, -(nPts[i].y - cz));
  }
  shape.closePath();

  const coreGeo = new THREE.ExtrudeGeometry(shape, {
    depth: totalCoreHeight,
    bevelEnabled: !isCommercial && !isIndustrial,
    bevelThickness: 0.15,
    bevelSize: 0.15,
    bevelSegments: 1,
  });
  coreGeo.rotateX(-Math.PI / 2);
  coreGeo.translate(cx, coreBaseY, cz);

  // Apply planar UVs for crisp multi-floor window textures
  applyPlanarFacadeUVs(coreGeo, heightResult.groundFloorHeight, 8.0);

  const coreMesh = new THREE.Mesh(coreGeo, [primaryWallMat, mats.roofSlab]);
  coreMesh.castShadow = !isGhosted;
  coreMesh.receiveShadow = true;
  coreMesh.userData = { parcelId: building.parcelId, buildingId: building.id };
  bGroup.add(coreMesh);

  // 7. Floor separation horizontal slabs
  if (!wireframe && lodLevel <= 1) {
    const floorSlabs = generateFloorSlabs(analysis, coreBaseY, heightResult, mats, isGhosted);
    bGroup.add(floorSlabs);
  }

  // 8. 3D Windows, Doors, Porticos, and Balconies
  if (!wireframe && lodLevel <= 1) {
    const facadeDetails = generateFacadeDetails(
      {
        analysis,
        heightResult,
        groundElevation: coreBaseY,
        mats,
        isGhosted,
        wireframe,
        buildingType: building.type,
        rng,
        lodLevel,
      },
      coreBaseY
    );
    bGroup.add(facadeDetails);
  }

  // 9. Procedural Roof
  const roofBaseY = coreBaseY + totalCoreHeight;
  const roofGroup = generateProceduralRoof({
    analysis,
    roofBaseY,
    roofStyle,
    mats,
    isGhosted,
    wireframe,
    rng,
    buildingType: building.type,
  });
  bGroup.add(roofGroup);

  // 10. Rooftop clutter (water tanks, solar panels, HVAC) omitted to maintain survey-grade clean heights

  // 11. Silhouette Outline Edges
  const edgeGeo = new THREE.EdgesGeometry(coreGeo, 30);
  const edgeMat = new THREE.LineBasicMaterial({
    color: isSelected ? 0x2563eb : isGhosted ? 0x64748b : 0x0f172a,
    linewidth: isSelected ? 3.5 : 1,
    transparent: isGhosted,
    opacity: isGhosted ? 0.25 : 0.75,
  });
  const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
  bGroup.add(edgeLines);

  // 12. Selected Glow Ring on Ground
  if (isSelected) {
    const maxDim = Math.max(analysis.width, analysis.depth);
    const ringGeo = new THREE.RingGeometry(maxDim * 0.65, maxDim * 0.74, 36);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.88,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(cx, groundElevation + 0.35, cz);
    bGroup.add(ring);
  }

  return {
    group: bGroup,
    analysis,
    heightResult,
    assignedRoofStyle: roofStyle,
  };
}

/**
 * Builds a simplified GIS block extrusion (for "Realistic Mode: OFF" or fast debug).
 */
export function buildSimplifiedExtrusionBuilding(
  building: Building,
  groundElevation: number,
  heightScale = 1.0,
  isSelected = false,
  isNight = false
): THREE.Group {
  const pts = building.geometry.map((p) => ({ x: p.x, y: p.y }));
  const analysis = analyzeFootprint(pts);
  const cx = analysis.centroid.x;
  const cz = analysis.centroid.y;

  const rawHeight = building.height || 12.0;
  const height = Math.max(4.0, rawHeight * heightScale);

  const shape = new THREE.Shape();
  const nPts = analysis.normalizedPoints;
  shape.moveTo(nPts[0].x - cx, -(nPts[0].y - cz));
  for (let i = 1; i < nPts.length; i++) {
    shape.lineTo(nPts[i].x - cx, -(nPts[i].y - cz));
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(cx, groundElevation, cz);

  const mat = new THREE.MeshStandardMaterial({
    color: isSelected ? 0x2563eb : 0xf59e0b,
    roughness: 0.6,
    metalness: 0.1,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { parcelId: building.parcelId, buildingId: building.id };

  const group = new THREE.Group();
  group.name = `simple_building_${building.id}`;
  group.userData = {
    buildingId: building.id,
    parcelId: building.parcelId,
    area: analysis.area,
    height,
    floors: building.floors || Math.max(1, Math.round(height / 3.2)),
    isHeightEstimated: building.isHeightEstimated ?? true,
    type: building.type,
    elevation: groundElevation,
  };
  group.add(mesh);

  // Edges
  const edgeGeo = new THREE.EdgesGeometry(geo, 25);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x0f172a, linewidth: 1.5 });
  group.add(new THREE.LineSegments(edgeGeo, edgeMat));

  return group;
}
