import * as THREE from 'three';
import type { FootprintAnalysis, WallSegment } from './geometryAnalysis';
import type { ArchitecturalMaterials } from './materialSystem';
import type { SeededRandom } from './proceduralSeed';

export type RoofStyle = 'flat_parapet' | 'gable' | 'hip' | 'shed' | 'flat';

export interface RoofGenerationParams {
  analysis: FootprintAnalysis;
  roofBaseY: number;
  roofStyle: RoofStyle;
  mats: ArchitecturalMaterials;
  isGhosted: boolean;
  wireframe: boolean;
  rng: SeededRandom;
  buildingType: string;
}

/**
 * Builds a Flat Roof with continuous Parapet Wall following the exact polygon footprint.
 */
function buildFlatParapetRoof(params: RoofGenerationParams): THREE.Group {
  const { analysis, roofBaseY, mats, isGhosted, wireframe } = params;
  const group = new THREE.Group();
  group.name = 'roof_flat_parapet';

  const pts = analysis.normalizedPoints;
  const n = pts.length;
  const cx = analysis.centroid.x;
  const cz = analysis.centroid.y;

  const slabMat = isGhosted ? mats.ghosted : mats.roofSlab;
  const wallMat = isGhosted ? mats.ghosted : mats.wallResidential;

  // 1. Flat Roof Slab matching polygon shape
  const shape = new THREE.Shape();
  shape.moveTo(pts[0].x - cx, -(pts[0].y - cz));
  for (let i = 1; i < n; i++) {
    shape.lineTo(pts[i].x - cx, -(pts[i].y - cz));
  }
  shape.closePath();

  const slabThickness = 0.28;
  const slabGeo = new THREE.ExtrudeGeometry(shape, {
    depth: slabThickness,
    bevelEnabled: false,
  });
  slabGeo.rotateX(-Math.PI / 2);
  slabGeo.translate(cx, roofBaseY, cz);

  const slabMesh = new THREE.Mesh(slabGeo, slabMat);
  slabMesh.receiveShadow = true;
  group.add(slabMesh);

  // 2. Parapet Walls along each polygon segment
  const parapetHeight = 1.05;
  const parapetThickness = 0.32;

  analysis.segments.forEach((seg) => {
    // Parapet wall box along segment
    const boxGeo = new THREE.BoxGeometry(seg.length, parapetHeight, parapetThickness);
    const boxMesh = new THREE.Mesh(boxGeo, wallMat);

    // Position at segment midpoint, offset slightly outward
    boxMesh.position.set(
      seg.midpoint.x,
      roofBaseY + slabThickness + parapetHeight / 2,
      seg.midpoint.y
    );
    boxMesh.rotation.y = -seg.angleRad;
    boxMesh.castShadow = !isGhosted;
    boxMesh.receiveShadow = true;
    group.add(boxMesh);

    // Coping / Parapet cap top slab
    if (!wireframe) {
      const capGeo = new THREE.BoxGeometry(seg.length + 0.1, 0.08, parapetThickness + 0.08);
      const capMesh = new THREE.Mesh(capGeo, slabMat);
      capMesh.position.set(
        seg.midpoint.x,
        roofBaseY + slabThickness + parapetHeight + 0.04,
        seg.midpoint.y
      );
      capMesh.rotation.y = -seg.angleRad;
      group.add(capMesh);
    }
  });

  return group;
}

/**
 * Builds a Gable Roof along the primary orientation axis.
 */
