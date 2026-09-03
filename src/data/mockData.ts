import type {
  Parcel,
  Building,
  Road,
  GNSSPoint,
  TopologyIssue,
  Project,
  Surveyor,
  AppNotification,
  ParcelStatus,
  Priority,
  ConflictType,
  VerificationStatus,
  ConfidenceLevel,
} from '@/types';

// Deterministic pseudo-random generator for reproducible demo data
let _seed = 42;
const rand = () => {
  _seed = (_seed * 1103515245 + 12345) & 0x7fffffff;
  return _seed / 0x7fffffff;
};
const randRange = (min: number, max: number) => min + rand() * (max - min);
const randInt = (min: number, max: number) => Math.floor(randRange(min, max + 1));
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

const M = 1000; // local coordinate space size

const surveyors: Surveyor[] = [
  { id: 'S001', name: 'Ravi Kumar', email: 'ravi.kumar@landai.gov.in', role: 'Senior GIS Surveyor', avatar: 'RK' },
  { id: 'S002', name: 'Priya Sharma', email: 'priya.sharma@landai.gov.in', role: 'Drone GIS Analyst', avatar: 'PS' },
  { id: 'S003', name: 'Arjun Mehta', email: 'arjun.mehta@landai.gov.in', role: 'Cadastral Officer', avatar: 'AM' },
  { id: 'S004', name: 'Sneha Patel', email: 'sneha.patel@landai.gov.in', role: 'Field Surveyor', avatar: 'SP' },
  { id: 'S005', name: 'Vikram Singh', email: 'vikram.singh@landai.gov.in', role: 'GIS Cell Lead', avatar: 'VS' },
];

function polygonArea(poly: { x: number; y: number }[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    area += poly[i].x * poly[j].y;
    area -= poly[j].x * poly[i].y;
  }
  return Math.abs(area) / 2;
}

function polygonPerimeter(poly: { x: number; y: number }[]): number {
  let p = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const dx = poly[j].x - poly[i].x;
    const dy = poly[j].y - poly[i].y;
    p += Math.sqrt(dx * dx + dy * dy);
  }
  return p;
}

// Scale factor: local coordinate units to real square meters (~120 - 320 m²)
const AREA_SCALE = 0.16;

function getConfidenceLevel(c: number): ConfidenceLevel {
  if (c >= 95) return 'very_high';
  if (c >= 80) return 'high';
  if (c >= 60) return 'medium';
  return 'low';
}

function getPriority(confidence: number, areaDiff: number, conflictType: ConflictType | null): Priority {
  if (confidence < 60 || (conflictType === 'overlap' && areaDiff > 15) || conflictType === 'self_intersection') return 'CRITICAL';
  if (confidence < 75 || areaDiff > 10 || conflictType === 'overlap') return 'HIGH';
  if (confidence < 85 || areaDiff > 5 || conflictType) return 'MEDIUM';
  return 'LOW';
}

function getStatus(confidence: number, verificationStatus: VerificationStatus, conflictType: ConflictType | null, topologyStatus: 'valid' | 'invalid'): ParcelStatus {
  if (verificationStatus === 'verified') return 'verified';
  if (verificationStatus === 'field_verification_required' || confidence < 70) return 'field_verification';
  if (conflictType || confidence < 85 || topologyStatus === 'invalid') return 'requires_review';
  return 'ai_preliminary';
}

function getRecommendation(p: { confidence: number; boundaryDisplacement: number; conflictType: ConflictType | null; topologyStatus: string }): string {
  if (p.confidence < 60) return 'Insufficient confidence — field verification required.';
  if (p.confidence < 70) return `Field verification recommended because AI confidence is ${p.confidence}% and predicted boundary variance is ${p.boundaryDisplacement.toFixed(1)} m.`;
  if (p.topologyStatus === 'invalid') return 'Topology validation discrepancy — review parcel boundary nodes.';
  if (p.conflictType === 'overlap') return 'Boundary overlap detected with adjacent parcel record.';
  if (p.confidence < 85) return 'Review AI predicted boundary against cadastral register.';
  return 'Accept AI predicted boundary — high confidence prediction.';
}

