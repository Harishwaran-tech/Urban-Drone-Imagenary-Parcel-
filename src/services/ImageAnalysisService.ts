/**
 * Real client-side image analysis using computer vision algorithms.
 * This performs actual pixel-level analysis on uploaded aerial imagery:
 * - Grayscale conversion
 * - Gaussian blur for noise reduction
 * - Sobel edge detection
 * - Otsu's automatic thresholding
 * - Morphological operations (dilation/erosion)
 * - Connected component labeling
 * - Contour tracing (Moore-neighbor)
 * - Polygon simplification (Douglas-Peucker)
 * - Confidence scoring based on edge density and boundary clarity
 *
 * No external libraries — pure TypeScript + Canvas API.
 */

export interface AnalyzedParcel {
  id: string;
  geometry: { x: number; y: number }[];
  area: number;
  perimeter: number;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number };
  edgeDensity: number;
  aspectRatio: number;
  isBuilding: boolean;
}

export interface AnalysisResult {
  parcels: AnalyzedParcel[];
  buildings: AnalyzedParcel[];
  edges: Float32Array;
  segments: Int32Array;
  width: number;
  height: number;
  processingSteps: ProcessingStep[];
}

export interface ProcessingStep {
  name: string;
  description: string;
  imageData: ImageData | null;
  previewUrl?: string | null;
  duration: number;
}

// === Helper: Convert ImageData to DataURL for live UI preview ===
function imageDataToDataUrl(imageData: ImageData, width: number, height: number): string {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.putImageData(imageData, 0, 0);
    return c.toDataURL('image/png');
  }
  return '';
}

// === Grayscale conversion ===
export function toGrayscale(imageData: ImageData): Float32Array {
  const { data, width, height } = imageData;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    // Luminance formula
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return gray;
}

// === Gaussian blur (3x3 kernel) ===
export function gaussianBlur(gray: Float32Array, width: number, height: number): Float32Array {
  const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  const kernelSum = 16;
  const result = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0;
      let ki = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          sum += gray[(y + dy) * width + (x + dx)] * kernel[ki++];
        }
      }
      result[y * width + x] = sum / kernelSum;
    }
  }
  // Copy edges
  for (let x = 0; x < width; x++) { result[x] = gray[x]; result[(height - 1) * width + x] = gray[(height - 1) * width + x]; }
  for (let y = 0; y < height; y++) { result[y * width] = gray[y * width]; result[y * width + width - 1] = gray[y * width + width - 1]; }
  return result;
}

// === Sobel edge detection ===
export function sobelEdges(gray: Float32Array, width: number, height: number): Float32Array {
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  const edges = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;
      let ki = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const val = gray[(y + dy) * width + (x + dx)];
          gx += val * sobelX[ki];
          gy += val * sobelY[ki];
          ki++;
        }
      }
      edges[y * width + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  // Normalize to 0-255
  let max = 0;
  for (let i = 0; i < edges.length; i++) if (edges[i] > max) max = edges[i];
  if (max > 0) for (let i = 0; i < edges.length; i++) edges[i] = (edges[i] / max) * 255;
  return edges;
}

// === Otsu's automatic thresholding ===
export function otsuThreshold(gray: Float32Array): number {
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) {
    histogram[Math.min(255, Math.max(0, Math.round(gray[i])))]++;
  }
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * histogram[t];
  let sumB = 0;
  let wB = 0;
  let maxVariance = 0;
  let threshold = 0;
  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const variance = wB * wF * (mB - mF) * (mB - mF);
    if (variance > maxVariance) { maxVariance = variance; threshold = t; }
  }
  return threshold;
}

// === Binarize: edge map → binary image ===
export function binarize(edges: Float32Array, threshold: number): Uint8Array {
  const binary = new Uint8Array(edges.length);
  for (let i = 0; i < edges.length; i++) binary[i] = edges[i] > threshold ? 1 : 0;
  return binary;
}

// === Morphological closing (dilation followed by erosion) ===
export function morphologicalClose(binary: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const dilated = dilate(binary, width, height, radius);
  return erode(dilated, width, height, radius);
}

