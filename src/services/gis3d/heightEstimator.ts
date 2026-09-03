import type { Building } from '@/types';
import { SeededRandom } from './proceduralSeed';
import type { FootprintAnalysis } from './geometryAnalysis';

export interface HeightCalculationResult {
  totalHeight: number;
  floors: number;
  groundFloorHeight: number;
  upperFloorHeight: number;
  isHeightEstimated: boolean;
  isFloorsEstimated: boolean;
  floorElevations: number[]; // Relative Y offsets for each floor level
  roofElevation: number;
}

export const DEFAULT_FLOOR_HEIGHT = 3.2;
export const DEFAULT_GROUND_FLOOR_HEIGHT = 3.5;

/**
 * Calculates height, levels, and individual story elevations for a GIS building.
 * Prioritizes surveyed metadata, falling back to deterministic estimation when missing.
 */
export function estimateBuildingHeight(
  building: Building,
  analysis: FootprintAnalysis,
  rng: SeededRandom,
  heightScale = 1.0
): HeightCalculationResult {
  const rawType = (building.type || 'residential').toLowerCase();
  const isIndustrial = rawType.includes('industrial') || rawType.includes('warehouse') || rawType.includes('shed');
  const isCommercial = rawType.includes('commercial') || rawType.includes('office');

  let floors: number;
  let isFloorsEstimated = false;

  if (building.levels && building.levels > 0) {
    floors = building.levels;
  } else if (building.floors && building.floors > 0) {
    floors = building.floors;
  } else {
    isFloorsEstimated = true;
    // Estimate floors based on footprint area and building classification
    const area = analysis.area;
    if (isIndustrial) {
      floors = 1;
    } else if (isCommercial) {
      if (area > 400) floors = rng.rangeInt(4, 8);
      else if (area > 200) floors = rng.rangeInt(3, 5);
      else floors = rng.rangeInt(2, 4);
    } else {
      // Residential / Civic
      if (area > 350) floors = rng.rangeInt(3, 5);
      else if (area > 150) floors = rng.rangeInt(2, 3);
      else floors = rng.rangeInt(1, 2);
    }
  }

  // Ensure at least 1 floor
  floors = Math.max(1, Math.min(24, Math.round(floors)));

  let totalHeight: number;
  let isHeightEstimated = false;

  if (building.isHeightEstimated !== undefined) {
    isHeightEstimated = building.isHeightEstimated;
  }

  if (building.height && building.height > 0) {
    totalHeight = building.height;
  } else {
    isHeightEstimated = true;
    const baseFloorH = isIndustrial ? 5.5 : isCommercial ? 3.4 : 3.2;
    totalHeight = floors * baseFloorH + (isIndustrial ? 1.0 : 0.4);
  }

  // Apply user height scale multiplier
  const scaledHeight = Math.max(3.0, totalHeight * heightScale);

  // Compute realistic floor splits
  const groundFloorH = floors === 1
    ? scaledHeight
    : Math.min(scaledHeight * 0.4, (DEFAULT_GROUND_FLOOR_HEIGHT / DEFAULT_FLOOR_HEIGHT) * (scaledHeight / floors));
  
  const remainingHeight = scaledHeight - groundFloorH;
  const upperFloorH = floors > 1 ? remainingHeight / (floors - 1) : 0;

  const floorElevations: number[] = [0];
  let curElev = 0;
  for (let f = 1; f < floors; f++) {
    curElev += (f === 1 ? groundFloorH : upperFloorH);
    floorElevations.push(curElev);
  }

  return {
    totalHeight: scaledHeight,
    floors,
    groundFloorHeight: groundFloorH,
    upperFloorHeight: upperFloorH,
    isHeightEstimated,
    isFloorsEstimated,
    floorElevations,
    roofElevation: scaledHeight,
  };
}
