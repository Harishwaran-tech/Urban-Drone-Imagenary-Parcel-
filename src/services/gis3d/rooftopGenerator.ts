import * as THREE from 'three';
import type { FootprintAnalysis } from './geometryAnalysis';
import type { ArchitecturalMaterials } from './materialSystem';
import type { SeededRandom } from './proceduralSeed';

export interface RooftopGenerationParams {
  analysis: FootprintAnalysis;
  roofBaseY: number;
  mats: ArchitecturalMaterials;
  isGhosted: boolean;
  wireframe: boolean;
  rng: SeededRandom;
  buildingType: string;
  lodLevel: number;
}

const TANK_CYL_GEO = new THREE.CylinderGeometry(1.2, 1.2, 2.2, 12);
const TANK_BASE_GEO = new THREE.BoxGeometry(2.8, 0.4, 2.8);
const SOLAR_PANEL_GEO = new THREE.BoxGeometry(6.5, 0.18, 4.0);
const HVAC_GEO = new THREE.BoxGeometry(2.0, 1.4, 1.4);

/**
 * Procedurally generates realistic rooftop elements (mumty, water tanks, solar PV, HVAC).
 */
export function generateRooftopDetails(params: RooftopGenerationParams): THREE.Group {
  const { analysis, roofBaseY, mats, isGhosted, wireframe, rng, buildingType, lodLevel } = params;
  const group = new THREE.Group();
  group.name = 'rooftop_appurtenances';

  if (lodLevel >= 2 || wireframe) return group;

  const w = analysis.width;
  const d = analysis.depth;
  const cx = analysis.centroid.x;
  const cz = analysis.centroid.y;

  const isCommercial = buildingType.toLowerCase().includes('commercial');
  const isIndustrial = buildingType.toLowerCase().includes('industrial');

  const wallMat = isGhosted ? mats.ghosted : mats.wallResidential;
  const slabMat = isGhosted ? mats.ghosted : mats.roofSlab;
  const tankMat = isGhosted ? mats.ghosted : rng.chance(0.75) ? mats.sintexTankBlue : mats.sintexTankBlack;
  const solarMat = isGhosted ? mats.ghosted : mats.solarPanel;
  const hvacMat = isGhosted ? mats.ghosted : mats.hvacUnit;

  // 1. Staircase Mumty / Lift Headroom (for buildings with width and depth >= 8m)
  if (w >= 8.0 && d >= 8.0) {
    const mumtyW = Math.min(6.5, w * 0.32);
    const mumtyD = Math.min(5.5, d * 0.32);
    const mumtyH = 3.2;

    const mumtyGeo = new THREE.BoxGeometry(mumtyW, mumtyH, mumtyD);
    const mumty = new THREE.Mesh(mumtyGeo, wallMat);
    const posX = cx - w * 0.18;
    const posZ = cz - d * 0.18;
    mumty.position.set(posX, roofBaseY + mumtyH / 2, posZ);
    mumty.castShadow = !isGhosted;
    mumty.receiveShadow = true;
    group.add(mumty);

    // Mumty Overhang Roof Slab
    const mRoofGeo = new THREE.BoxGeometry(mumtyW + 0.5, 0.22, mumtyD + 0.5);
    const mRoof = new THREE.Mesh(mRoofGeo, slabMat);
    mRoof.position.set(posX, roofBaseY + mumtyH + 0.11, posZ);
    group.add(mRoof);

    // Access Service Door
    if (lodLevel === 0) {
      const doorGeo = new THREE.BoxGeometry(1.2, 2.2, 0.1);
      const door = new THREE.Mesh(doorGeo, mats.doorWood);
      door.position.set(posX, roofBaseY + 1.1, posZ + mumtyD / 2 + 0.05);
      group.add(door);
    }
  }

  // 2. Overhead Polymer Water Tanks (Residential & Civic)
  if (!isIndustrial && rng.chance(0.85) && w >= 6 && d >= 6) {
    const tankX = cx + w * 0.22;
    const tankZ = cz + d * 0.2;

    // Concrete Elevated Platform
    const baseStand = new THREE.Mesh(TANK_BASE_GEO, slabMat);
    baseStand.position.set(tankX, roofBaseY + 0.2, tankZ);
    group.add(baseStand);

    // Primary Sintex Tank
    const tank1 = new THREE.Mesh(TANK_CYL_GEO, tankMat);
    tank1.position.set(tankX, roofBaseY + 1.5, tankZ);
    tank1.castShadow = !isGhosted;
    group.add(tank1);

    // Dual Tank on larger buildings
    if (w > 12 && rng.chance(0.6)) {
      const tank2 = new THREE.Mesh(TANK_CYL_GEO, tankMat);
      tank2.position.set(tankX, roofBaseY + 1.5, tankZ - 2.8);
      tank2.castShadow = !isGhosted;
      group.add(tank2);
    }
  }

  // 3. Solar PV Arrays (Eco/Modern Residential & Commercial)
  if ((isCommercial || rng.chance(0.45)) && w >= 10 && d >= 10) {
    const solarMesh = new THREE.Mesh(SOLAR_PANEL_GEO, solarMat);
    solarMesh.position.set(cx + w * 0.15, roofBaseY + 1.2, cz - d * 0.2);
    solarMesh.rotation.x = -0.35; // Tilted toward equator
    solarMesh.castShadow = !isGhosted;
    group.add(solarMesh);
  }

  // 4. Commercial HVAC Condensing Units
  if (isCommercial || (isIndustrial && rng.chance(0.7))) {
    const hvac = new THREE.Mesh(HVAC_GEO, hvacMat);
    hvac.position.set(cx - w * 0.25, roofBaseY + 0.7, cz + d * 0.25);
    hvac.castShadow = !isGhosted;
    group.add(hvac);

    if (w > 14) {
      const hvac2 = new THREE.Mesh(HVAC_GEO, hvacMat);
      hvac2.position.set(cx - w * 0.25, roofBaseY + 0.7, cz + d * 0.25 - 2.6);
      hvac2.castShadow = !isGhosted;
      group.add(hvac2);
    }
  }

  return group;
}