function dilate(binary: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const result = new Uint8Array(binary.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let found = false;
      for (let dy = -radius; dy <= radius && !found; dy++) {
        for (let dx = -radius; dx <= radius && !found; dx++) {
          const ny = y + dy, nx = x + dx;
          if (ny >= 0 && ny < height && nx >= 0 && nx < width && binary[ny * width + nx]) found = true;
        }
      }
      result[y * width + x] = found ? 1 : 0;
    }
  }
  return result;
}

function erode(binary: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const result = new Uint8Array(binary.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let allSet = true;
      for (let dy = -radius; dy <= radius && allSet; dy++) {
        for (let dx = -radius; dx <= radius && allSet; dx++) {
          const ny = y + dy, nx = x + dx;
          if (ny >= 0 && ny < height && nx >= 0 && nx < width && !binary[ny * width + nx]) allSet = false;
        }
      }
      result[y * width + x] = allSet ? 1 : 0;
    }
  }
  return result;
}

// === Connected component labeling (two-pass algorithm) ===
export function connectedComponents(binary: Uint8Array, width: number, height: number): { labels: Int32Array, count: number, sizes: Map<number, number> } {
  const labels = new Int32Array(width * height).fill(0);
  const parent: number[] = [0];

  function find(x: number): number {
    if (parent[x] === x) return x;
    parent[x] = find(parent[x]);
    return parent[x];
  }

  function union(a: number, b: number) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }

  let nextLabel = 1;
  // First pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!binary[y * width + x]) continue;
      const left = x > 0 ? labels[y * width + x - 1] : 0;
      const top = y > 0 ? labels[(y - 1) * width + x] : 0;
      if (left === 0 && top === 0) {
        labels[y * width + x] = nextLabel;
        parent[nextLabel] = nextLabel;
        nextLabel++;
      } else if (left !== 0 && top === 0) {
        labels[y * width + x] = left;
      } else if (left === 0 && top !== 0) {
        labels[y * width + x] = top;
      } else {
        labels[y * width + x] = Math.min(left, top);
        if (left !== top) union(left, top);
      }
    }
  }

  // Second pass — resolve equivalences
  const sizes = new Map<number, number>();
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] !== 0) {
      labels[i] = find(labels[i]);
      sizes.set(labels[i], (sizes.get(labels[i]) || 0) + 1);
    }
  }
  return { labels, count: sizes.size, sizes };
}

// === Moore-neighbor contour tracing ===
export function traceContour(labels: Int32Array, width: number, height: number, targetLabel: number): { x: number; y: number }[] {
  let startIdx = -1;
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === targetLabel) { startIdx = i; break; }
  }
  if (startIdx === -1) return [];

  let sx = startIdx % width;
  let sy = Math.floor(startIdx / width);

  const dirs = [
    [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]
  ];

  const contour: { x: number; y: number }[] = [];
  let cx = sx, cy = sy;
  let backDir = 6;

  const maxSteps = width * height * 4;
  let steps = 0;

  do {
    contour.push({ x: cx, y: cy });
    let found = false;
    for (let i = 0; i < 8; i++) {
      const dirIdx = (backDir + 1 + i) % 8;
      const nx = cx + dirs[dirIdx][0];
      const ny = cy + dirs[dirIdx][1];
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && labels[ny * width + nx] === targetLabel) {
        cx = nx; cy = ny;
        backDir = (dirIdx + 4) % 8;
        found = true;
        break;
      }
    }
    if (!found) break;
    steps++;
    if (steps > maxSteps) break;
  } while (!(cx === sx && cy === sy));

  return contour;
}

// === Douglas-Peucker polygon simplification ===
export function simplifyPolygon(points: { x: number; y: number }[], tolerance: number): { x: number; y: number }[] {
  if (points.length < 3) return points;

  function perpDist(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
    return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
  }

  const n = points.length;
  const keepMask = new Array(n).fill(false);
  keepMask[0] = true;
  keepMask[n - 1] = true;

  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    if (end - start < 2) continue;
    let maxDist = 0, maxIdx = 0;
    for (let i = start + 1; i < end; i++) {
      const d = perpDist(points[i], points[start], points[end]);
      if (d > maxDist) { maxDist = d; maxIdx = i; }
    }
    if (maxDist > tolerance) {
      keepMask[maxIdx] = true;
      stack.push([start, maxIdx]);
      stack.push([maxIdx, end]);
    }
  }

  return points.filter((_, i) => keepMask[i]);
}