function getConflictReasons(confidence: number, areaDiff: number, boundaryDiff: number, conflictType: ConflictType | null, hasGnss: boolean, gnssDist: number): string[] {
  const reasons: string[] = [];
  if (conflictType === 'boundary_mismatch' || boundaryDiff > 1.2) reasons.push(`Existing and AI boundaries differ by ${boundaryDiff.toFixed(1)} m`);
  if (conflictType === 'area_mismatch' || areaDiff > 6) reasons.push(`Registered vs AI area difference is ${areaDiff.toFixed(1)}%`);
  if (conflictType === 'overlap') reasons.push('Parcel polygon overlaps adjoining cadastral property line');
  if (conflictType === 'gap') reasons.push('Unsurveyed gap detected between neighboring parcel boundaries');
  if (conflictType === 'self_intersection') reasons.push('Self-intersecting geometry node detected');
  if (conflictType === 'missing_parcel') reasons.push('AI detected unrecorded structure/parcel in orthomosaic');
  if (conflictType === 'new_structure') reasons.push('New unauthorized construction detected beyond boundary');
  if (hasGnss && gnssDist > 1.5) reasons.push(`GNSS reference coordinate differs by ${gnssDist.toFixed(1)} m`);
  if (confidence < 80) reasons.push(`AI confidence below threshold (${confidence}%)`);
  if (reasons.length === 0) reasons.push('Minor boundary deviation within GIS tolerance');
  return reasons;
}

// Exact calibrated layout matching drone_orthomosaic_ward42.jpg
interface ParcelDefinition {
  idSuffix: number | string;
  px1: number;
  py1: number;
  px2: number;
  py2: number;
  bx1: number;
  by1: number;
  bx2: number;
  by2: number;
  landUse: string;
  roofColor: string;
  isIssue?: boolean;
  conflictType?: ConflictType;
  confidence?: number;
}

