/**
 * GIS Building Footprint Geometry Analysis.
 * Analyzes arbitrary polygon shapes (regular or irregular), extracting edge lengths,
 * outward normals, corners, facade segments, and placement slots for doors and windows.
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface WallSegment {
  index: number;
  p1: Point2D;
  p2: Point2D;
  midpoint: Point2D;
  length: number;
  dirX: number;
  dirZ: number;
  normalX: number; // Outward-facing normal
  normalZ: number;
  angleRad: number; // Angle of wall in world XZ
  isSuitableForWindows: boolean;
  maxWindowCount: number;
  isEntranceCandidate: boolean;
}

export interface FootprintAnalysis {
  rawPoints: Point2D[];
  normalizedPoints: Point2D[]; // Guaranteed Counter-Clockwise (CCW)
  centroid: Point2D;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  width: number;
  depth: number;
  area: number;
  perimeter: number;
  segments: WallSegment[];
  isRectangular: boolean;
  aspectRatio: number;
  primaryAxisAngle: number;
}

/**
 * Calculates signed polygon area. Positive indicates CCW winding in standard cartesian.
 */
export function calculateSignedArea(pts: Point2D[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return area / 2;
}

/**
 * Ensures points are ordered Counter-Clockwise (CCW).
 */
export function ensureCCW(pts: Point2D[]): Point2D[] {
  const signedArea = calculateSignedArea(pts);
  if (signedArea < 0) {
    return [...pts].reverse();
  }
  return [...pts];
}

/**
 * Comprehensive geometric analysis of building polygon footprint.
 */
export function analyzeFootprint(points: Point2D[]): FootprintAnalysis {
  if (points.length < 3) {
    throw new Error('Building footprint polygon must contain at least 3 vertices.');
  }

  const normalizedPoints = ensureCCW(points);
  const n = normalizedPoints.length;

  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  let sumX = 0, sumZ = 0;

  normalizedPoints.forEach((p) => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.y);
    maxZ = Math.max(maxZ, p.y);
    sumX += p.x;
    sumZ += p.y;
  });

  const centroid: Point2D = { x: sumX / n, y: sumZ / n };
  const width = Math.max(0.1, maxX - minX);
  const depth = Math.max(0.1, maxZ - minZ);
  const area = Math.abs(calculateSignedArea(normalizedPoints));

  let perimeter = 0;
  const rawSegments: WallSegment[] = [];

  let longestSegmentIndex = 0;
  let longestLength = 0;

  for (let i = 0; i < n; i++) {
    const p1 = normalizedPoints[i];
    const p2 = normalizedPoints[(i + 1) % n];

    const dx = p2.x - p1.x;
    const dz = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dz * dz);
    perimeter += len;

    const dirX = len > 0.0001 ? dx / len : 1;
    const dirZ = len > 0.0001 ? dz / len : 0;

    // For CCW polygon, outward normal is (dirZ, -dirX)
    const normalX = dirZ;
    const normalZ = -dirX;

    const midpoint: Point2D = {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2,
    };

    const angleRad = Math.atan2(dz, dx);

    // Wall is suitable for windows if length >= 3.2m
    const isSuitableForWindows = len >= 3.2;
    // Estimate max window bays based on 2.4m spacing with 0.8m margin from corners
    const usableLength = Math.max(0, len - 1.6);
    const maxWindowCount = Math.max(0, Math.floor(usableLength / 2.2));

    if (len > longestLength) {
      longestLength = len;
      longestSegmentIndex = i;
    }

    rawSegments.push({
      index: i,
      p1,
      p2,
      midpoint,
      length: len,
      dirX,
      dirZ,
      normalX,
      normalZ,
      angleRad,
      isSuitableForWindows,
      maxWindowCount,
      isEntranceCandidate: false,
    });
  }

  // Mark the primary entrance candidate (longest segment or south-facing longest segment)
  let bestEntranceIdx = longestSegmentIndex;
  let maxEntranceScore = -Infinity;

  rawSegments.forEach((seg, idx) => {
    // Score based on length and facing direction (prefer outward normals with positive Z or positive length)
    const score = seg.length + seg.normalZ * 4.0;
    if (score > maxEntranceScore) {
      maxEntranceScore = score;
      bestEntranceIdx = idx;
    }
  });

  if (rawSegments[bestEntranceIdx]) {
    rawSegments[bestEntranceIdx].isEntranceCandidate = true;
  }

  // Check if roughly rectangular (4 vertices with near 90 degree angles)
  const isRectangular = n === 4 && (Math.abs(area - width * depth) / (width * depth) < 0.25);
  const aspectRatio = Math.max(width, depth) / Math.min(width, depth);

  // Primary axis angle from longest segment
  const primaryAxisAngle = rawSegments[longestSegmentIndex]?.angleRad || 0;

  return {
    rawPoints: points,
    normalizedPoints,
    centroid,
    minX,
    maxX,
    minZ,
    maxZ,
    width,
    depth,
    area,
    perimeter,
    segments: rawSegments,
    isRectangular,
    aspectRatio,
    primaryAxisAngle,
  };
}