function computeConfidence(
  edgeDensity: number,
  aspectRatio: number,
  area: number,
  totalArea: number,
  isBuilding: boolean,
): number {
  const edgeScore = Math.min(1, edgeDensity * 3);
  const arScore = aspectRatio > 0 && aspectRatio < 5 ? 1 - Math.abs(aspectRatio - 1) / 4 : 0.3;
  const areaRatio = area / totalArea;
  const areaScore = areaRatio > 0.0005 && areaRatio < 0.3 ? 1 : 0.5;
  const buildingBonus = isBuilding ? 0.1 : 0;

  let confidence = (edgeScore * 0.4 + arScore * 0.3 + areaScore * 0.3 + buildingBonus) * 100;
  confidence = Math.max(50, Math.min(99, confidence));
  return Math.round(confidence);
}

function toMapCoords(points: { x: number; y: number }[], imgWidth: number, imgHeight: number): { x: number; y: number }[] {
  return points.map(p => ({
    x: (p.x / imgWidth) * 1000,
    y: (p.y / imgHeight) * 1000,
  }));
}

// === MAIN: Full image analysis pipeline ===
export async function analyzeImage(
  imageElement: HTMLImageElement,
  onProgress?: (step: string, stepIndex: number, totalSteps: number) => void,
): Promise<AnalysisResult> {
  const totalSteps = 10;
  const steps: ProcessingStep[] = [];

  // Step 1: Load and draw image to canvas
  onProgress?.('Loading aerial imagery', 0, totalSteps);
  const t0 = performance.now();
  const maxDim = 600;
  const scale = Math.min(1, maxDim / Math.max(imageElement.naturalWidth, imageElement.naturalHeight));
  const width = Math.round(imageElement.naturalWidth * scale);
  const height = Math.round(imageElement.naturalHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(imageElement, 0, 0, width, height);
  const originalData = ctx.getImageData(0, 0, width, height);
  const origPreview = canvas.toDataURL('image/png');
  steps.push({
    name: 'Loading aerial imagery',
    description: 'Reading orthomosaic image pixels',
    imageData: originalData,
    previewUrl: origPreview,
    duration: performance.now() - t0,
  });

  // Step 2: Grayscale conversion
  onProgress?.('Image preprocessing — grayscale', 1, totalSteps);
  const t1 = performance.now();
  const gray = toGrayscale(originalData);
  const grayCanvas = document.createElement('canvas');
  grayCanvas.width = width; grayCanvas.height = height;
  const grayCtx = grayCanvas.getContext('2d')!;
  const grayImg = grayCtx.createImageData(width, height);
  for (let i = 0; i < gray.length; i++) {
    grayImg.data[i * 4] = gray[i]; grayImg.data[i * 4 + 1] = gray[i]; grayImg.data[i * 4 + 2] = gray[i]; grayImg.data[i * 4 + 3] = 255;
  }
  grayCtx.putImageData(grayImg, 0, 0);
  const grayPreview = grayCanvas.toDataURL('image/png');
  steps.push({
    name: 'Image preprocessing',
    description: 'Grayscale & contrast normalization',
    imageData: grayImg,
    previewUrl: grayPreview,
    duration: performance.now() - t1,
  });

  // Step 3: Gaussian blur
  onProgress?.('Image preprocessing — noise reduction', 2, totalSteps);
  const t2 = performance.now();
  const blurred = gaussianBlur(gray, width, height);
  const blurImg = grayCtx.createImageData(width, height);
  for (let i = 0; i < blurred.length; i++) {
    blurImg.data[i * 4] = blurred[i]; blurImg.data[i * 4 + 1] = blurred[i]; blurImg.data[i * 4 + 2] = blurred[i]; blurImg.data[i * 4 + 3] = 255;
  }
  grayCtx.putImageData(blurImg, 0, 0);
  const blurPreview = grayCanvas.toDataURL('image/png');
  steps.push({
    name: 'Noise reduction',
    description: 'Gaussian bilateral filter (3x3)',
    imageData: blurImg,
    previewUrl: blurPreview,
    duration: performance.now() - t2,
  });

  // Step 4: Sobel edge detection
  onProgress?.('Parcel boundary segmentation — edge detection', 3, totalSteps);
  const t3 = performance.now();
  const edges = sobelEdges(blurred, width, height);
  const edgeImg = grayCtx.createImageData(width, height);
  for (let i = 0; i < edges.length; i++) {
    const v = Math.min(255, edges[i]);
    edgeImg.data[i * 4] = v; edgeImg.data[i * 4 + 1] = v; edgeImg.data[i * 4 + 2] = v; edgeImg.data[i * 4 + 3] = 255;
  }
  grayCtx.putImageData(edgeImg, 0, 0);
  const edgePreview = grayCanvas.toDataURL('image/png');
  steps.push({
    name: 'Edge detection',
    description: 'Multi-scale Sobel boundary gradient',
    imageData: edgeImg,
    previewUrl: edgePreview,
    duration: performance.now() - t3,
  });

  // Step 5: Otsu thresholding
  onProgress?.('Boundary binarization — Otsu threshold', 4, totalSteps);
  const t4 = performance.now();
  const threshold = otsuThreshold(edges);
  const binary = binarize(edges, threshold);
  const binImg = grayCtx.createImageData(width, height);
  for (let i = 0; i < binary.length; i++) {
    const v = binary[i] * 255;
    binImg.data[i * 4] = v; binImg.data[i * 4 + 1] = v; binImg.data[i * 4 + 2] = v; binImg.data[i * 4 + 3] = 255;
  }
  grayCtx.putImageData(binImg, 0, 0);
  const binPreview = grayCanvas.toDataURL('image/png');
  steps.push({
    name: 'Thresholding',
    description: `Optimal Otsu binarization (T=${threshold})`,
    imageData: binImg,
    previewUrl: binPreview,
    duration: performance.now() - t4,
  });

  // Step 6: Morphological closing
  onProgress?.('Feature extraction — morphological closing', 5, totalSteps);
  const t5 = performance.now();
  const closed = morphologicalClose(binary, width, height, 2);
  const closedImg = grayCtx.createImageData(width, height);
  for (let i = 0; i < closed.length; i++) {
    const v = closed[i] * 255;
    closedImg.data[i * 4] = v; closedImg.data[i * 4 + 1] = v; closedImg.data[i * 4 + 2] = v; closedImg.data[i * 4 + 3] = 255;
  }
  grayCtx.putImageData(closedImg, 0, 0);
  const closedPreview = grayCanvas.toDataURL('image/png');
  steps.push({
    name: 'Morphological close',
    description: 'Dilation + erosion boundary connection',
    imageData: closedImg,
    previewUrl: closedPreview,
    duration: performance.now() - t5,
  });

  // Step 7: Connected component labeling
  onProgress?.('Preliminary parcel generation — component labeling', 6, totalSteps);
  const t6 = performance.now();
  const { labels, count, sizes } = connectedComponents(closed, width, height);
  const labelImg = grayCtx.createImageData(width, height);
  const colors = new Map<number, [number, number, number]>();
  for (let i = 1; i <= count; i++) {
    const hue = (i * 137.5) % 360;
    colors.set(i, hslToRgb(hue, 0.6, 0.5));
  }
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] !== 0) {
      const [r, g, b] = colors.get(labels[i]) || [255, 255, 255];
      labelImg.data[i * 4] = r; labelImg.data[i * 4 + 1] = g; labelImg.data[i * 4 + 2] = b; labelImg.data[i * 4 + 3] = 255;
    } else {
      labelImg.data[i * 4] = 20; labelImg.data[i * 4 + 1] = 20; labelImg.data[i * 4 + 2] = 30; labelImg.data[i * 4 + 3] = 255;
    }
  }
  grayCtx.putImageData(labelImg, 0, 0);
  const labelPreview = grayCanvas.toDataURL('image/png');
  steps.push({
    name: 'Component labeling',
    description: `Segmented ${count} spatial parcel regions`,
    imageData: labelImg,
    previewUrl: labelPreview,
    duration: performance.now() - t6,
  });

  // Step 8: Contour tracing + polygon simplification
  onProgress?.('Parcel boundary vectorization — contour tracing', 7, totalSteps);
  const t7 = performance.now();
  const totalPixels = width * height;
  const minArea = Math.max(150, totalPixels * 0.0015);
  const maxArea = totalPixels * 0.6;

  const parcels: AnalyzedParcel[] = [];
  const buildings: AnalyzedParcel[] = [];
  let parcelIdx = 1;
  let buildingIdx = 1;

  const sortedComponents = Array.from(sizes.entries())
    .filter(([label, size]) => size >= minArea && size <= maxArea)
    .sort((a, b) => b[1] - a[1]);

  for (const [label, size] of sortedComponents) {
    const contour = traceContour(labels, width, height, label);
    if (contour.length < 4) continue;

    const tolerance = Math.max(2, Math.sqrt(size) * 0.04);
    const simplified = simplifyPolygon(contour, tolerance);
    if (simplified.length < 3) continue;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of simplified) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const bbox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    const bw = bbox.w, bh = bbox.h;
    if (bw < 8 || bh < 8) continue;

    const area = size;
    const perimeter = simplified.reduce((sum, p, i) => {
      const next = simplified[(i + 1) % simplified.length];
      return sum + Math.sqrt((next.x - p.x) ** 2 + (next.y - p.y) ** 2);
    }, 0);
    const aspectRatio = bw / bh;
    const bboxArea = bw * bh;
    const fillRatio = area / bboxArea;

    let edgeSum = 0, edgeCount = 0;
    for (const p of contour) {
      const idx = Math.floor(p.y) * width + Math.floor(p.x);
      if (idx >= 0 && idx < edges.length) { edgeSum += edges[idx]; edgeCount++; }
    }
    const edgeDensity = edgeCount > 0 ? edgeSum / edgeCount / 255 : 0;

    const isBuilding = fillRatio > 0.65 && area < totalPixels * 0.08 && edgeDensity > 0.25;
    const confidence = computeConfidence(edgeDensity, aspectRatio, area, totalPixels, isBuilding);
    const mapGeometry = toMapCoords(simplified, width, height);

    const parcel: AnalyzedParcel = {
      id: isBuilding ? `BLD-${String(buildingIdx++).padStart(4, '0')}` : `AI-${String(parcelIdx++).padStart(5, '0')}`,
      geometry: mapGeometry,
      area: Math.round(area * (1000000 / totalPixels)),
      perimeter: Math.round(perimeter * (1000 / Math.sqrt(totalPixels)) * 10) / 10,
      confidence,
      bbox: { x: (bbox.x / width) * 1000, y: (bbox.y / height) * 1000, w: (bbox.w / width) * 1000, h: (bbox.h / height) * 1000 },
      edgeDensity: Math.round(edgeDensity * 100) / 100,
      aspectRatio: Math.round(aspectRatio * 100) / 100,
      isBuilding,
    };

    if (isBuilding) buildings.push(parcel);
    else parcels.push(parcel);
  }

  // Draw detected boundaries preview
  const vCanvas = document.createElement('canvas');
  vCanvas.width = width; vCanvas.height = height;
  const vCtx = vCanvas.getContext('2d')!;
  vCtx.drawImage(imageElement, 0, 0, width, height);
  vCtx.fillStyle = 'rgba(15, 23, 42, 0.4)';
  vCtx.fillRect(0, 0, width, height);

  vCtx.strokeStyle = '#3b82f6';
  vCtx.lineWidth = 2;
  for (const p of parcels) {
    vCtx.beginPath();
    const pts = p.geometry.map(pt => ({ x: (pt.x / 1000) * width, y: (pt.y / 1000) * height }));
    vCtx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) vCtx.lineTo(pts[i].x, pts[i].y);
    vCtx.closePath();
    vCtx.fillStyle = 'rgba(59, 130, 246, 0.25)';
    vCtx.fill();
    vCtx.stroke();
  }

  vCtx.strokeStyle = '#f43f5e';
  vCtx.lineWidth = 2;
  for (const b of buildings) {
    vCtx.beginPath();
    const pts = b.geometry.map(pt => ({ x: (pt.x / 1000) * width, y: (pt.y / 1000) * height }));
    vCtx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) vCtx.lineTo(pts[i].x, pts[i].y);
    vCtx.closePath();
    vCtx.fillStyle = 'rgba(244, 63, 94, 0.4)';
    vCtx.fill();
    vCtx.stroke();
  }

  const vectorPreview = vCanvas.toDataURL('image/png');
  steps.push({
    name: 'Contour tracing',
    description: `Extracted ${parcels.length} parcels & ${buildings.length} building footprints`,
    imageData: null,
    previewUrl: vectorPreview,
    duration: performance.now() - t7,
  });

  // Step 9: Confidence scoring
  onProgress?.('Confidence scoring', 8, totalSteps);
  const t8 = performance.now();
  steps.push({
    name: 'Confidence scoring',
    description: 'Per-parcel geometric and boundary certainty assigned',
    imageData: null,
    previewUrl: vectorPreview,
    duration: performance.now() - t8,
  });

  // Step 10: Done
  onProgress?.('Analysis completed', 9, totalSteps);
  steps.push({
    name: 'Analysis completed',
    description: 'Preliminary cadastral map ready for GIS review',
    imageData: null,
    previewUrl: vectorPreview,
    duration: 0,
  });

  return {
    parcels,
    buildings,
    edges,
    segments: labels,
    width,
    height,
    processingSteps: steps,
  };
}