const RAW_PARCELS: ParcelDefinition[] = [
  // West Block (Left of Avenue 1)
  { idSuffix: 101, px1: 15, py1: 15, px2: 120, py2: 130, bx1: 28, by1: 25, bx2: 110, by2: 120, landUse: 'Residential', roofColor: '#cbd5e1' },
  { idSuffix: 102, px1: 15, py1: 140, px2: 120, py2: 260, bx1: 25, by1: 150, bx2: 112, by2: 250, landUse: 'Residential', roofColor: '#ea580c', isIssue: true, conflictType: 'boundary_mismatch' },
  { idSuffix: 103, px1: 15, py1: 270, px2: 120, py2: 400, bx1: 25, by1: 280, bx2: 112, by2: 385, landUse: 'Residential', roofColor: '#cbd5e1' },
  { idSuffix: 104, px1: 15, py1: 410, px2: 120, py2: 545, bx1: 22, by1: 420, bx2: 112, by2: 535, landUse: 'Residential', roofColor: '#cbd5e1' },
  { idSuffix: 105, px1: 15, py1: 555, px2: 120, py2: 690, bx1: 22, by1: 565, bx2: 112, by2: 680, landUse: 'Residential', roofColor: '#f97316' },

  // Mid-West Column - West Facing
  { idSuffix: 111, px1: 158, py1: 15, px2: 255, py2: 130, bx1: 168, by1: 25, bx2: 248, by2: 120, landUse: 'Residential', roofColor: '#cbd5e1' },
  { idSuffix: 112, px1: 158, py1: 140, px2: 255, py2: 260, bx1: 168, by1: 150, bx2: 248, by2: 250, landUse: 'Residential', roofColor: '#cbd5e1' },
  { idSuffix: 113, px1: 158, py1: 270, px2: 255, py2: 400, bx1: 168, by1: 280, bx2: 248, by2: 385, landUse: 'Residential', roofColor: '#cbd5e1' },
  { idSuffix: 114, px1: 158, py1: 410, px2: 255, py2: 545, bx1: 168, by1: 420, bx2: 248, by2: 535, landUse: 'Residential', roofColor: '#cbd5e1' },
  { idSuffix: 115, px1: 158, py1: 555, px2: 255, py2: 690, bx1: 168, by1: 565, bx2: 248, by2: 680, landUse: 'Residential', roofColor: '#f97316', isIssue: true, conflictType: 'overlap' },

  // Mid-West Column - East Facing
  { idSuffix: 121, px1: 265, py1: 15, px2: 362, py2: 130, bx1: 275, by1: 25, bx2: 355, by2: 120, landUse: 'Commercial', roofColor: '#cbd5e1' },
  { idSuffix: 122, px1: 265, py1: 140, px2: 362, py2: 260, bx1: 275, by1: 150, bx2: 355, by2: 250, landUse: 'Commercial', roofColor: '#cbd5e1' },
  { idSuffix: 123, px1: 265, py1: 270, px2: 362, py2: 400, bx1: 275, by1: 280, bx2: 355, by2: 385, landUse: 'Commercial', roofColor: '#cbd5e1' },
  { idSuffix: 124, px1: 265, py1: 410, px2: 362, py2: 545, bx1: 275, by1: 420, bx2: 355, by2: 535, landUse: 'Commercial', roofColor: '#cbd5e1' },
  { idSuffix: 125, px1: 265, py1: 555, px2: 362, py2: 690, bx1: 275, by1: 565, bx2: 355, by2: 680, landUse: 'Commercial', roofColor: '#f97316' },

  // Center Column - North Tier
  { idSuffix: 131, px1: 395, py1: 15, px2: 485, py2: 130, bx1: 405, by1: 20, bx2: 478, by2: 120, landUse: 'Residential', roofColor: '#cbd5e1' },
  { idSuffix: 132, px1: 495, py1: 15, px2: 585, py2: 130, bx1: 505, by1: 20, bx2: 578, by2: 120, landUse: 'Residential', roofColor: '#cbd5e1' },
  { idSuffix: 133, px1: 395, py1: 140, px2: 485, py2: 265, bx1: 405, by1: 148, bx2: 478, by2: 255, landUse: 'Residential', roofColor: '#ea580c' },
  { idSuffix: 134, px1: 495, py1: 140, px2: 585, py2: 265, bx1: 505, by1: 148, bx2: 578, by2: 255, landUse: 'Residential', roofColor: '#cbd5e1' },

  // Center Column - South Tier (Featured Parcel TN-CHN-W42-000184)
  { idSuffix: '000184', px1: 395, py1: 295, px2: 485, py2: 415, bx1: 405, by1: 305, bx2: 478, by2: 405, landUse: 'Residential', roofColor: '#cbd5e1', confidence: 92.4 },
  { idSuffix: 185, px1: 495, py1: 295, px2: 585, py2: 415, bx1: 505, by1: 305, bx2: 578, by2: 405, landUse: 'Residential', roofColor: '#cbd5e1' },
  { idSuffix: 186, px1: 395, py1: 425, px2: 485, py2: 515, bx1: 405, by1: 435, bx2: 478, by2: 505, landUse: 'Residential', roofColor: '#cbd5e1' },
  { idSuffix: 187, px1: 495, py1: 425, px2: 585, py2: 515, bx1: 505, by1: 435, bx2: 578, by2: 505, landUse: 'Residential', roofColor: '#cbd5e1' },
  { idSuffix: 188, px1: 395, py1: 525, px2: 485, py2: 615, bx1: 402, by1: 532, bx2: 475, by2: 608, landUse: 'Residential', roofColor: '#ea580c' },
  { idSuffix: 189, px1: 495, py1: 525, px2: 585, py2: 615, bx1: 505, by1: 532, bx2: 575, by2: 608, landUse: 'Residential', roofColor: '#cbd5e1', isIssue: true, conflictType: 'area_mismatch' },
  { idSuffix: 190, px1: 395, py1: 625, px2: 485, py2: 725, bx1: 402, by1: 635, bx2: 478, by2: 715, landUse: 'Residential', roofColor: '#cbd5e1' },
  { idSuffix: 191, px1: 495, py1: 625, px2: 585, py2: 725, bx1: 505, by1: 635, bx2: 575, by2: 715, landUse: 'Residential', roofColor: '#cbd5e1' },

  // Mid-East Column (Between Avenue 3 and 4)
  { idSuffix: 201, px1: 615, py1: 15, px2: 712, py2: 130, bx1: 625, by1: 22, bx2: 705, by2: 120, landUse: 'Residential', roofColor: '#cbd5e1' },
  { idSuffix: 202, px1: 615, py1: 140, px2: 712, py2: 270, bx1: 628, by1: 150, bx2: 705, by2: 260, landUse: 'Residential', roofColor: '#ea580c' },
  { idSuffix: 203, px1: 615, py1: 280, px2: 712, py2: 385, bx1: 625, by1: 290, bx2: 705, by2: 375, landUse: 'Residential', roofColor: '#cbd5e1' },
  { idSuffix: 204, px1: 615, py1: 395, px2: 712, py2: 490, bx1: 625, by1: 405, bx2: 705, by2: 480, landUse: 'Residential', roofColor: '#cbd5e1' },
  { idSuffix: 205, px1: 615, py1: 500, px2: 712, py2: 605, bx1: 625, by1: 508, bx2: 705, by2: 595, landUse: 'Residential', roofColor: '#ea580c' },
  { idSuffix: 206, px1: 615, py1: 615, px2: 712, py2: 725, bx1: 625, by1: 625, bx2: 705, by2: 715, landUse: 'Residential', roofColor: '#cbd5e1' },

  { idSuffix: 211, px1: 722, py1: 15, px2: 820, py2: 130, bx1: 732, by1: 22, bx2: 812, by2: 120, landUse: 'Residential', roofColor: '#cbd5e1' },
  { idSuffix: 212, px1: 722, py1: 140, px2: 820, py2: 270, bx1: 732, by1: 150, bx2: 812, by2: 260, landUse: 'Residential', roofColor: '#cbd5e1', isIssue: true, conflictType: 'boundary_mismatch' },
  { idSuffix: 213, px1: 722, py1: 280, px2: 820, py2: 385, bx1: 732, by1: 290, bx2: 812, by2: 375, landUse: 'Residential', roofColor: '#cbd5e1' },
  { idSuffix: 214, px1: 722, py1: 395, px2: 820, py2: 490, bx1: 732, by1: 405, bx2: 812, by2: 480, landUse: 'Residential', roofColor: '#cbd5e1' },
  { idSuffix: 215, px1: 722, py1: 500, px2: 820, py2: 605, bx1: 732, by1: 508, bx2: 812, by2: 595, landUse: 'Residential', roofColor: '#f97316' },
  { idSuffix: 216, px1: 722, py1: 615, px2: 820, py2: 725, bx1: 732, by1: 625, bx2: 812, by2: 715, landUse: 'Residential', roofColor: '#cbd5e1' },

  // Far-East Column
  { idSuffix: 221, px1: 855, py1: 15, px2: 985, py2: 130, bx1: 865, by1: 22, bx2: 975, by2: 120, landUse: 'Residential', roofColor: '#cbd5e1' },
  { idSuffix: 222, px1: 855, py1: 140, px2: 985, py2: 270, bx1: 865, by1: 150, bx2: 975, by2: 260, landUse: 'Residential', roofColor: '#cbd5e1' },
  { idSuffix: 223, px1: 855, py1: 280, px2: 985, py2: 400, bx1: 865, by1: 290, bx2: 975, by2: 390, landUse: 'Residential', roofColor: '#ea580c' },
  { idSuffix: 224, px1: 855, py1: 410, px2: 985, py2: 545, bx1: 865, by1: 420, bx2: 975, by2: 535, landUse: 'Residential', roofColor: '#cbd5e1' },
  { idSuffix: 225, px1: 855, py1: 555, px2: 985, py2: 690, bx1: 865, by1: 565, bx2: 975, by2: 680, landUse: 'Residential', roofColor: '#ea580c' },

  // South Block (Below Main Street at y ≈ 770)
  { idSuffix: 231, px1: 20, py1: 780, px2: 125, py2: 880, bx1: 30, by1: 790, bx2: 115, by2: 870, landUse: 'Residential', roofColor: '#f97316' },
  { idSuffix: 232, px1: 20, py1: 890, px2: 125, py2: 985, bx1: 30, by1: 900, bx2: 115, by2: 975, landUse: 'Residential', roofColor: '#cbd5e1' },
  { idSuffix: 233, px1: 155, py1: 780, px2: 255, py2: 880, bx1: 165, by1: 790, bx2: 245, by2: 870, landUse: 'Residential', roofColor: '#cbd5e1' },
  { idSuffix: 234, px1: 155, py1: 890, px2: 255, py2: 985, bx1: 165, by1: 900, bx2: 245, by2: 975, landUse: 'Residential', roofColor: '#cbd5e1' },
  { idSuffix: 235, px1: 265, py1: 780, px2: 360, py2: 880, bx1: 275, by1: 790, bx2: 350, by2: 870, landUse: 'Residential', roofColor: '#cbd5e1' },
  { idSuffix: 236, px1: 265, py1: 890, px2: 360, py2: 985, bx1: 275, by1: 900, bx2: 350, by2: 975, landUse: 'Residential', roofColor: '#cbd5e1' },

  { idSuffix: 241, px1: 395, py1: 780, px2: 485, py2: 880, bx1: 405, by1: 790, bx2: 478, by2: 870, landUse: 'Residential', roofColor: '#f97316' },
  { idSuffix: 242, px1: 395, py1: 890, px2: 485, py2: 985, bx1: 405, by1: 900, bx2: 478, by2: 975, landUse: 'Residential', roofColor: '#cbd5e1' },
  { idSuffix: 243, px1: 495, py1: 780, px2: 585, py2: 880, bx1: 505, by1: 790, bx2: 578, by2: 870, landUse: 'Residential', roofColor: '#cbd5e1' },
  { idSuffix: 244, px1: 495, py1: 890, px2: 585, py2: 985, bx1: 505, by1: 900, bx2: 578, by2: 975, landUse: 'Residential', roofColor: '#cbd5e1' },

  { idSuffix: 251, px1: 615, py1: 780, px2: 712, py2: 880, bx1: 625, by1: 790, bx2: 705, by2: 870, landUse: 'Residential', roofColor: '#f97316' },
  { idSuffix: 252, px1: 615, py1: 890, px2: 712, py2: 985, bx1: 625, by1: 900, bx2: 705, by2: 975, landUse: 'Residential', roofColor: '#cbd5e1' },
  { idSuffix: 253, px1: 722, py1: 780, px2: 820, py2: 880, bx1: 732, by1: 790, bx2: 812, by2: 870, landUse: 'Residential', roofColor: '#ea580c' },
  { idSuffix: 254, px1: 722, py1: 890, px2: 820, py2: 985, bx1: 732, by1: 900, bx2: 812, by2: 975, landUse: 'Residential', roofColor: '#cbd5e1' },

  { idSuffix: 261, px1: 855, py1: 780, px2: 985, py2: 880, bx1: 865, by1: 790, bx2: 975, by2: 870, landUse: 'Residential', roofColor: '#cbd5e1' },
  { idSuffix: 262, px1: 855, py1: 890, px2: 985, py2: 985, bx1: 865, by1: 900, bx2: 975, by2: 975, landUse: 'Residential', roofColor: '#f97316' },
];

