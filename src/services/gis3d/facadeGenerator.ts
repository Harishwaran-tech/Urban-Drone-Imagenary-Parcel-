import * as THREE from 'three';
import type { FootprintAnalysis, WallSegment } from './geometryAnalysis';
import type { ArchitecturalMaterials } from './materialSystem';
import type { HeightCalculationResult } from './heightEstimator';
import type { SeededRandom } from './proceduralSeed';

export interface FacadeGenerationParams {
  analysis: FootprintAnalysis;
  heightResult: HeightCalculationResult;
  groundElevation: number;
  mats: ArchitecturalMaterials;
  isGhosted: boolean;
  wireframe: boolean;
  buildingType: string;
  rng: SeededRandom;
  lodLevel: number; // 0 = Full detail, 1 = Medium detail, 2 = Low massing
}

export function generatePlinthFoundation(
  analysis: FootprintAnalysis,
  groundElevation: number,
  mats: ArchitecturalMaterials,
  isGhosted: boolean
): THREE.Mesh {
  const pts = analysis.normalizedPoints;
  const n = pts.length;
  const cx = analysis.centroid.x;
  const cz = analysis.centroid.y;

  const shape = new THREE.Shape();
  shape.moveTo(pts[0].x - cx, -(pts[0].y - cz));
  for (let i = 1; i < n; i++) {
    shape.lineTo(pts[i].x - cx, -(pts[i].y - cz));
  }
  shape.closePath();

  const plinthHeight = 0.55;
  const plinthGeo = new THREE.ExtrudeGeometry(shape, {
    depth: plinthHeight,
    bevelEnabled: true,
    bevelThickness: 0.1,
    bevelSize: 0.2,
    bevelSegments: 1,
  });
  plinthGeo.rotateX(-Math.PI / 2);
  plinthGeo.translate(cx, groundElevation, cz);

  const plinthMesh = new THREE.Mesh(plinthGeo, isGhosted ? mats.ghosted : mats.plinth);
  plinthMesh.receiveShadow = true;
  return plinthMesh;
}

/**
 * Builds floor cantilever separation slabs between stories.
 */
export function generateFloorSlabs(
  analysis: FootprintAnalysis,
  baseY: number,
  heightResult: HeightCalculationResult,
  mats: ArchitecturalMaterials,
  isGhosted: boolean
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'floor_slabs';
  if (heightResult.floors <= 1) return group;

  const pts = analysis.normalizedPoints;
  const n = pts.length;
  const cx = analysis.centroid.x;
  const cz = analysis.centroid.y;

  const shape = new THREE.Shape();
  shape.moveTo(pts[0].x - cx, -(pts[0].y - cz));
  for (let i = 1; i < n; i++) {
    shape.lineTo(pts[i].x - cx, -(pts[i].y - cz));
  }
  shape.closePath();

  const slabMat = isGhosted ? mats.ghosted : mats.roofSlab;

  for (let f = 1; f < heightResult.floors; f++) {
    const slabY = baseY + heightResult.floorElevations[f];
    const slabGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.22,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.18,
      bevelSegments: 1,
    });
    slabGeo.rotateX(-Math.PI / 2);
    slabGeo.translate(cx, slabY - 0.11, cz);

    const slabMesh = new THREE.Mesh(slabGeo, slabMat);
    group.add(slabMesh);
  }

  return group;
}

// Reusable single geometries for 3D windows & doors
const WIN_FRAME_GEO = new THREE.BoxGeometry(1.6, 1.4, 0.18);
const WIN_GLASS_GEO = new THREE.BoxGeometry(1.44, 1.24, 0.04);
const WIN_SILL_GEO = new THREE.BoxGeometry(1.84, 0.12, 0.32);
const WIN_CHAJJA_GEO = new THREE.BoxGeometry(1.92, 0.14, 0.45);

const DOOR_FRAME_GEO = new THREE.BoxGeometry(2.4, 2.8, 0.22);
const DOOR_LEAF_GEO = new THREE.BoxGeometry(2.16, 2.56, 0.08);

/**
 * Procedurally generates 3D exterior window units, entrance doors, canopies, and balconies.
 */
