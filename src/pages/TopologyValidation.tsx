import { useState, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import MapView from '@/components/MapView';
import { KPICard, Card, StatusBadge, Button, AIDisclaimer } from '@/components/UI';
import { GitBranch, CheckCircle2, AlertTriangle, Wrench, Eye, RotateCcw } from 'lucide-react';

const ISSUE_TYPE_LABELS: Record<string, string> = {
  overlap: 'Overlap',
  gap: 'Gap',
  self_intersection: 'Self Intersection',
  unclosed: 'Unclosed Geometry',
};

export default function TopologyValidation() {
  const { parcels, buildings, roads, gnssPoints, layers, selectedParcelId, setSelectedParcelId, repairTopology, topologyIssues, settings, setCurrentPage } = useApp();
  const [filterType, setFilterType] = useState<string>('all');

  const invalidParcels = useMemo(() => parcels.filter(p => p.topologyStatus === 'invalid'), [parcels]);
  const validParcels = parcels.filter(p => p.topologyStatus === 'valid').length;

  const stats = useMemo(() => ({
    total: parcels.length,
    valid: validParcels,
    invalid: invalidParcels.length,
    overlaps: parcels.filter(p => p.topologyIssues.some(i => i.includes('Overlap'))).length,
    gaps: parcels.filter(p => p.topologyIssues.some(i => i.includes('Gap'))).length,
    selfInt: parcels.filter(p => p.topologyIssues.some(i => i.includes('Self'))).length,
    unclosed: parcels.filter(p => p.topologyIssues.some(i => i.includes('Unclosed'))).length,
  }), [parcels, invalidParcels, validParcels]);

  const filteredInvalid = useMemo(() => {
    if (filterType === 'all') return invalidParcels;
    return invalidParcels.filter(p => p.topologyIssues.some(i => i.toLowerCase().includes(filterType)));
  }, [invalidParcels, filterType]);

  const selectedParcel = parcels.find(p => p.id === selectedParcelId);
  const selectedIssues = topologyIssues.filter(t => selectedParcelId && t.parcelIds.includes(selectedParcelId));

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Topology Validation</h2>
        <p className="text-sm text-slate-500 mt-1">Validate parcel geometry for overlaps, gaps, self-intersections, and unclosed polygons.</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard label="Total Polygons" value={stats.total} color="blue" icon={<GitBranch className="w-4 h-4" />} />
        <KPICard label="Valid" value={stats.valid} color="green" icon={<CheckCircle2 className="w-4 h-4" />} />
        <KPICard label="Invalid" value={stats.invalid} color="red" icon={<AlertTriangle className="w-4 h-4" />} />
        <KPICard label="Overlaps" value={stats.overlaps} color="amber" />
        <KPICard label="Gaps" value={stats.gaps} color="slate" />
        <KPICard label="Self-Intersections" value={stats.selfInt} color="slate" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Map */}
        <div className="lg:col-span-3 space-y-6">
          <Card title="Topology Map" subtitle="Invalid parcels highlighted in red" action={
            <Button size="sm" variant="ghost" onClick={() => setCurrentPage('cadastral-map')}>Full Map</Button>
          }>
            <div className="p-4">
              <MapView
                parcels={parcels}
                buildings={buildings}
                roads={roads}
                gnssPoints={gnssPoints}
                layers={layers}
                selectedParcelId={selectedParcelId}
                onSelectParcel={setSelectedParcelId}
                height="400px"
                highlightConflicts
                showGrid={settings.showGrid}
              />
            </div>
          </Card>

          {/* Selected parcel topology details */}
          {selectedParcel && (
            <Card title={`Topology Issues — ${selectedParcel.id}`} subtitle={selectedParcel.topologyStatus === 'valid' ? 'No issues detected' : 'Issues require attention'}>
              <div className="p-5 space-y-3">
                {selectedParcel.topologyStatus === 'valid' ? (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="font-semibold text-sm">All topology checks passed. Geometry is valid.</span>
                  </div>
                ) : (
                  <>
                    {selectedParcel.topologyIssues.map((issue, i) => (
                      <div key={i} className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <div className="text-sm font-semibold text-red-800">{issue}</div>
                            {selectedIssues[i] && selectedIssues[i].parcelIds.length > 1 && (
                              <div className="text-xs text-red-600 mt-1">
                                Affected parcels: {selectedIssues[i].parcelIds.join(', ')}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Repair simulation */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="text-xs font-bold text-blue-700 uppercase mb-2">Repair Options</div>
                      <p className="text-xs text-blue-900 mb-3">
                        Auto Repair will optimize shared boundaries between adjacent parcels, eliminate overlaps, and close gaps using topology-aware reconstruction.
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="primary" onClick={() => repairTopology(selectedParcel.id)}>
                          <Wrench className="w-3.5 h-3.5" /> Auto Repair
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setCurrentPage('cadastral-map')}>Manual Edit</Button>
                        <Button size="sm" variant="ghost">Ignore</Button>
                      </div>
                    </div>

                    <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2.5">
                      <strong>Shared Boundary Logic:</strong> When two parcels share a boundary, the system treats it as a shared edge.
                      Auto Repair reconstructs the topology to eliminate duplicated/independent lines between neighboring parcels.
                    </div>
                  </>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* Issue list */}
        <div className="lg:col-span-2">
          <Card title="Invalid Parcels" subtitle={`${filteredInvalid.length} requiring repair`}>
            <div className="p-3 border-b border-slate-100">
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">All Issue Types</option>
                <option value="overlap">Overlaps</option>
                <option value="gap">Gaps</option>
                <option value="self">Self-Intersections</option>
                <option value="unclosed">Unclosed Geometries</option>
              </select>
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              {filteredInvalid.length === 0 ? (
                <div className="p-6 text-center">
                  <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2" />
                  <div className="text-sm font-semibold text-slate-600">No topology issues</div>
                  <div className="text-xs text-slate-400 mt-1">All parcels pass validation.</div>
                </div>
              ) : (
                filteredInvalid.map(p => {
                  const issues = topologyIssues.filter(t => t.parcelIds.includes(p.id));
                  const allRepaired = issues.length > 0 && issues.every(t => t.repaired);
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedParcelId(p.id)}
                      className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${selectedParcelId === p.id ? 'bg-blue-50' : ''}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-sm text-slate-800">{p.id}</span>
                        <StatusBadge status={p.topologyStatus} />
                      </div>
                      <div className="text-xs text-slate-600">
                        {p.topologyIssues.map((issue, i) => (
                          <div key={i} className="flex items-center gap-1 mt-0.5">
                            <AlertTriangle className="w-3 h-3 text-red-500" />
                            {issue}
                          </div>
                        ))}
                      </div>
                      {allRepaired && (
                        <div className="text-xs text-green-600 mt-1 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Repaired
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
            {filteredInvalid.length > 0 && (
              <div className="p-3 border-t border-slate-100">
                <Button size="sm" variant="secondary" className="w-full" onClick={() => filteredInvalid.forEach(p => repairTopology(p.id))}>
                  <RotateCcw className="w-3.5 h-3.5" /> Repair All ({filteredInvalid.length})
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>

      <AIDisclaimer />
    </div>
  );
}
