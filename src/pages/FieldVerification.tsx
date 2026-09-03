import { useState, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import MapView from '@/components/MapView';
import { KPICard, Card, StatusBadge, PriorityBadge, ConfidenceBar, Button, AIDisclaimer } from '@/components/UI';
import type { Parcel } from '@/types';
import {
  ClipboardCheck, AlertTriangle, MapPin, CheckCircle2, User,
  Eye, FileText, ArrowLeft,
} from 'lucide-react';

export default function FieldVerification() {
  const {
    parcels, buildings, roads, gnssPoints, layers, selectedParcelId, setSelectedParcelId,
    submitVerification, assignSurveyor, surveyors, settings, updateChecklistItem, setCurrentPage,
    uploadedImage, imageBounds, orthoOpacity, getProjectCenter,
  } = useApp();

  const baseCenter = getProjectCenter();

  const [filterPriority, setFilterPriority] = useState('all');
  const [showDetail, setShowDetail] = useState(false);
  const [notes, setNotes] = useState('');
  const [showAssign, setShowAssign] = useState(false);

  const fieldParcels = useMemo(() => parcels.filter(p => p.status === 'field_verification' || p.verificationStatus === 'field_verification_required'), [parcels]);

  const filtered = useMemo(() => {
    if (filterPriority === 'all') return fieldParcels;
    return fieldParcels.filter(p => p.priority === filterPriority);
  }, [fieldParcels, filterPriority]);

  const selectedParcel = parcels.find(p => p.id === selectedParcelId);

  const handleSubmitVerification = () => {
    if (selectedParcel) {
      submitVerification(selectedParcel.id, notes, selectedParcel.checklist);
      // Sync with backend API
      import('@/services/apiService').then(({ apiService }) => {
        apiService.verifyFeature(selectedParcel.id, 'Ravi Kumar', notes, selectedParcel.checklist).catch(() => {});
      });
      setNotes('');
      setShowDetail(false);
    }
  };

  const handleAssign = (surveyorName: string) => {
    if (selectedParcel) {
      assignSurveyor(selectedParcel.id, surveyorName);
      setShowAssign(false);
    }
  };

  // Detail view
  if (showDetail && selectedParcel) {
    return (
      <FieldVerificationDetail
        parcel={selectedParcel}
        buildings={buildings}
        roads={roads}
        gnssPoints={gnssPoints}
        layers={layers}
        notes={notes}
        setNotes={setNotes}
        onChecklistItem={(item, value) => updateChecklistItem(selectedParcel.id, item, value)}
        onSubmit={handleSubmitVerification}
        onBack={() => setShowDetail(false)}
        surveyors={surveyors}
        onAssign={handleAssign}
        showAssign={showAssign}
        setShowAssign={setShowAssign}
        settings={settings}
      />
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Field Verification</h2>
        <p className="text-sm text-slate-500 mt-1">Parcels requiring physical inspection and surveyor verification.</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Pending Verification" value={fieldParcels.length} color="red" icon={<ClipboardCheck className="w-4 h-4" />} />
        <KPICard label="Critical Priority" value={fieldParcels.filter(p => p.priority === 'CRITICAL').length} color="red" icon={<AlertTriangle className="w-4 h-4" />} />
        <KPICard label="High Priority" value={fieldParcels.filter(p => p.priority === 'HIGH').length} color="amber" />
        <KPICard label="Assigned" value={fieldParcels.filter(p => p.assignedSurveyor).length} color="blue" icon={<User className="w-4 h-4" />} />
      </div>

      <Card title="Verification Queue" subtitle={`${filtered.length} parcels requiring field inspection`}>
        <div className="p-3 border-b border-slate-100 flex items-center gap-2">
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">All Priorities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-semibold">Parcel ID</th>
                <th className="text-left px-4 py-3 font-semibold">Issue</th>
                <th className="text-left px-4 py-3 font-semibold">Confidence</th>
                <th className="text-left px-4 py-3 font-semibold">Area Diff</th>
                <th className="text-left px-4 py-3 font-semibold">Priority</th>
                <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Assigned Surveyor</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-slate-400">No parcels require field verification.</td></tr>
              ) : filtered.map(p => {
                const areaDiffPct = Math.abs(((p.aiArea - p.existingArea) / p.existingArea) * 100);
                return (
                  <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-800">{p.id}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{p.topologyIssues[0] || p.conflictReasons[0] || 'Low confidence'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${p.confidence < 60 ? 'bg-red-500' : p.confidence < 80 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${p.confidence}%` }} />
                        </div>
                        <span className="text-xs font-bold text-slate-700">{p.confidence}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{areaDiffPct.toFixed(1)}%</td>
                    <td className="px-4 py-3"><PriorityBadge priority={p.priority} /></td>
                    <td className="px-4 py-3 text-xs text-slate-600 hidden md:table-cell">{p.assignedSurveyor || <span className="text-slate-400 italic">Unassigned</span>}</td>
                    <td className="px-4 py-3"><StatusBadge status={p.verificationStatus} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => { setSelectedParcelId(p.id); setShowDetail(true); }}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => { setSelectedParcelId(p.id); setShowAssign(true); setShowDetail(true); }}>
                          Assign
                        </Button>
                        <Button size="sm" variant="success" onClick={() => { setSelectedParcelId(p.id); setShowDetail(true); }}>
                          Verify
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <AIDisclaimer />
    </div>
  );
}

function FieldVerificationDetail({
  parcel, buildings, roads, gnssPoints, layers, notes, setNotes,
  onChecklistItem, onSubmit, onBack, surveyors, onAssign, showAssign, setShowAssign, settings,
}: {
  parcel: Parcel;
  buildings: import('@/types').Building[];
  roads: import('@/types').Road[];
  gnssPoints: import('@/types').GNSSPoint[];
  layers: import('@/types').LayerState;
  notes: string;
  setNotes: (v: string) => void;
  onChecklistItem: (item: keyof Parcel['checklist'], value: boolean) => void;
  onSubmit: () => void;
  onBack: () => void;
  surveyors: import('@/types').Surveyor[];
  onAssign: (name: string) => void;
  showAssign: boolean;
  setShowAssign: (v: boolean) => void;
  settings: import('@/context/AppContext').AppSettings;
}) {
  const { uploadedImage, imageBounds, orthoOpacity, getProjectCenter } = useApp();
  const baseCenter = getProjectCenter();
  const parcelGnssPoints = gnssPoints.filter(g => g.parcelId === parcel.id);
  const areaDiff = parcel.aiArea - parcel.existingArea;
  const areaDiffPct = parcel.existingArea > 0 ? Math.abs((areaDiff / parcel.existingArea) * 100) : 0;

  const checklistItems: { key: keyof Parcel['checklist']; label: string }[] = [
    { key: 'boundaryVerified', label: 'Boundary physically verified' },
    { key: 'existingRecordChecked', label: 'Existing record checked' },
    { key: 'gnssCollected', label: 'GNSS point collected' },
    { key: 'buildingChecked', label: 'Building/structure checked' },
    { key: 'neighborChecked', label: 'Neighboring parcel checked' },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Field Verification — {parcel.id}</h2>
            <p className="text-sm text-slate-500 mt-1">Compare AI boundary with existing record and GNSS survey data.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PriorityBadge priority={parcel.priority} />
          <StatusBadge status={parcel.verificationStatus} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map */}
        <div className="lg:col-span-2">
          <Card title="Comparison Map" subtitle="AI Boundary (blue) vs Existing Record (gray dashed) with GNSS points">
            <div className="p-4">
              <MapView
                parcels={[parcel]}
                buildings={buildings.filter(b => b.parcelId === parcel.id)}
                roads={roads}
                gnssPoints={parcelGnssPoints}
                layers={{ ...layers, droneOrthomosaic: true, aiParcelBoundaries: true, existingCadastralParcels: true, gnssPoints: true, buildings: true, conflictAreas: true }}
                selectedParcelId={parcel.id}
                onSelectParcel={() => {}}
                uploadedImage={uploadedImage}
                imageBounds={imageBounds}
                orthoOpacity={orthoOpacity}
                baseCenter={baseCenter}
                height="420px"
                showGrid={settings.showGrid}
              />
            </div>
          </Card>

          {/* Layer comparison cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="text-xs font-bold text-blue-700 uppercase mb-1">AI Boundary</div>
              <div className="text-sm font-bold text-slate-800">{parcel.aiArea} m²</div>
              <div className="text-xs text-slate-500">Preliminary prediction</div>
            </div>
            <div className="bg-slate-50 border border-slate-300 border-dashed rounded-lg p-3">
              <div className="text-xs font-bold text-slate-600 uppercase mb-1">Existing Record</div>
              <div className="text-sm font-bold text-slate-800">{parcel.existingArea} m²</div>
              <div className="text-xs text-slate-500">Cadastral database</div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="text-xs font-bold text-green-700 uppercase mb-1">GNSS Survey</div>
              <div className="text-sm font-bold text-slate-800">{parcelGnssPoints.length} points</div>
              <div className="text-xs text-slate-500">±2cm accuracy</div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="text-xs font-bold text-amber-700 uppercase mb-1">Building</div>
              <div className="text-sm font-bold text-slate-800">{parcel.hasBuilding ? 'Detected' : 'None'}</div>
              <div className="text-xs text-slate-500">AI feature extraction</div>
            </div>
          </div>
        </div>

        {/* Right panel: details + checklist */}
        <div className="space-y-4">
          {/* Key metrics */}
          <Card title="Key Metrics">
            <div className="p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">AI Confidence</span>
                <span className="font-bold text-slate-800">{parcel.confidence}%</span>
              </div>
              <ConfidenceBar value={parcel.confidence} showLabel={false} />
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-slate-500">Area Difference</span>
                <span className={`font-bold ${areaDiffPct > 10 ? 'text-red-600' : 'text-amber-600'}`}>{areaDiff > 0 ? '+' : ''}{areaDiff.toFixed(1)} m² ({areaDiffPct.toFixed(1)}%)</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Boundary Displacement</span>
                <span className="font-bold text-slate-700">{parcel.boundaryDisplacement} m</span>
              </div>
            </div>
          </Card>

          {/* GNSS Points */}
          {parcelGnssPoints.length > 0 && (
            <Card title="GNSS/CORS Points" subtitle={`${parcelGnssPoints.length} survey points`}>
              <div className="p-3 space-y-2">
                {parcelGnssPoints.map(pt => (
                  <div key={pt.id} className="bg-slate-50 rounded-lg p-2.5 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-slate-700">{pt.id}</span>
                      <span className="text-green-600 font-semibold">±{pt.accuracy} cm</span>
                    </div>
                    <div className="text-slate-500 font-mono">{pt.latitude}°N, {pt.longitude}°E</div>
                    <div className="text-slate-400 mt-0.5">{pt.surveyDate}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Assign surveyor */}
          <Card title="Assign Surveyor" action={
            <button onClick={() => setShowAssign(!showAssign)} className="text-xs text-blue-600 font-semibold">{showAssign ? 'Cancel' : 'Change'}</button>
          }>
            <div className="p-4">
              {showAssign ? (
                <div className="space-y-1.5">
                  {surveyors.map(s => (
                    <button
                      key={s.id}
                      onClick={() => onAssign(s.name)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${parcel.assignedSurveyor === s.name ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-slate-50'}`}
                    >
                      <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-white text-[10px] font-bold">{s.avatar}</div>
                      <div className="text-left">
                        <div className="font-semibold text-slate-800 text-xs">{s.name}</div>
                        <div className="text-[10px] text-slate-500">{s.role}</div>
                      </div>
                      {parcel.assignedSurveyor === s.name && <CheckCircle2 className="w-4 h-4 text-blue-600 ml-auto" />}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                    {parcel.assignedSurveyor ? parcel.assignedSurveyor.split(' ').map(n => n[0]).join('') : '?'}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{parcel.assignedSurveyor || 'Unassigned'}</div>
                    <div className="text-xs text-slate-500">{parcel.assignedSurveyor ? 'Assigned surveyor' : 'Click Change to assign'}</div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Verification checklist */}
          <Card title="Field Verification Checklist" subtitle="Complete all items before submission">
            <div className="p-4 space-y-2.5">
              {checklistItems.map(item => (
                <label key={item.key} className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={parcel.checklist[item.key]}
                    onChange={(e) => onChecklistItem(item.key, e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className={`text-sm ${parcel.checklist[item.key] ? 'text-slate-800 font-medium' : 'text-slate-600'}`}>{item.label}</span>
                </label>
              ))}
            </div>
          </Card>

          {/* Surveyor notes */}
          <Card title="Surveyor Notes">
            <div className="p-4">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Boundary wall physically exists approximately 1.8m east of existing GIS boundary."
                rows={4}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>
          </Card>

          {/* Submit */}
          <Button variant="success" size="lg" className="w-full" onClick={onSubmit}>
            <CheckCircle2 className="w-5 h-5" /> Submit Verification
          </Button>
        </div>
      </div>

      <AIDisclaimer />
    </div>
  );
}