export function generateParcels(projectPrefix = 'TN-CHN-W42'): Parcel[] {
  _seed = 42;
  const parcels: Parcel[] = [];

  for (const item of RAW_PARCELS) {
    const isFeatured = item.idSuffix === '000184';
    const pid = isFeatured ? `${projectPrefix}-000184` : `${projectPrefix}-${String(item.idSuffix).padStart(6, '0')}`;

    // Precise existing cadastral rectangle
    const existing = [
      { x: item.px1, y: item.py1 },
      { x: item.px2, y: item.py1 },
      { x: item.px2, y: item.py2 },
      { x: item.px1, y: item.py2 },
    ];

    // AI predicted boundary (tight fit to property lines)
    const ai = [
      { x: item.px1, y: item.py1 },
      { x: item.px2, y: item.py1 },
      { x: item.px2, y: item.py2 },
      { x: item.px1, y: item.py2 },
    ];

    const existingArea = isFeatured ? 148.62 : Math.round((polygonArea(existing) * AREA_SCALE) * 100) / 100;
    const aiArea = isFeatured ? 148.62 : existingArea;
    const perimeter = Math.round((polygonPerimeter(ai) * Math.sqrt(AREA_SCALE)) * 10) / 10;

    const confidence = item.confidence ?? (item.isIssue ? 72.5 : Math.round(randRange(88, 99.2) * 10) / 10);
    const boundaryConfidence = Math.round(Math.min(100, confidence + 1.2) * 10) / 10;
    const buildingConfidence = Math.round(randRange(90, 99) * 10) / 10;

    const conflictType = item.conflictType || null;
    const isIssue = !!item.isIssue || conflictType !== null;
    const topologyStatus = conflictType === 'overlap' || conflictType === 'gap' ? 'invalid' : 'valid';
    const topologyIssues: string[] = [];
    if (topologyStatus === 'invalid') {
      topologyIssues.push(conflictType === 'overlap' ? 'Overlap with adjacent parcel boundary' : 'Boundary gap detected');
    }

    const verificationStatus: VerificationStatus =
      isFeatured ? 'not_reviewed' :
      confidence < 70 ? 'field_verification_required' :
      rand() < 0.2 ? 'under_review' :
      rand() < 0.7 ? 'verified' : 'not_reviewed';

    const status = isFeatured ? 'ai_preliminary' : getStatus(confidence, verificationStatus, conflictType, topologyStatus);
    const priority = isFeatured ? 'LOW' : getPriority(confidence, 0, conflictType);
    const conflictReasons = getConflictReasons(confidence, 0, 0.4, conflictType, false, 0);

    const bFloors = isFeatured ? 2 : (item.landUse === 'Commercial' ? 3 : randInt(1, 3));
    const bHeight = Math.round((bFloors * 3.2 + 0.8) * 10) / 10;
    const groundElevation = Math.round((14.5 + Math.sin(item.px1 / 200) * 2.5) * 10) / 10;

    const parcel: Parcel = {
      id: pid,
      surveyNumber: `${randInt(140, 390)}/${randInt(1, 4)}`,
      ward: 'Ward 42',
      zone: 'Zone 05',
      existingGeometry: existing,
      aiGeometry: ai,
      existingArea,
      aiArea,
      confidence,
      boundaryConfidence,
      buildingConfidence,
      perimeter,
      boundaryDisplacement: isFeatured ? 0.4 : 0.6,
      status,
      conflictType,
      priority,
      topologyStatus,
      verificationStatus,
      topologyIssues,
      notes: '',
      recommendation: isFeatured ? 'Accept AI boundary — high confidence prediction (92.4%).' : getRecommendation({ confidence, boundaryDisplacement: 0.6, conflictType, topologyStatus }),
      conflictReasons,
      assignedSurveyor: verificationStatus === 'field_verification_required' ? pick(surveyors).name : null,
      checklist: {
        boundaryVerified: verificationStatus === 'verified',
        existingRecordChecked: verificationStatus === 'verified',
        gnssCollected: false,
        buildingChecked: false,
        neighborChecked: verificationStatus === 'verified',
      },
      hasBuilding: true,
      gnssPointIds: [],
      elevation: groundElevation,
      buildingHeight: bHeight,
      floors: bFloors,
      roofColor: item.roofColor,
      buildingType: item.landUse.toLowerCase() as any,
      landUse: item.landUse,
      predictedBy: 'LAND-AI Model v2.1',
      createdOn: '18 May 2025 10:44 AM',
      isIssue,
    };

    parcels.push(parcel);
  }

  return parcels;
}

