import { useState, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import MapView from '@/components/MapView';
import { KPICard, Card, PriorityBadge, StatusBadge, AIDisclaimer, Button } from '@/components/UI';
import { AlertTriangle, ArrowRight, MapPin, GitBranch, Layers, Eye } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const CONFLICT_TYPE_LABELS: Record<string, string> = {
  boundary_mismatch: 'Boundary Mismatch',
  area_mismatch: 'Area Mismatch',
  overlap: 'Overlap',
  gap: 'Gap',
  self_intersection: 'Self Intersection',
  missing_parcel: 'Missing Parcel',
  new_structure: 'New Structure',
};

export default function ConflictAnalysis() {
  const { parcels, buildings, roads, gnssPoints, layers, selectedParcelId, setSelectedParcelId, setCurrentPage, settings } = useApp();
  const [filterType, setFilterType] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');

  const conflictParcels = useMemo(() => parcels.filter(p => p.conflictType !== null), [parcels]);

  const filtered = useMemo(() => {
    return conflictParcels.filter(p => {
      if (filterType !== 'all' && p.conflictType !== filterType) return false;
      if (filterPriority !== 'all' && p.priority !== filterPriority) return false;
      return true;
    }).sort((a, b) => {
      const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }, [conflictParcels, filterType, filterPriority]);

  const stats = useMemo(() => ({
    total: conflictParcels.length,
    boundary: conflictParcels.filter(p => p.conflictType === 'boundary_mismatch').length,
    area: conflictParcels.filter(p => p.conflictType === 'area_mismatch').length,
    overlap: conflictParcels.filter(p => p.conflictType === 'overlap').length,
    gap: conflictParcels.filter(p => p.conflictType === 'gap').length,
    topology: conflictParcels.filter(p => p.conflictType === 'self_intersection').length,
    missing: conflictParcels.filter(p => p.conflictType === 'missing_parcel').length,
    newStructure: conflictParcels.filter(p => p.conflictType === 'new_structure').length,
  }), [conflictParcels]);

  const pieData = [
    { name: 'Boundary', value: stats.boundary, color: '#f59e0b' },
    { name: 'Area', value: stats.area, color: '#3b82f6' },
    { name: 'Overlap', value: stats.overlap, color: '#ef4444' },
    { name: 'Gap', value: stats.gap, color: '#8b5cf6' },
    { name: 'Topology', value: stats.topology, color: '#06b6d4' },
    { name: 'Missing', value: stats.missing, color: '#ec4899' },
    { name: 'New Structure', value: stats.newStructure, color: '#10b981' },
  ].filter(d => d.value > 0);

  const handleParcelClick = (id: string | null) => {
    setSelectedParcelId(id);
  };

  const selectedParcel = parcels.find(p => p.id === selectedParcelId);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Cadastral Conflict Analysis</h2>
        <p className="text-sm text-slate-500 mt-1">Detected inconsistencies between AI predictions and existing cadastral records.</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard label="Total Conflicts" value={stats.total} color="red" icon={<AlertTriangle className="w-4 h-4" />} />
        <KPICard label="Boundary Mismatches" value={stats.boundary} color="amber" />
        <KPICard label="Area Mismatches" value={stats.area} color="blue" />
        <KPICard label="Overlaps" value={stats.overlap} color="red" />
        <KPICard label="Gaps" value={stats.gap} color="slate" />
        <KPICard label="Topology Errors" value={stats.topology} color="slate" icon={<GitBranch className="w-4 h-4" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Map + chart */}
        <div className="lg:col-span-3 space-y-6">
          <Card title="Conflict Map" subtitle="Red-highlighted parcels have detected conflicts" action={
            <Button size="sm" variant="ghost" onClick={() => setCurrentPage('cadastral-map')}>Full Map <ArrowRight className="w-3 h-3" /></Button>
          }>
            <div className="p-4">
              <MapView
                parcels={conflictParcels}
                buildings={buildings}
                roads={roads}
                gnssPoints={gnssPoints}
                layers={layers}
                selectedParcelId={selectedParcelId}
                onSelectParcel={handleParcelClick}
                height="400px"
                highlightConflicts
                showGrid={settings.showGrid}
              />
            </div>
          </Card>

          <Card title="Conflict Type Distribution">
            <div className="p-4">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={35} paddingAngle={2}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                {pieData.map(d => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 rounded-sm" style={{ background: d.color }} />
                    <span className="text-slate-600">{d.name}</span>
                    <span className="font-bold text-slate-800 ml-auto">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* Conflict list + details */}
        <div className="lg:col-span-2 space-y-4">
          {/* Filters */}
          <Card title="Conflicts" subtitle={`${filtered.length} parcels`}>
            <div className="p-3 border-b border-slate-100 flex gap-2">
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="flex-1 px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">All Types</option>
                {Object.entries(CONFLICT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">All Priority</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>

            <div className="max-h-[300px] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-400">No conflicts match the selected filters.</div>
              ) : (
                filtered.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedParcelId(p.id)}
                    className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${selectedParcelId === p.id ? 'bg-blue-50' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-sm text-slate-800">{p.id}</span>
                      <PriorityBadge priority={p.priority} />
                    </div>
                    <div className="text-xs text-slate-600">{CONFLICT_TYPE_LABELS[p.conflictType!]}</div>
                    <div className="text-xs text-slate-400 mt-0.5">Confidence: {p.confidence}% · Area diff: {Math.abs(((p.aiArea - p.existingArea) / p.existingArea) * 100).toFixed(1)}%</div>
                  </button>
                ))
              )}
            </div>
          </Card>

          {/* Selected conflict details */}
          {selectedParcel && selectedParcel.conflictType && (
            <Card title="Conflict Details" subtitle={selectedParcel.id}>
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <StatusBadge status={selectedParcel.status} />
                  <PriorityBadge priority={selectedParcel.priority} />
                </div>

                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                    <span className="text-xs font-bold text-red-700 uppercase">Why is this flagged?</span>
                  </div>
                  <ul className="space-y-1">
                    {selectedParcel.conflictReasons.map((r, i) => (
                      <li key={i} className="text-xs text-red-800 flex items-start gap-1.5">
                        <span className="text-red-500 mt-0.5">✓</span> {r}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-50 rounded-lg p-2">
                    <div className="text-slate-500">Existing Area</div>
                    <div className="font-bold text-slate-700">{selectedParcel.existingArea} m²</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2">
                    <div className="text-slate-500">AI Area</div>
                    <div className="font-bold text-blue-600">{selectedParcel.aiArea} m²</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2">
                    <div className="text-slate-500">Boundary Diff</div>
                    <div className="font-bold text-slate-700">{selectedParcel.boundaryDisplacement} m</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2">
                    <div className="text-slate-500">Confidence</div>
                    <div className="font-bold text-slate-700">{selectedParcel.confidence}%</div>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="text-xs font-bold text-blue-700 uppercase mb-1">Recommendation</div>
                  <p className="text-xs text-blue-900">{selectedParcel.recommendation}</p>
                </div>

                <Button variant="primary" size="sm" className="w-full" onClick={() => setCurrentPage('cadastral-map')}>
                  <Eye className="w-3.5 h-3.5" /> View on Map
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Priority Queue */}
      <Card title="Surveyor Priority Queue" subtitle="Parcels sorted by risk — let AI find the problems, let the surveyor make the decision">
        <div className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(priority => {
              const list = conflictParcels.filter(p => p.priority === priority).slice(0, 5);
              const colors = {
                CRITICAL: 'border-red-500 bg-red-50',
                HIGH: 'border-orange-500 bg-orange-50',
                MEDIUM: 'border-amber-400 bg-amber-50',
                LOW: 'border-emerald-300 bg-emerald-50',
              };
              return (
                <div key={priority} className={`rounded-lg border-l-4 ${colors[priority]} p-3`}>
                  <div className="flex items-center justify-between mb-2">
                    <PriorityBadge priority={priority} />
                    <span className="text-xs text-slate-500">{list.length} parcels</span>
                  </div>
                  <div className="space-y-1">
                    {list.length === 0 ? (
                      <div className="text-xs text-slate-400">No parcels</div>
                    ) : list.map(p => (
                      <button
                        key={p.id}
                        onClick={() => { setSelectedParcelId(p.id); setCurrentPage('cadastral-map'); }}
                        className="w-full text-left text-xs font-medium text-slate-700 hover:text-blue-600 truncate block"
                      >
                        {p.id} — {p.conflictType ? CONFLICT_TYPE_LABELS[p.conflictType] : 'Review'}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <AIDisclaimer />
    </div>
  );
}