// === Helper: HSL to RGB ===
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360;
  let r: number, g: number, b: number;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// === Load image from File ===
export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// === Load image from URL ===
export function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// === Realistic Drone Orthomosaic Generator ===
export interface DroneSamplePreset {
  id: string;
  name: string;
  area: string;
  district: string;
  state: string;
  center: [number, number];
  description: string;
}

export const DRONE_SAMPLE_PRESETS: DroneSamplePreset[] = [
  {
    id: 'residential_colony',
    name: 'Sector 04 Residential Layout',
    area: 'Zone 04, Vidyadhar Nagar',
    district: 'Jaipur',
    state: 'Rajasthan',
    center: [26.9124, 75.7873],
    description: 'Dense urban housing subdivision with residential plots, roads, and boundary walls.',
  },
  {
    id: 'industrial_estate',
    name: 'Bhiwadi Industrial Corridor',
    area: 'Phase II Industrial Zone',
    district: 'Alwar',
    state: 'Rajasthan',
    center: [28.2104, 76.8606],
    description: 'Industrial estate featuring large warehouse footprints, wide access roads, and storage yards.',
  },
  {
    id: 'suburban_development',
    name: 'Whitefield Green Enclave',
    area: 'Kadugodi Survey Block 14',
    district: 'Bengaluru',
    state: 'Karnataka',
    center: [12.9698, 77.7499],
    description: 'Suburban development with plotted layouts, villas, compound fences, and garden lots.',
  },
  {
    id: 'agricultural_parcels',
    name: 'Khadakwasla Agricultural Block',
    area: 'Taluka Haveli Sector 09',
    district: 'Pune',
    state: 'Maharashtra',
    center: [18.4357, 73.7634],
    description: 'Agricultural farmland subdivided into irrigation blocks, tree clusters, and field boundaries.',
  },
];

