import * as THREE from 'three';

// Texture Cache to prevent rebuilding identical canvas textures
const TEXTURE_CACHE = new Map<string, THREE.CanvasTexture>();

/**
 * Curated realistic architectural color swatches (subtle, non-garish tones)
 */
export const ARCHITECTURAL_PALETTE = {
  offWhite: 0xf8fafc,
  creamPlaster: 0xfefce8,
  warmSandstone: 0xfde68a,
  lightBeige: 0xf5f5f4,
  terracottaPlaster: 0xfdba74,
  brickTone: 0xc2410c,
  modernSlate: 0xe2e8f0,
  lightCerulean: 0xbae6fd,
  concreteGrey: 0x94a3b8,
  roofPaving: 0xcbd5e1,
  roofTerracotta: 0xb45309,
  roofMetalGrey: 0x475569,
  solarNavy: 0x1e3a8a,
  waterTankBlue: 0x0284c7,
  waterTankBlack: 0x1e293b,
  frameCharcoal: 0x1e293b,
  glassDay: 0x0284c7,
  glassNight: 0xfef08a,
  doorTeak: 0x92400e,
  treeTrunk: 0x78350f,
  treeCanopy: 0x15803d,
};

// Subtle facade wall variations for procedural assignment
export const RESIDENTIAL_WALL_COLORS = [
  '#f8fafc', // Crisp Off-White
  '#f1f5f9', // Slate Off-White
  '#fefce8', // Warm Light Cream
  '#fef3c7', // Soft Sandstone
  '#f5f5f4', // Beige Plaster
  '#fed7aa', // Light Peach Stucco
  '#e2e8f0', // Modern Light Grey
  '#e0f2fe', // Soft Airy Sky
];

export const COMMERCIAL_GLASS_COLORS = [
  '#0284c7', // Azure Blue
  '#0369a1', // Deep Blue
  '#0d9488', // Teal Glass
  '#334155', // Charcoal Reflective
  '#475569', // Modern Slate
];

// ============================================================================
// PROCEDURAL CANVAS TEXTURE GENERATORS
// ============================================================================

export function getResidentialWallTexture(isNight: boolean, colorHex = '#f8fafc'): THREE.CanvasTexture {
  const key = `res_wall_${colorHex}_${isNight ? 'n' : 'd'}`;
  if (TEXTURE_CACHE.has(key)) return TEXTURE_CACHE.get(key)!;

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // 1. Base Wall Color
  ctx.fillStyle = isNight ? '#1e293b' : colorHex;
  ctx.fillRect(0, 0, 1024, 1024);

  // 2. Subtle stucco noise grain
  const grainCount = 1800;
  for (let i = 0; i < grainCount; i++) {
    const gx = Math.random() * 1024;
    const gy = Math.random() * 1024;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)';
    ctx.fillRect(gx, gy, 4, 4);
  }

  // 3. 4-Story Facade Architectural Rhythm
  const numFloors = 4;
  const floorH = 1024 / numFloors;
  const cols = 4;
  const colW = 1024 / cols;

  for (let f = 0; f < numFloors; f++) {
    const yTop = f * floorH;
    const isGround = f === numFloors - 1;

    // Floor division concrete spandrel beam
    ctx.fillStyle = isNight ? 'rgba(15, 23, 42, 0.85)' : 'rgba(203, 213, 225, 0.92)';
    ctx.fillRect(0, yTop, 1024, 14);
    ctx.fillStyle = isNight ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.85)';
    ctx.fillRect(0, yTop + 14, 1024, 4);

    // Decorative Terracotta accent band on upper stories
    if (!isGround && f % 2 === 1) {
      ctx.fillStyle = isNight ? '#78350f' : '#b45309';
      ctx.fillRect(0, yTop + 20, 1024, 10);
    }

    for (let c = 0; c < cols; c++) {
      const xLeft = c * colW;
      const winW = colW * 0.62;
      const winH = floorH * 0.54;
      const winX = xLeft + (colW - winW) / 2;
      const winY = yTop + floorH * 0.22;

      if (isGround && (c === 1 || c === 2)) {
        // Ground Floor Entrance Door
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(winX - 6, winY, winW + 12, floorH * 0.78);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 4;
        ctx.strokeRect(winX - 6, winY, winW + 12, floorH * 0.78);

        // Teak Wood Panels
        ctx.fillStyle = isNight ? '#78350f' : '#92400e';
        ctx.fillRect(winX - 2, winY + 6, winW / 2 - 4, floorH * 0.72);
        ctx.fillRect(winX + winW / 2 + 2, winY + 6, winW / 2 - 4, floorH * 0.72);

        // Stainless steel pull handles
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(winX + winW / 2 - 6, winY + floorH * 0.32, 4, 38);
        ctx.fillRect(winX + winW / 2 + 2, winY + floorH * 0.32, 4, 38);

        // Glass transom above
        ctx.fillStyle = isNight ? '#fef08a' : '#38bdf8';
        ctx.fillRect(winX - 2, winY + 6, winW + 4, 18);
        continue;
      }

      // Modern Aluminum Window Frame
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(winX - 6, winY - 6, winW + 12, winH + 12);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      ctx.strokeRect(winX - 6, winY - 6, winW + 12, winH + 12);

      // Glass Panes
      if (isNight && (f + c) % 2 === 0) {
        ctx.fillStyle = '#fef08a'; // Glowing evening window
      } else {
        const grad = ctx.createLinearGradient(winX, winY, winX + winW, winY + winH);
        grad.addColorStop(0, '#7dd3fc');
        grad.addColorStop(0.3, '#38bdf8');
        grad.addColorStop(0.7, '#0284c7');
        grad.addColorStop(1, '#0c4a6e');
        ctx.fillStyle = grad;
      }
      ctx.fillRect(winX, winY, winW, winH);

      // Specular Glass Sheen
      if (!isNight) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
        ctx.beginPath();
        ctx.moveTo(winX, winY);
        ctx.lineTo(winX + winW * 0.45, winY);
        ctx.lineTo(winX, winY + winH * 0.55);
        ctx.fill();
      }

      // Window Mullions
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(winX, winY + winH * 0.45);
      ctx.lineTo(winX + winW, winY + winH * 0.45);
      ctx.moveTo(winX + winW / 2, winY);
      ctx.lineTo(winX + winW / 2, winY + winH);
      ctx.stroke();

      // Concrete Sunshade Chajja
      ctx.fillStyle = isNight ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)';
      ctx.fillRect(winX - 12, winY - 12, winW + 24, 8);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.fillRect(winX - 12, winY - 4, winW + 24, 3);

      // Window Sill
      ctx.fillStyle = isNight ? 'rgba(15, 23, 42, 0.9)' : 'rgba(226, 232, 240, 0.95)';
      ctx.fillRect(winX - 10, winY + winH + 4, winW + 20, 8);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  TEXTURE_CACHE.set(key, texture);
  return texture;
}