export function generateBuildings(parcels: Parcel[]): Building[] {
  const buildings: Building[] = [];

  for (let i = 0; i < RAW_PARCELS.length; i++) {
    const item = RAW_PARCELS[i];
    const p = parcels[i];
    if (!p) continue;

    const geom = [
      { x: item.bx1, y: item.by1 },
      { x: item.bx2, y: item.by1 },
      { x: item.bx2, y: item.by2 },
      { x: item.bx1, y: item.by2 },
    ];

    buildings.push({
      id: `BLD-${String(i + 1).padStart(4, '0')}`,
      geometry: geom,
      area: Math.round(polygonArea(geom) * AREA_SCALE * 100) / 100,
      height: p.buildingHeight || 7.2,
      parcelId: p.id,
      type: p.landUse || 'Residential',
      floors: p.floors || 2,
      levels: p.floors || 2,
      roofColor: item.roofColor,
      roofType: 'flat_parapet',
      isHeightEstimated: false,
      elevation: p.elevation || 15.0,
    });
  }

  return buildings;
}

// Clean road corridors directly centered on the orthomosaic streets
export function generateRoads(): Road[] {
  return [
    // Main East-West Street (lower middle across the map)
    {
      id: 'R-MAIN-1',
      name: 'South Ring Main Avenue',
      path: [{ x: 0, y: 755 }, { x: 1000, y: 755 }],
      width: 14,
    },
    // Avenue 1 (West Corridor)
    {
      id: 'R-VERT-1',
      name: 'West Avenue Corridor',
      path: [{ x: 138, y: 0 }, { x: 138, y: 1000 }],
      width: 12,
    },
    // Avenue 2 (Central West)
    {
      id: 'R-VERT-2',
      name: 'Sector 42 Central Road',
      path: [{ x: 380, y: 0 }, { x: 380, y: 755 }],
      width: 12,
    },
    // Avenue 3 (Central East)
    {
      id: 'R-VERT-3',
      name: 'Market Link Road',
      path: [{ x: 600, y: 0 }, { x: 600, y: 755 }],
      width: 12,
    },
    // Avenue 4 (Far East Corridor)
    {
      id: 'R-VERT-4',
      name: 'East Ring Boulevard',
      path: [{ x: 838, y: 0 }, { x: 838, y: 1000 }],
      width: 14,
    },
    // North Connecting Cross-Street
    {
      id: 'R-HORIZ-2',
      name: 'Crossway Connector',
      path: [{ x: 380, y: 280 }, { x: 600, y: 280 }],
      width: 10,
    },
  ];
}