function buildGableRoof(params: RoofGenerationParams): THREE.Group {
  const { analysis, roofBaseY, mats, isGhosted } = params;
  const group = new THREE.Group();
  group.name = 'roof_gable';

  const w = analysis.width;
  const d = analysis.depth;
  const cx = analysis.centroid.x;
  const cz = analysis.centroid.y;

  const roofMat = isGhosted ? mats.ghosted : mats.roofTiles;
  const wallMat = isGhosted ? mats.ghosted : mats.wallResidential;

  // Determine ridge direction (along longer dimension)
  const isAlongX = w >= d;
  const ridgeLength = (isAlongX ? w : d) + 0.8; // Eaves overhang
  const span = (isAlongX ? d : w) + 0.8;
  const pitchHeight = Math.min(4.5, Math.max(1.8, span * 0.35));

  // 1. Triangular Gable Walls
  const halfSpan = span / 2;
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-halfSpan, 0);
  gableShape.lineTo(0, pitchHeight);
  gableShape.lineTo(halfSpan, 0);
  gableShape.closePath();

  const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: 0.3, bevelEnabled: false });

  // Front Gable
  const gable1 = new THREE.Mesh(gableGeo, wallMat);
  if (isAlongX) {
    gable1.rotation.y = Math.PI / 2;
    gable1.position.set(cx - w / 2, roofBaseY, cz);
  } else {
    gable1.position.set(cx, roofBaseY, cz - d / 2);
  }
  group.add(gable1);

  // Rear Gable
  const gable2 = new THREE.Mesh(gableGeo, wallMat);
  if (isAlongX) {
    gable2.rotation.y = Math.PI / 2;
    gable2.position.set(cx + w / 2, roofBaseY, cz);
  } else {
    gable2.position.set(cx, roofBaseY, cz + d / 2);
  }
  group.add(gable2);

  // 2. Pitched Roof Slabs (Left and Right slope)
  const slopeLength = Math.sqrt(halfSpan * halfSpan + pitchHeight * pitchHeight) + 0.4;
  const pitchAngle = Math.atan2(pitchHeight, halfSpan);

  const planeGeo = new THREE.BoxGeometry(isAlongX ? ridgeLength : slopeLength, 0.18, isAlongX ? slopeLength : ridgeLength);

  // Slope 1
  const slope1 = new THREE.Mesh(planeGeo, roofMat);
  slope1.castShadow = !isGhosted;
  slope1.receiveShadow = true;
  if (isAlongX) {
    slope1.rotation.x = pitchAngle;
    slope1.position.set(cx, roofBaseY + pitchHeight / 2, cz - halfSpan / 2 + 0.1);
  } else {
    slope1.rotation.z = -pitchAngle;
    slope1.position.set(cx - halfSpan / 2 + 0.1, roofBaseY + pitchHeight / 2, cz);
  }
  group.add(slope1);

  // Slope 2
  const slope2 = new THREE.Mesh(planeGeo, roofMat);
  slope2.castShadow = !isGhosted;
  slope2.receiveShadow = true;
  if (isAlongX) {
    slope2.rotation.x = -pitchAngle;
    slope2.position.set(cx, roofBaseY + pitchHeight / 2, cz + halfSpan / 2 - 0.1);
  } else {
    slope2.rotation.z = pitchAngle;
    slope2.position.set(cx + halfSpan / 2 - 0.1, roofBaseY + pitchHeight / 2, cz);
  }
  group.add(slope2);

  // Ridge Cap Beam
  const ridgeGeo = new THREE.CylinderGeometry(0.18, 0.18, ridgeLength, 6);
  const ridgeMesh = new THREE.Mesh(ridgeGeo, roofMat);
  if (isAlongX) {
    ridgeMesh.rotation.z = Math.PI / 2;
    ridgeMesh.position.set(cx, roofBaseY + pitchHeight + 0.08, cz);
  } else {
    ridgeMesh.rotation.x = Math.PI / 2;
    ridgeMesh.position.set(cx, roofBaseY + pitchHeight + 0.08, cz);
  }
  group.add(ridgeMesh);

  return group;
}

/**
 * Builds a Hip Roof (sloped on all 4 sides).
 */
function buildHipRoof(params: RoofGenerationParams): THREE.Group {
  const { analysis, roofBaseY, mats, isGhosted } = params;
  const group = new THREE.Group();
  group.name = 'roof_hip';

  const w = analysis.width + 0.6;
  const d = analysis.depth + 0.6;
  const cx = analysis.centroid.x;
  const cz = analysis.centroid.y;
  const roofMat = isGhosted ? mats.ghosted : mats.roofTiles;

  const minDim = Math.min(w, d);
  const pitchHeight = Math.min(4.0, Math.max(1.6, minDim * 0.32));
  const ridgeLen = Math.max(0.8, Math.abs(w - d));

  // Construct Hip Geometry via BufferGeometry vertices
  const halfW = w / 2;
  const halfD = d / 2;
  const isAlongX = w >= d;

  const pRidge1 = isAlongX
    ? new THREE.Vector3(-ridgeLen / 2, pitchHeight, 0)
    : new THREE.Vector3(0, pitchHeight, -ridgeLen / 2);
  const pRidge2 = isAlongX
    ? new THREE.Vector3(ridgeLen / 2, pitchHeight, 0)
    : new THREE.Vector3(0, pitchHeight, ridgeLen / 2);

  const pC1 = new THREE.Vector3(-halfW, 0, -halfD);
  const pC2 = new THREE.Vector3(halfW, 0, -halfD);
  const pC3 = new THREE.Vector3(halfW, 0, halfD);
  const pC4 = new THREE.Vector3(-halfW, 0, halfD);

  const vertices: number[] = [];
  const uvs: number[] = [];

  const addTri = (v1: THREE.Vector3, v2: THREE.Vector3, v3: THREE.Vector3) => {
    vertices.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, v3.x, v3.y, v3.z);
    uvs.push(v1.x / 4, v1.z / 4, v2.x / 4, v2.z / 4, v3.x / 4, v3.z / 4);
  };

  const addQuad = (v1: THREE.Vector3, v2: THREE.Vector3, v3: THREE.Vector3, v4: THREE.Vector3) => {
    addTri(v1, v2, v3);
    addTri(v1, v3, v4);
  };

  if (isAlongX) {
    addQuad(pC1, pC2, pRidge2, pRidge1); // North Slope
    addTri(pC2, pC3, pRidge2);           // East Slope
    addQuad(pC3, pC4, pRidge1, pRidge2); // South Slope
    addTri(pC4, pC1, pRidge1);           // West Slope
  } else {
    addTri(pC1, pC2, pRidge1);           // North Slope
    addQuad(pC2, pC3, pRidge2, pRidge1); // East Slope
    addTri(pC3, pC4, pRidge2);           // South Slope
    addQuad(pC4, pC1, pRidge1, pRidge2); // West Slope
  }

  const hipGeo = new THREE.BufferGeometry();
  hipGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  hipGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  hipGeo.computeVertexNormals();

  const hipMesh = new THREE.Mesh(hipGeo, roofMat);
  hipMesh.position.set(cx, roofBaseY, cz);
  hipMesh.castShadow = !isGhosted;
  hipMesh.receiveShadow = true;
  group.add(hipMesh);

  return group;
}

