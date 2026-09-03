import { useApp } from '@/context/AppContext';
import MapView from '@/components/MapView';
import { KPICard, Card, AIDisclaimer, Button, StatusBadge } from '@/components/UI';
import {
  FolderKanban, Layers, BadgeCheck, AlertTriangle, MapPin, GitBranch,
  ArrowRight, TrendingUp, Clock,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar,
} from 'recharts';

export default function Dashboard() {
  const {
    parcels, buildings, roads, gnssPoints, layers, selectedParcelId,
    setSelectedParcelId, setCurrentPage, activeProject, settings,
    uploadedImage, imageBounds, orthoOpacity, getProjectCenter,
  } = useApp();

  const baseCenter = getProjectCenter();

  const verified = parcels.filter(p => p.status === 'verified').length;
  const aiPrelim = parcels.filter(p => p.status === 'ai_preliminary').length;
  const review = parcels.filter(p => p.status === 'requires_review').length;
  const fieldVerif = parcels.filter(p => p.status === 'field_verification').length;

  const statusData = [
    { name: 'Verified', value: verified, color: '#16a34a' },
    { name: 'AI Accepted', value: aiPrelim, color: '#2563eb' },
    { name: 'Review Required', value: review, color: '#d97706' },
    { name: 'Field Verification', value: fieldVerif, color: '#dc2626' },
  ];

  const conflicts = parcels.filter(p => p.conflictType !== null);
  const conflictTypeData = [
    { name: 'Boundary', value: conflicts.filter(p => p.conflictType === 'boundary_mismatch').length, color: '#f59e0b' },
    { name: 'Area', value: conflicts.filter(p => p.conflictType === 'area_mismatch').length, color: '#3b82f6' },
    { name: 'Overlap', value: conflicts.filter(p => p.conflictType === 'overlap').length, color: '#ef4444' },
    { name: 'Gap', value: conflicts.filter(p => p.conflictType === 'gap').length, color: '#8b5cf6' },
    { name: 'Topology', value: conflicts.filter(p => p.conflictType === 'self_intersection').length, color: '#06b6d4' },
    { name: 'Missing', value: conflicts.filter(p => p.conflictType === 'missing_parcel').length, color: '#ec4899' },
  ];

  const confidenceData = [
    { name: 'High (80-100%)', value: parcels.filter(p => p.confidence >= 80).length, fill: '#2563eb' },
    { name: 'Medium (60-79%)', value: parcels.filter(p => p.confidence >= 60 && p.confidence < 80).length, fill: '#d97706' },
    { name: 'Low (<60%)', value: parcels.filter(p => p.confidence < 60).length, fill: '#dc2626' },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const handleParcelClick = (id: string | null) => {
    setSelectedParcelId(id);
    if (id) setCurrentPage('cadastral-map');
  };

  const selectedParcel = parcels.find(p => p.id === selectedParcelId);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{greeting}, Surveyor</h2>
          <p className="text-sm text-slate-500 mt-1">Here's the status of your cadastral mapping projects.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="md" onClick={() => setCurrentPage('new-survey')}>
            New Survey
          </Button>
          <Button variant="primary" size="md" onClick={() => setCurrentPage('cadastral-map')}>
            Open Map <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Value proposition banner */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-5 text-white flex items-center justify-between flex-wrap gap-4">
        <div className="max-w-2xl">
          <div className="text-lg font-bold mb-1">From manual parcel inspection to intelligent survey prioritization.</div>
          <div className="text-sm text-blue-100">
            CadastraAI uses aerial imagery, AI-based feature extraction, GIS comparison, topology validation and field verification workflows to help surveyors identify where attention is needed.
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold">{parcels.length}</div>
          <div className="text-xs text-blue-200">Parcels in active project</div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard label="Total Projects" value={12} color="blue" icon={<FolderKanban className="w-4 h-4" />} />
        <KPICard label="Parcels Processed" value="4,826" color="slate" icon={<Layers className="w-4 h-4" />} />
        <KPICard label="Verified" value="3,917" color="green" icon={<BadgeCheck className="w-4 h-4" />} trend="81% acceptance rate" />
        <KPICard label="Requiring Review" value={682} color="amber" icon={<AlertTriangle className="w-4 h-4" />} />
        <KPICard label="Field Verification" value={227} color="red" icon={<MapPin className="w-4 h-4" />} />
        <KPICard label="Topology Errors" value={43} color="slate" icon={<GitBranch className="w-4 h-4" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active project card */}
        <Card className="lg:col-span-1" title="Active Project" subtitle="Currently in review">
          <div className="p-5">
            <div className="mb-4">
              <div className="font-bold text-slate-800 text-sm">{activeProject?.name || 'Jaipur Urban Cadastral Survey – Zone 04'}</div>
              <div className="flex items-center gap-2 mt-1.5">
                <StatusBadge status="analysis_complete" label="AI Analysis Completed" />
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-600">Progress</span>
                <span className="text-xs font-bold text-blue-600">{activeProject?.progress || 78}%</span>
              </div>
              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500" style={{ width: `${activeProject?.progress || 78}%` }} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-slate-50 rounded-lg p-2.5">
                <div className="text-xs text-slate-500">Area</div>
                <div className="font-bold text-slate-800">{activeProject?.areaKm2 || 4.2} km²</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-2.5">
                <div className="text-xs text-slate-500">Parcels Detected</div>
                <div className="font-bold text-slate-800">{activeProject?.parcelsDetected || 1284}</div>
              </div>
              <div className="bg-green-50 rounded-lg p-2.5">
                <div className="text-xs text-green-600">High Confidence</div>
                <div className="font-bold text-green-700">{activeProject?.highConfidence || 1031}</div>
              </div>
              <div className="bg-amber-50 rounded-lg p-2.5">
                <div className="text-xs text-amber-600">Review Required</div>
                <div className="font-bold text-amber-700">{activeProject?.reviewRequired || 198}</div>
              </div>
              <div className="bg-red-50 rounded-lg p-2.5">
                <div className="text-xs text-red-600">Field Verification</div>
                <div className="font-bold text-red-700">{activeProject?.fieldVerification || 55}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-2.5">
                <div className="text-xs text-slate-500">Avg Confidence</div>
                <div className="font-bold text-slate-800">{activeProject?.avgConfidence || 87.4}%</div>
              </div>
            </div>

            <Button variant="primary" className="w-full mt-4" onClick={() => setCurrentPage('cadastral-map')}>
              Open Survey <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </Card>

        {/* Dashboard map */}
        <Card className="lg:col-span-2" title="Parcel Map Overview" subtitle="Click any parcel to view details" action={
          <Button variant="ghost" size="sm" onClick={() => setCurrentPage('cadastral-map')}>Full Map <ArrowRight className="w-3 h-3" /></Button>
        }>
          <div className="p-4">
            <MapView
              parcels={parcels}
              buildings={buildings}
              roads={roads}
              gnssPoints={gnssPoints}
              layers={layers}
              selectedParcelId={selectedParcelId}
              onSelectParcel={handleParcelClick}
              uploadedImage={uploadedImage}
              imageBounds={imageBounds}
              orthoOpacity={orthoOpacity}
              baseCenter={baseCenter}
              height="340px"
              showGrid={settings.showGrid}
            />
            {selectedParcel && (
              <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="font-bold text-slate-800 text-sm">{selectedParcel.id}</div>
                  <StatusBadge status={selectedParcel.status} />
                  <span className="text-xs text-slate-600">Confidence: <strong>{selectedParcel.confidence}%</strong></span>
                  <span className="text-xs text-slate-600">Area: <strong>{selectedParcel.aiArea} m²</strong></span>
                </div>
                <Button size="sm" variant="primary" onClick={() => setCurrentPage('cadastral-map')}>View Details</Button>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Analytics charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Parcel Status" subtitle="Distribution by verification state">
          <div className="p-4">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={2}>
                  {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {statusData.map(s => (
                <div key={s.name} className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-sm" style={{ background: s.color }} />
                  <span className="text-slate-600">{s.name}</span>
                  <span className="font-bold text-slate-800 ml-auto">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card title="Conflict Types" subtitle="Detected inconsistencies">
          <div className="p-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={conflictTypeData} layout="vertical" margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} width={70} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} cursor={{ fill: 'rgba(148,163,184,0.1)' }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {conflictTypeData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="AI Confidence Distribution" subtitle="Prediction confidence levels">
          <div className="p-4">
            <ResponsiveContainer width="100%" height={220}>
              <RadialBarChart data={confidenceData} innerRadius="30%" outerRadius="100%" startAngle={90} endAngle={-270}>
                <RadialBar dataKey="value" cornerRadius={6} background />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-2">
              {confidenceData.map(c => (
                <div key={c.name} className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-sm" style={{ background: c.fill }} />
                  <span className="text-slate-600">{c.name}</span>
                  <span className="font-bold text-slate-800 ml-auto">{c.value} parcels</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Survey progress comparison */}
      <Card title="Survey Progress" subtitle="Illustrative prototype estimate — not scientifically validated">
        <div className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center">
                  <Clock className="w-4 h-4 text-slate-600" />
                </div>
                <div>
                  <div className="font-bold text-slate-800 text-sm">Without CadastraAI</div>
                  <div className="text-xs text-slate-500">100% manual workflow</div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Manual inspection</span><span className="font-bold">1,000 parcels</span>
                </div>
                <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-slate-400 rounded-full" style={{ width: '100%' }} />
                </div>
                <div className="text-xs text-slate-500">Surveyor manually inspects every parcel, identifies errors, performs field verification, corrects GIS.</div>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <div className="font-bold text-slate-800 text-sm">With CadastraAI</div>
                  <div className="text-xs text-slate-500">AI-assisted prioritization</div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>AI analyzes all</span><span className="font-bold">1,000 parcels</span>
                </div>
                <div className="h-3 bg-slate-200 rounded-full overflow-hidden flex">
                  <div className="h-full bg-green-500" style={{ width: '80%' }} title="Auto-accepted" />
                  <div className="h-full bg-amber-500" style={{ width: '12%' }} title="Review" />
                  <div className="h-full bg-red-500" style={{ width: '8%' }} title="Field verification" />
                </div>
                <div className="flex gap-3 text-[10px] text-slate-500">
                  <span><span className="inline-block w-2 h-2 bg-green-500 rounded-sm mr-1" />~880 auto-accepted</span>
                  <span><span className="inline-block w-2 h-2 bg-amber-500 rounded-sm mr-1" />~120 review</span>
                  <span><span className="inline-block w-2 h-2 bg-red-500 rounded-sm mr-1" />~55 field verif.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <AIDisclaimer />
    </div>
  );
}