export function generateGNSSPoints(parcels: Parcel[]): GNSSPoint[] {
  _seed = 55;
  const points: GNSSPoint[] = [];
  let gid = 1;
  const baseLat = 13.0827;
  const baseLng = 80.2707;

  const samplePositions = [
    { x: 138, y: 280 },
    { x: 380, y: 280 },
    { x: 600, y: 280 },
    { x: 838, y: 280 },
    { x: 138, y: 755 },
    { x: 380, y: 755 },
    { x: 600, y: 755 },
    { x: 838, y: 755 },
  ];

  for (const pos of samplePositions) {
    const lat = baseLat + (0.5 - pos.y / M) * 0.007;
    const lng = baseLng + (pos.x / M - 0.5) * 0.008;

    points.push({
      id: `GNSS-${String(gid).padStart(4, '0')}`,
      x: pos.x,
      y: pos.y,
      latitude: Math.round(lat * 100000) / 100000,
      longitude: Math.round(lng * 100000) / 100000,
      accuracy: 1.2,
      surveyDate: '18 May 2025',
      parcelId: parcels[gid % parcels.length]?.id || 'TN-CHN-W42-000184',
    });
    gid++;
  }

  return points;
}

export function generateTopologyIssues(parcels: Parcel[]): TopologyIssue[] {
  return [
    {
      id: 'T-0001',
      type: 'overlap',
      parcelIds: ['TN-CHN-W42-000115', 'TN-CHN-W42-000125'],
      description: 'Boundary overlap detected with adjoining parcel record',
      repaired: false,
    },
    {
      id: 'T-0002',
      type: 'gap',
      parcelIds: ['TN-CHN-W42-000102'],
      description: 'Boundary mismatch flagged against registry record',
      repaired: false,
    },
  ];
}