export function getCommercialGlassTexture(isNight: boolean): THREE.CanvasTexture {
  const key = `com_glass_${isNight ? 'n' : 'd'}`;
  if (TEXTURE_CACHE.has(key)) return TEXTURE_CACHE.get(key)!;

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 1024, 1024);

  const rows = 8;
  const cols = 6;
  const rh = 1024 / rows;
  const cw = 1024 / cols;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cw;
      const y = r * rh;

      // Dark Aluminum Structural Mullions
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x, y, cw, rh);

      // Glass Unit
      const gx = x + 3;
      const gy = y + 3;
      const gw = cw - 6;
      const gh = rh - 6;

      if (isNight && (r + c * 2) % 3 === 0) {
        ctx.fillStyle = '#fef08a';
      } else {
        const grad = ctx.createLinearGradient(gx, gy, gx + gw, gy + gh);
        grad.addColorStop(0, '#38bdf8');
        grad.addColorStop(0.3, '#0284c7');
        grad.addColorStop(0.7, '#0369a1');
        grad.addColorStop(1, '#082f49');
        ctx.fillStyle = grad;
      }
      ctx.fillRect(gx, gy, gw, gh);

      // Glass Specular Sheen
      if (!isNight) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx + gw * 0.5, gy);
        ctx.lineTo(gx, gy + gh * 0.5);
        ctx.fill();
      }

      // Horizontal Spandrel Band on alternate floors
      if (r % 2 === 0) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
        ctx.fillRect(gx, gy + gh - 10, gw, 10);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  TEXTURE_CACHE.set(key, texture);
  return texture;
}

export function getIndustrialWallTexture(isNight: boolean): THREE.CanvasTexture {
  const key = `ind_wall_${isNight ? 'n' : 'd'}`;
  if (TEXTURE_CACHE.has(key)) return TEXTURE_CACHE.get(key)!;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Corrugated Metal Ribbed Panel
  ctx.fillStyle = isNight ? '#1e293b' : '#64748b';
  ctx.fillRect(0, 0, 512, 512);

  // Vertical Rib Corrugations
  const ribW = 16;
  for (let x = 0; x < 512; x += ribW) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(x, 0, ribW / 2, 512);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(x + ribW / 2, 0, ribW / 2, 512);
  }

  // Industrial Roll-up Shutter Bay at the bottom
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(64, 300, 384, 212);
  for (let y = 310; y < 512; y += 12) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(72, y, 368, 6);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(72, y + 6, 368, 6);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  TEXTURE_CACHE.set(key, texture);
  return texture;
}