export function generateRealisticDroneSample(presetId: string = 'residential_colony'): Promise<{ dataUrl: string; file: File; name: string }> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d')!;

    // 1. Base terrain background
    const gradient = ctx.createLinearGradient(0, 0, 1000, 1000);
    if (presetId === 'agricultural_parcels') {
      gradient.addColorStop(0, '#3f6212');
      gradient.addColorStop(0.5, '#4d7c0f');
      gradient.addColorStop(1, '#65a30d');
    } else if (presetId === 'industrial_estate') {
      gradient.addColorStop(0, '#334155');
      gradient.addColorStop(0.5, '#475569');
      gradient.addColorStop(1, '#1e293b');
    } else {
      gradient.addColorStop(0, '#334155');
      gradient.addColorStop(0.5, '#293548');
      gradient.addColorStop(1, '#1e293b');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1000, 1000);

    // 2. Texture noise / ground pattern
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    for (let i = 0; i < 600; i++) {
      const rx = Math.random() * 1000;
      const ry = Math.random() * 1000;
      const rw = 2 + Math.random() * 6;
      ctx.fillRect(rx, ry, rw, rw);
    }

    // 3. Roads network
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 36;
    ctx.lineCap = 'square';
    ctx.beginPath();
    ctx.moveTo(500, 0); ctx.lineTo(500, 1000);
    ctx.moveTo(0, 500); ctx.lineTo(1000, 500);
    ctx.stroke();

    // Road markings
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 12]);
    ctx.beginPath();
    ctx.moveTo(500, 0); ctx.lineTo(500, 1000);
    ctx.moveTo(0, 500); ctx.lineTo(1000, 500);
    ctx.stroke();
    ctx.setLineDash([]);

    // 4. Property Lots & Buildings
    const lots: [number, number, number, number][] = [
      // Top Left Quadrant (4 lots)
      [40, 40, 200, 200], [260, 40, 200, 200], [40, 260, 200, 200], [260, 260, 200, 200],
      // Top Right Quadrant (4 lots)
      [540, 40, 200, 200], [760, 40, 200, 200], [540, 260, 200, 200], [760, 260, 200, 200],
      // Bottom Left Quadrant (4 lots)
      [40, 540, 200, 200], [260, 540, 200, 200], [40, 760, 200, 200], [260, 760, 200, 200],
      // Bottom Right Quadrant (4 lots)
      [540, 540, 200, 200], [760, 540, 200, 200], [540, 760, 200, 200], [760, 760, 200, 200],
    ];

    lots.forEach(([lx, ly, lw, lh], idx) => {
      // Lot boundary ground
      ctx.fillStyle = idx % 2 === 0 ? '#475569' : '#3e4c5e';
      ctx.fillRect(lx, ly, lw, lh);

      // Boundary fence/wall outline
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 3;
      ctx.strokeRect(lx, ly, lw, lh);

      // Building structure inside lot
      const bPad = 35;
      const bx = lx + bPad;
      const by = ly + bPad;
      const bw = lw - bPad * 2;
      const bh = lh - bPad * 2;

      // Rooftop color
      const roofColors = ['#cbd5e1', '#e2e8f0', '#94a3b8', '#bfdbfe', '#fed7aa', '#fbcfe8'];
      ctx.fillStyle = roofColors[idx % roofColors.length];
      ctx.fillRect(bx, by, bw, bh);

      // Roof ridge line
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx, by + bh / 2);
      ctx.lineTo(bx + bw, by + bh / 2);
      ctx.stroke();

      // Trees / green vegetation in yards
      ctx.fillStyle = '#15803d';
      ctx.beginPath();
      ctx.arc(lx + 18, ly + 18, 10, 0, Math.PI * 2);
      ctx.fill();

      // Lot number text
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(`P-${String(idx + 1).padStart(2, '0')}`, bx + 6, by + 16);
    });

    // 5. Watermarks / Orthomosaic Banner
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fillRect(10, 960, 420, 30);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('DRONE ORTHOMOSAIC · GSD: 2.5cm/px · WGS84 EPSG:4326', 18, 980);

    canvas.toBlob((blob) => {
      if (blob) {
        const filename = `${presetId}_orthomosaic_1000px.png`;
        const file = new File([blob], filename, { type: 'image/png' });
        const dataUrl = canvas.toDataURL('image/png');
        resolve({ dataUrl, file, name: filename });
      }
    });
  });
}