export function generateProjects(): Project[] {
  return [
    {
      id: 'PRJ-001',
      name: 'Chennai Ward 42',
      surveyArea: 'Ward 42, Central Zone',
      district: 'Chennai',
      state: 'Tamil Nadu',
      surveyDate: '18 May 2025',
      status: 'analysis_complete',
      progress: 94,
      areaKm2: 3.4,
      parcelsDetected: 12486,
      highConfidence: 11736,
      reviewRequired: 624,
      fieldVerification: 126,
      topologyErrors: 42,
      avgConfidence: 94.0,
      totalParcels: 12486,
      verifiedParcels: 11736,
      createdAt: '18 May 2025',
      gnssPointsCount: 428,
      center: [13.0827, 80.2707],
      zoom: 17,
      droneImage: '/drone_orthomosaic_ward42.jpg',
    },
    {
      id: 'PRJ-002',
      name: 'Jaipur Urban Cadastral Survey – Zone 04',
      surveyArea: 'Zone 04, Jaipur',
      district: 'Jaipur',
      state: 'Rajasthan',
      surveyDate: '28 Aug 2026',
      status: 'analysis_complete',
      progress: 78,
      areaKm2: 4.2,
      parcelsDetected: 1284,
      highConfidence: 1031,
      reviewRequired: 198,
      fieldVerification: 55,
      topologyErrors: 43,
      avgConfidence: 87.4,
      totalParcels: 1284,
      verifiedParcels: 1031,
      createdAt: '15 Aug 2026',
      gnssPointsCount: 312,
      center: [26.9124, 75.7873],
      zoom: 17,
      droneImage: '/drone_orthomosaic_ward42.jpg',
    },
  ];
}

export function generateNotifications(): AppNotification[] {
  return [
    { id: 'N1', type: 'warning', title: 'Review Required', message: '126 parcel boundaries flagged for verification in Chennai Ward 42.', time: '5 min ago', read: false },
    { id: 'N2', type: 'error', title: 'Topology Conflict', message: 'Overlap detected in TN-CHN-W42-000115.', time: '23 min ago', read: false },
    { id: 'N3', type: 'success', title: 'AI Extraction Ready', message: 'LAND-AI Model v2.1 feature extraction completed with 94% accuracy.', time: '1 hour ago', read: false },
    { id: 'N4', type: 'info', title: 'Dataset Uploaded', message: 'Orthomosaic (0.1m GSD) and DSM layers loaded successfully.', time: '2 hours ago', read: true },
  ];
}

export { surveyors };
export { getConfidenceLevel };