export function generateFacadeDetails(params: FacadeGenerationParams, baseY: number): THREE.Group {
  const { analysis, heightResult, mats, isGhosted, wireframe, buildingType, rng, lodLevel } = params;
  const group = new THREE.Group();
  group.name = 'facade_details';

  // In LOD2 (far distance), omit micro details
  if (lodLevel >= 2 || wireframe) return group;

  const isCommercial = buildingType.toLowerCase().includes('commercial');
  const isIndustrial = buildingType.toLowerCase().includes('industrial');

  const frameMat = isGhosted ? mats.ghosted : mats.aluminumFrame;
  const glassMat = isGhosted ? mats.ghosted : mats.glass;
  const slabMat = isGhosted ? mats.ghosted : mats.roofSlab;
  const doorMat = isGhosted ? mats.ghosted : mats.doorWood;

  // Track if we placed the main ground entrance
  let mainEntrancePlaced = false;

  analysis.segments.forEach((seg) => {
    if (!seg.isSuitableForWindows && !seg.isEntranceCandidate) return;

    const segLen = seg.length;
    const cornerMargin = 1.0;
    const usableLen = segLen - cornerMargin * 2;
    if (usableLen <= 0.8) return;

    const bayCount = Math.max(1, Math.min(6, Math.floor(usableLen / 2.5)));
    const baySpacing = usableLen / (bayCount + 1);

    for (let f = 0; f < heightResult.floors; f++) {
      const floorY = baseY + heightResult.floorElevations[f];
      const floorH = f === 0 ? heightResult.groundFloorHeight : heightResult.upperFloorHeight;

      for (let b = 1; b <= bayCount; b++) {
        const offsetAlongWall = -segLen / 2 + cornerMargin + b * baySpacing;

        // Position in World Coordinates
        const posX = seg.midpoint.x + seg.dirX * offsetAlongWall;
        const posZ = seg.midpoint.y + seg.dirZ * offsetAlongWall;

        const isGroundFloor = f === 0;

        // Ground Floor Entrance Door Placement
        if (isGroundFloor && seg.isEntranceCandidate && !mainEntrancePlaced && (b === Math.ceil(bayCount / 2))) {
          mainEntrancePlaced = true;

          // Door Frame
          const doorFrame = new THREE.Mesh(DOOR_FRAME_GEO, frameMat);
          doorFrame.position.set(posX, floorY + 1.4, posZ);
          doorFrame.rotation.y = -seg.angleRad;
          group.add(doorFrame);

          // Door Leaf Panel
          const doorLeaf = new THREE.Mesh(DOOR_LEAF_GEO, isCommercial ? glassMat : doorMat);
          doorLeaf.position.set(posX, floorY + 1.35, posZ);
          doorLeaf.rotation.y = -seg.angleRad;
          group.add(doorLeaf);

          // Ground entrance porch canopy
          if (lodLevel === 0) {
            const canopyW = 3.6;
            const canopyD = 1.8;
            const canopyH = 0.22;
            const canopyGeo = new THREE.BoxGeometry(canopyW, canopyH, canopyD);
            const canopy = new THREE.Mesh(canopyGeo, slabMat);
            // Project forward along outward normal
            canopy.position.set(
              posX + seg.normalX * (canopyD / 2),
              floorY + 2.9,
              posZ + seg.normalZ * (canopyD / 2)
            );
            canopy.rotation.y = -seg.angleRad;
            group.add(canopy);

            // Entrance Step
            const stepGeo = new THREE.BoxGeometry(3.2, 0.18, 1.2);
            const step = new THREE.Mesh(stepGeo, slabMat);
            step.position.set(
              posX + seg.normalX * 0.6,
              floorY + 0.09,
              posZ + seg.normalZ * 0.6
            );
            step.rotation.y = -seg.angleRad;
            group.add(step);
          }
          continue;
        }

        // Standard Window Assembly
        if (!isIndustrial) {
          const winCenterY = floorY + floorH * 0.52;

          // Window Frame
          const winFrame = new THREE.Mesh(WIN_FRAME_GEO, frameMat);
          winFrame.position.set(posX, winCenterY, posZ);
          winFrame.rotation.y = -seg.angleRad;
          group.add(winFrame);

          // Reflective Glass Pane
          const winGlass = new THREE.Mesh(WIN_GLASS_GEO, glassMat);
          winGlass.position.set(posX, winCenterY, posZ);
          winGlass.rotation.y = -seg.angleRad;
          group.add(winGlass);

          if (lodLevel === 0) {
            // Concrete Sill below window
            const winSill = new THREE.Mesh(WIN_SILL_GEO, slabMat);
            winSill.position.set(
              posX + seg.normalX * 0.12,
              winCenterY - 0.72,
              posZ + seg.normalZ * 0.12
            );
            winSill.rotation.y = -seg.angleRad;
            group.add(winSill);

            // Concrete Sunshade Chajja above window
            const chajja = new THREE.Mesh(WIN_CHAJJA_GEO, slabMat);
            chajja.position.set(
              posX + seg.normalX * 0.18,
              winCenterY + 0.78,
              posZ + seg.normalZ * 0.18
            );
            chajja.rotation.y = -seg.angleRad;
            group.add(chajja);
          }
        }
      }

      // Upper Floor Balconies (Residential, on selected front facades)
      if (lodLevel === 0 && !isCommercial && !isIndustrial && f >= 1 && f % 2 === 1 && seg.length >= 6.0 && rng.chance(0.65)) {
        const balW = Math.min(5.5, segLen * 0.45);
        const balD = 1.4;
        const balFloorGeo = new THREE.BoxGeometry(balW, 0.22, balD);
        const balFloor = new THREE.Mesh(balFloorGeo, slabMat);
        balFloor.position.set(
          seg.midpoint.x + seg.normalX * (balD / 2),
          floorY,
          seg.midpoint.y + seg.normalZ * (balD / 2)
        );
        balFloor.rotation.y = -seg.angleRad;
        group.add(balFloor);

        // Glass balustrade railing
        const railGeo = new THREE.BoxGeometry(balW, 0.95, 0.06);
        const rail = new THREE.Mesh(railGeo, glassMat);
        rail.position.set(
          seg.midpoint.x + seg.normalX * balD,
          floorY + 0.58,
          seg.midpoint.y + seg.normalZ * balD
        );
        rail.rotation.y = -seg.angleRad;
        group.add(rail);
      }
    }
  });

  return group;
}