/**
 * Builds a Shed / Sloped Mono-Pitch Roof (for industrial, agricultural, or modern minimalist homes).
 */
function buildShedRoof(params: RoofGenerationParams): THREE.Group {
  const { analysis, roofBaseY, mats, isGhosted, buildingType } = params;
  const group = new THREE.Group();
  group.name = 'roof_shed';

  const w = analysis.width + 0.8;
  const d = analysis.depth + 0.8;
  const cx = analysis.centroid.x;
  const cz = analysis.centroid.y;

  const isIndustrial = buildingType.toLowerCase().includes('industrial');
  const roofMat = isGhosted ? mats.ghosted : isIndustrial ? mats.roofMetal : mats.roofTiles;
  const wallMat = isGhosted ? mats.ghosted : mats.wallIndustrial;

  const pitchHeight = Math.min(3.2, Math.max(1.2, d * 0.18));
  const slopeAngle = Math.atan2(pitchHeight, d);
  const slopeLen = Math.sqrt(d * d + pitchHeight * pitchHeight);

  // Sloped Roof Slab
  const slabGeo = new THREE.BoxGeometry(w, 0.22, slopeLen);
  const slabMesh = new THREE.Mesh(slabGeo, roofMat);
  slabMesh.position.set(cx, roofBaseY + pitchHeight / 2, cz);
  slabMesh.rotation.x = -slopeAngle;
  slabMesh.castShadow = !isGhosted;
  slabMesh.receiveShadow = true;
  group.add(slabMesh);

  // Triangular side infill walls
  const triShape = new THREE.Shape();
  triShape.moveTo(-d / 2, 0);
  triShape.lineTo(d / 2, pitchHeight);
  triShape.lineTo(-d / 2, pitchHeight);
  triShape.closePath();

  const triGeo = new THREE.ExtrudeGeometry(triShape, { depth: 0.25, bevelEnabled: false });

  const sideL = new THREE.Mesh(triGeo, wallMat);
  sideL.rotation.y = -Math.PI / 2;
  sideL.position.set(cx - w / 2 + 0.4, roofBaseY, cz);
  group.add(sideL);

  const sideR = new THREE.Mesh(triGeo, wallMat);
  sideR.rotation.y = -Math.PI / 2;
  sideR.position.set(cx + w / 2 - 0.4, roofBaseY, cz);
  group.add(sideR);

  return group;
}

/**
 * Builds a Clean Flat Terrace Roof Slab with overhang.
 */
function buildFlatTerraceRoof(params: RoofGenerationParams): THREE.Group {
  const { analysis, roofBaseY, mats, isGhosted } = params;
  const group = new THREE.Group();
  group.name = 'roof_flat';

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

  const slabThickness = 0.35;
  const slabGeo = new THREE.ExtrudeGeometry(shape, {
    depth: slabThickness,
    bevelEnabled: true,
    bevelThickness: 0.15,
    bevelSize: 0.25,
    bevelSegments: 1,
  });
  slabGeo.rotateX(-Math.PI / 2);
  slabGeo.translate(cx, roofBaseY, cz);

  const slabMesh = new THREE.Mesh(slabGeo, isGhosted ? mats.ghosted : mats.roofSlab);
  slabMesh.receiveShadow = true;
  slabMesh.castShadow = !isGhosted;
  group.add(slabMesh);

  return group;
}

/**
 * Master procedural roof generator router.
 */
export function generateProceduralRoof(params: RoofGenerationParams): THREE.Group {
  switch (params.roofStyle) {
    case 'flat_parapet':
      return buildFlatParapetRoof(params);
    case 'gable':
      // Fallback to flat_parapet if irregular polygon
      return params.analysis.isRectangular ? buildGableRoof(params) : buildFlatParapetRoof(params);
    case 'hip':
      return params.analysis.isRectangular ? buildHipRoof(params) : buildFlatParapetRoof(params);
    case 'shed':
      return params.analysis.isRectangular ? buildShedRoof(params) : buildFlatParapetRoof(params);
    case 'flat':
    default:
      return buildFlatTerraceRoof(params);
  }
}