export function getRoofTileTexture(): THREE.CanvasTexture {
  const key = 'roof_tiles_terracotta';
  if (TEXTURE_CACHE.has(key)) return TEXTURE_CACHE.get(key)!;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#b45309'; // Terracotta clay
  ctx.fillRect(0, 0, 512, 512);

  // Horizontal overlapping tile rows
  const tileH = 32;
  const tileW = 48;
  for (let y = 0; y < 512; y += tileH) {
    const rowOffset = (y / tileH) % 2 === 0 ? 0 : tileW / 2;
    // Row shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, y, 512, 4);

    for (let x = -tileW; x < 512 + tileW; x += tileW) {
      const tx = x + rowOffset;
      // Tile curve highlight & shadow
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fillRect(tx + 4, y + 4, tileW / 2, tileH - 6);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(tx + tileW / 2, y + 4, tileW / 2 - 4, tileH - 6);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(tx, y, tileW, tileH);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  TEXTURE_CACHE.set(key, texture);
  return texture;
}

export function getRoofPavingTexture(): THREE.CanvasTexture {
  const key = 'roof_paving_v3';
  if (TEXTURE_CACHE.has(key)) return TEXTURE_CACHE.get(key)!;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(0, 0, 512, 512);

  // Gravel perimeter ballast
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(0, 0, 512, 24);
  ctx.fillRect(0, 488, 512, 24);
  ctx.fillRect(0, 0, 24, 512);
  ctx.fillRect(488, 0, 24, 512);

  // Concrete Paving Grid Seams
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.25)';
  ctx.lineWidth = 2.5;
  for (let x = 32; x < 512; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 24);
    ctx.lineTo(x, 488);
    ctx.stroke();
  }
  for (let y = 32; y < 512; y += 64) {
    ctx.beginPath();
    ctx.moveTo(24, y);
    ctx.lineTo(488, y);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  TEXTURE_CACHE.set(key, texture);
  return texture;
}

export function getSolarPanelTexture(): THREE.CanvasTexture {
  const key = 'solar_pv_v3';
  if (TEXTURE_CACHE.has(key)) return TEXTURE_CACHE.get(key)!;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(4, 4, 248, 248);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 1.2;
  for (let x = 8; x < 256; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 4);
    ctx.lineTo(x, 252);
    ctx.stroke();
  }
  for (let y = 8; y < 256; y += 32) {
    ctx.beginPath();
    ctx.moveTo(4, y);
    ctx.lineTo(252, y);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  TEXTURE_CACHE.set(key, texture);
  return texture;
}

export function getPlinthPaversTexture(): THREE.CanvasTexture {
  const key = 'plinth_pavers_v3';
  if (TEXTURE_CACHE.has(key)) return TEXTURE_CACHE.get(key)!;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = 'rgba(100, 116, 139, 0.35)';
  ctx.lineWidth = 1.5;
  for (let x = 0; x <= 256; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }
  for (let y = 0; y <= 256; y += 16) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  TEXTURE_CACHE.set(key, texture);
  return texture;
}

// ============================================================================
// PLANAR UV PROJECTION HELPER
// ============================================================================

export function applyPlanarFacadeUVs(geo: THREE.BufferGeometry, floorHeight = 3.2, bayWidth = 8.0) {
  geo.computeVertexNormals();
  const pos = geo.attributes.position;
  const norm = geo.attributes.normal;
  const uv = geo.attributes.uv;
  if (!pos || !norm || !uv) return;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ny = Math.abs(norm.getY(i));

    if (ny > 0.7) {
      // Horizontal slab / roof
      uv.setXY(i, x / 12.0, z / 12.0);
    } else {
      // Vertical wall facade
      const nx = Math.abs(norm.getX(i));
      const nz = Math.abs(norm.getZ(i));
      const horiz = nx > nz ? z : x;
      uv.setXY(i, horiz / bayWidth, y / floorHeight);
    }
  }
  uv.needsUpdate = true;
}

// ============================================================================
// SHARED PBR MATERIAL SYSTEM
// ============================================================================

export interface ArchitecturalMaterials {
  wallResidential: THREE.MeshStandardMaterial;
  wallCommercial: THREE.MeshStandardMaterial;
  wallIndustrial: THREE.MeshStandardMaterial;
  wallCivic: THREE.MeshStandardMaterial;
  roofSlab: THREE.MeshStandardMaterial;
  roofTiles: THREE.MeshStandardMaterial;
  roofMetal: THREE.MeshStandardMaterial;
  plinth: THREE.MeshStandardMaterial;
  aluminumFrame: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  sintexTankBlue: THREE.MeshStandardMaterial;
  sintexTankBlack: THREE.MeshStandardMaterial;
  solarPanel: THREE.MeshStandardMaterial;
  hvacUnit: THREE.MeshStandardMaterial;
  doorWood: THREE.MeshStandardMaterial;
  treeWood: THREE.MeshStandardMaterial;
  treeFoliage: THREE.MeshStandardMaterial;
  simplifiedBuilding: THREE.MeshStandardMaterial;
  ghosted: THREE.MeshStandardMaterial;
}

let SHARED_MATS_CACHE: ArchitecturalMaterials | null = null;
let CACHED_IS_NIGHT: boolean | null = null;
let CACHED_WIREFRAME: boolean | null = null;

export function getArchitecturalMaterials(isNight: boolean, wireframe: boolean): ArchitecturalMaterials {
  if (SHARED_MATS_CACHE && CACHED_IS_NIGHT === isNight && CACHED_WIREFRAME === wireframe) {
    return SHARED_MATS_CACHE;
  }

  const resTex = getResidentialWallTexture(isNight);
  const comTex = getCommercialGlassTexture(isNight);
  const indTex = getIndustrialWallTexture(isNight);
  const roofPaveTex = getRoofPavingTexture();
  const roofTileTex = getRoofTileTexture();
  const solarTex = getSolarPanelTexture();
  const plinthTex = getPlinthPaversTexture();

  CACHED_IS_NIGHT = isNight;
  CACHED_WIREFRAME = wireframe;

  SHARED_MATS_CACHE = {
    wallResidential: new THREE.MeshStandardMaterial({
      map: resTex,
      roughness: 0.62,
      metalness: 0.05,
      wireframe,
    }),
    wallCommercial: new THREE.MeshStandardMaterial({
      map: comTex,
      roughness: 0.12,
      metalness: 0.88,
      wireframe,
    }),
    wallIndustrial: new THREE.MeshStandardMaterial({
      map: indTex,
      roughness: 0.55,
      metalness: 0.45,
      wireframe,
    }),
    wallCivic: new THREE.MeshStandardMaterial({
      map: resTex,
      color: 0xfef9c3,
      roughness: 0.68,
      metalness: 0.05,
      wireframe,
    }),
    roofSlab: new THREE.MeshStandardMaterial({
      map: roofPaveTex,
      roughness: 0.75,
      metalness: 0.05,
      wireframe,
    }),
    roofTiles: new THREE.MeshStandardMaterial({
      map: roofTileTex,
      roughness: 0.7,
      metalness: 0.05,
      wireframe,
    }),
    roofMetal: new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.35,
      metalness: 0.7,
      wireframe,
    }),
    plinth: new THREE.MeshStandardMaterial({
      map: plinthTex,
      roughness: 0.85,
      metalness: 0.05,
      wireframe,
    }),
    aluminumFrame: new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.3,
      metalness: 0.75,
      wireframe,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: isNight ? 0xfef08a : 0x0284c7,
      roughness: 0.05,
      metalness: 0.92,
      transparent: true,
      opacity: 0.82,
      wireframe,
    }),
    sintexTankBlue: new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.35,
      metalness: 0.25,
      wireframe,
    }),
    sintexTankBlack: new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.4,
      metalness: 0.3,
      wireframe,
    }),
    solarPanel: new THREE.MeshStandardMaterial({
      map: solarTex,
      roughness: 0.15,
      metalness: 0.85,
      wireframe,
    }),
    hvacUnit: new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.45,
      metalness: 0.65,
      wireframe,
    }),
    doorWood: new THREE.MeshStandardMaterial({
      color: 0x92400e,
      roughness: 0.7,
      metalness: 0.1,
      wireframe,
    }),
    treeWood: new THREE.MeshStandardMaterial({
      color: 0x78350f,
      roughness: 0.9,
    }),
    treeFoliage: new THREE.MeshStandardMaterial({
      color: 0x15803d,
      roughness: 0.8,
      flatShading: true,
    }),
    simplifiedBuilding: new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.5,
      metalness: 0.1,
      wireframe,
    }),
    ghosted: new THREE.MeshStandardMaterial({
      map: resTex,
      color: 0x94a3b8,
      roughness: 0.8,
      transparent: true,
      opacity: 0.4,
      wireframe,
    }),
  };

  return SHARED_MATS_CACHE;
}
