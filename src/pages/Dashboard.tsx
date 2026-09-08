import { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import MapView from '@/components/MapView';
import { KPICard, Card, AIDisclaimer, Button, StatusBadge } from '@/components/UI';
import {
  FolderKanban, Layers, AlertTriangle, MapPin, GitBranch,
  ArrowRight, Users, Shield, Cpu, Clock, CheckCircle2,
  HardDrive, FileText, Plus, Database, Sparkles,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { UserRole } from '@/types';
import { apiService } from '@/services/apiService';

export default function Dashboard() {
  const {
    userRole, currentUser, parcels, buildings, roads, gnssPoints, layers,
    selectedParcelId, setSelectedParcelId, setCurrentPage, activeProject,
    projects, settings, uploadedImage, imageBounds, orthoOpacity, getProjectCenter,
  } = useApp();

  const baseCenter = getProjectCenter();
  const [recentLogs, setRecentLogs] = useState<any[]>([]);

  useEffect(() => {
    apiService.getAuditLogs({ limit: 6 as any }).then(setRecentLogs).catch(() => {});
  }, []);

  const verified = parcels.filter(p => p.status === 'verified' || p.status === 'VERIFIED').length;
  const aiPrelim = parcels.filter(p => p.status === 'ai_preliminary' || p.status === 'AI_GENERATED').length;
  const review = parcels.filter(p => p.status === 'requires_review' || p.status === 'READY_FOR_SURVEY_REVIEW').length;
  const fieldVerif = parcels.filter(p => p.status === 'field_verification' || p.status === 'FIELD_CHECK_REQUIRED').length;
  const conflicts = parcels.filter(p => p.conflictType !== null);
  const topologyInvalid = parcels.filter(p => p.topologyStatus === 'invalid').length;

  const statusData = [
    { name: 'Verified', value: verified, color: '#16a34a' },
    { name: 'AI Accepted', value: aiPrelim, color: '#2563eb' },
    { name: 'Review Required', value: review, color: '#d97706' },
    { name: 'Field Verification', value: fieldVerif, color: '#dc2626' },
  ];

  const confidenceData = [
    { name: 'High (80-100%)', value: parcels.filter(p => p.confidence >= 80).length, fill: '#2563eb' },
    { name: 'Medium (60-79%)', value: parcels.filter(p => p.confidence >= 60 && p.confidence < 80).length, fill: '#d97706' },
    { name: 'Low (<60%)', value: parcels.filter(p => p.confidence < 60).length, fill: '#dc2626' },
  ];

  const handleParcelClick = (id: string | null) => {
    setSelectedParcelId(id);
    if (id) setCurrentPage('cadastral-map');
  };

  const selectedParcel = parcels.find(p => p.id === selectedParcelId);

  // --------------------------------------------------------------------------
  // 1. ADMIN DASHBOARD VIEW
  // --------------------------------------------------------------------------
  if (userRole === 'ADMIN') {
    return (
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        {/* Admin Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-800">Platform Governance Dashboard</h1>
              <span className="text-[11px] bg-purple-100 text-purple-800 border border-purple-200 font-bold px-2 py-0.5 rounded-full">
                ADMIN
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              High-level overview of CadastraAI infrastructure, active projects, user roles, and system activity.
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" size="md" onClick={() => setCurrentPage('users')}>
              <Users className="w-4 h-4" /> Manage Users
            </Button>
            <Button variant="primary" size="md" onClick={() => setCurrentPage('projects')}>
              <FolderKanban className="w-4 h-4" /> All Projects
            </Button>
          </div>
        </div>

        {/* System & Project Metrics Banner */}
        <div className="bg-gradient-to-r from-purple-900 via-slate-900 to-indigo-950 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-6 shadow-md">
          <div className="max-w-xl">
            <div className="text-xs uppercase tracking-wider text-purple-300 font-bold mb-1">CadastraAI Enterprise</div>
            <div className="text-xl font-bold mb-1.5">State Land Records & Cadastral AI Infrastructure</div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Monitoring 3 platform roles: Admin (Governance), GIS Analyst (Technical Ingestion & Processing), and Surveyor (Legal Boundary Verification).
            </p>
          </div>

          <div className="flex items-center gap-6 border-l border-white/10 pl-6">
            <div>
              <div className="text-2xl font-bold">{projects.length}</div>
              <div className="text-[11px] text-purple-200">Total Projects</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-400">3</div>
              <div className="text-[11px] text-purple-200">Active Roles</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-400">100%</div>
              <div className="text-[11px] text-purple-200">RBAC Enforcement</div>
            </div>
          </div>
        </div>

        {/* 4 Summary Groups */}
        <div className="space-y-4">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Project & User Summary</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard label="Total Projects" value={projects.length} color="blue" icon={<FolderKanban className="w-4 h-4" />} />
            <KPICard label="Active Surveys" value={projects.filter(p => p.status !== 'completed').length} color="purple" />
            <KPICard label="Platform Users" value={5} color="blue" icon={<Users className="w-4 h-4" />} />
            <KPICard label="Active Accounts" value={4} color="emerald" icon={<Shield className="w-4 h-4" />} />
          </div>

          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Processing & Validation Status</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard label="Parcels Awaiting Review" value={review} color="amber" icon={<AlertTriangle className="w-4 h-4" />} />
            <KPICard label="Topology Issues" value={topologyInvalid} color="amber" icon={<GitBranch className="w-4 h-4" />} />
            <KPICard label="Field Checks Required" value={fieldVerif} color="red" />
            <KPICard label="Verified Cadastral Lots" value={verified} color="emerald" icon={<CheckCircle2 className="w-4 h-4" />} />
          </div>
        </div>

        {/* Admin Quick Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Recent Platform Operations */}
          <Card title="Recent Activity Trail" subtitle="Traceable platform events" className="lg:col-span-2">
            <div className="p-4 space-y-3">
              {recentLogs.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  Loading recent platform events...
                </div>
              ) : (
                recentLogs.map((log: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-md bg-purple-100 text-purple-800 font-bold flex items-center justify-center text-[10px] flex-shrink-0">
                        {log.role?.slice(0, 2) || 'AD'}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 truncate">{log.action}</div>
                        <div className="text-[10px] text-slate-400 truncate">{log.reason_notes || log.user_name}</div>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap ml-2">
                      {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}
                    </span>
                  </div>
                ))
              )}
              <div className="pt-2">
                <button
                  onClick={() => setCurrentPage('audit-logs')}
                  className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1 cursor-pointer"
                >
                  View Full Audit Log <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </Card>

          {/* Model Availability & Tolerances */}
          <Card title="Model & Infrastructure Status" subtitle="Hardware & deep-learning checks">
            <div className="p-4 space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-slate-700">U-Net Parcel Boundary</span>
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                    NOT CONFIGURED
                  </span>
                </div>
                <div className="text-[10px] text-slate-500">Awaiting trained checkpoint weights (PyTorch).</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-slate-700">SegFormer Footprints</span>
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                    NOT CONFIGURED
                  </span>
                </div>
                <div className="text-[10px] text-slate-500">Structural segmentation interface ready.</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-slate-700">DeepLabV3+ Roads</span>
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                    NOT CONFIGURED
                  </span>
                </div>
                <div className="text-[10px] text-slate-500">Road corridor extractor pending.</div>
              </div>

              <div className="pt-2 flex items-center justify-between text-[11px] text-slate-500">
                <span>Database: SQLite / PostGIS</span>
                <span className="font-bold text-emerald-600">CONNECTED</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // 2. GIS ANALYST DASHBOARD VIEW
  // --------------------------------------------------------------------------
  if (userRole === 'GIS_ANALYST') {
    return (
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        {/* Analyst Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-800">Geospatial Processing Workspace</h1>
              <span className="text-[11px] bg-blue-100 text-blue-800 border border-blue-200 font-bold px-2 py-0.5 rounded-full">
                GIS ANALYST
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Multi-input dataset ingestion, AI inference execution, geometric boundary adjustments, and topology fixes.
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" size="md" onClick={() => setCurrentPage('new-survey')}>
              <Plus className="w-4 h-4" /> Upload Inputs
            </Button>
            <Button variant="primary" size="md" onClick={() => setCurrentPage('cadastral-map')}>
              Open WebGIS <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Analyst KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard label="Assigned Projects" value={projects.length} color="blue" icon={<FolderKanban className="w-4 h-4" />} />
          <KPICard label="Preliminary Parcels" value={parcels.length} color="blue" />
          <KPICard label="Topology Conflicts" value={topologyInvalid} color="amber" icon={<GitBranch className="w-4 h-4" />} />
          <KPICard label="Ready for Survey Review" value={review} color="purple" icon={<CheckCircle2 className="w-4 h-4" />} />
        </div>

        {/* AI Model Calibration Cards (Truthfulness Notice) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">AI Model Integration Status</span>
            <span className="text-[10px] text-slate-500 font-mono">Zero synthetic fallback mode active</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-800">U-Net Parcel Model</span>
                <span className="text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full">
                  NOT CONFIGURED
                </span>
              </div>
              <p className="text-xs text-slate-500 mb-2">
                Cadastral parcel boundary segmenter. Awaiting trained checkpoint weights.
              </p>
              <div className="text-[10px] text-slate-400 font-mono">Interface: Ready (FastAPI / PyTorch)</div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-800">SegFormer Feature Model</span>
                <span className="text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full">
                  NOT CONFIGURED
                </span>
              </div>
              <p className="text-xs text-slate-500 mb-2">
                Structural building footprint extractor with nDSM height provenance.
              </p>
              <div className="text-[10px] text-slate-400 font-mono">Interface: Ready (FastAPI / PyTorch)</div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-800">DeepLabV3+ Road Model</span>
                <span className="text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full">
                  NOT CONFIGURED
                </span>
              </div>
              <p className="text-xs text-slate-500 mb-2">
                Road corridor centerlines and access lane extractor.
              </p>
              <div className="text-[10px] text-slate-400 font-mono">Interface: Ready (FastAPI / PyTorch)</div>
            </div>
          </div>
        </div>

        {/* Technical Work Queue */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card title="Features Requiring Analyst Correction" subtitle="Boundary adjustments and GIS differences">
            <div className="divide-y divide-slate-100 text-xs">
              {conflicts.slice(0, 5).map(c => (
                <div key={c.id} className="p-3 flex items-center justify-between hover:bg-slate-50">
                  <div>
                    <div className="font-bold text-slate-800">{c.id}</div>
                    <div className="text-[11px] text-amber-700">{c.conflictType || 'Boundary Displacement'}</div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => { setSelectedParcelId(c.id); setCurrentPage('cadastral-map'); }}>
                    Correct in WebGIS
                  </Button>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Topology Repair Queue" subtitle="Gaps, overlaps, and sliver fixes">
            <div className="divide-y divide-slate-100 text-xs">
              {parcels.filter(p => p.topologyStatus === 'invalid').slice(0, 5).map(p => (
                <div key={p.id} className="p-3 flex items-center justify-between hover:bg-slate-50">
                  <div>
                    <div className="font-bold text-slate-800">{p.id}</div>
                    <div className="text-[11px] text-rose-600 font-semibold">{p.topologyIssues?.[0] || 'Topology inconsistency'}</div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setCurrentPage('topology')}>
                    Repair Fix
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // 3. SURVEYOR / REVIEWER DASHBOARD VIEW (PRESERVED & INTEGRATED)
  // --------------------------------------------------------------------------
  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Surveyor Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800">Cadastral Review & Verification Queue</h1>
            <span className="text-[11px] bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold px-2 py-0.5 rounded-full">
              SURVEYOR / REVIEWER
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Official surveyor review: Cross-reference AI/analyst parcels with Ground Truth, GNSS RTK, and field observations.
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" size="md" onClick={() => setCurrentPage('field-verification')}>
            Field Checks
          </Button>
          <Button variant="primary" size="md" onClick={() => setCurrentPage('cadastral-map')}>
            Survey Review Map <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Surveyor Verification Banner */}
      <div className="bg-gradient-to-r from-emerald-800 to-teal-900 rounded-2xl p-5 text-white flex items-center justify-between flex-wrap gap-4 shadow-sm">
        <div className="max-w-2xl">
          <div className="text-base font-bold mb-1">Human-in-the-Loop Cadastral Certification</div>
          <div className="text-xs text-emerald-100 leading-relaxed">
            AI preliminary boundaries are decision-support predictions. Only authorized licensed Surveyors can execute VERIFY, REQUEST CORRECTION, REJECT, or FIELD CHECK REQUIRED.
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold">{verified}</div>
          <div className="text-xs text-emerald-200">Verified Lots</div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard label="Assigned Project" value={activeProject?.name?.slice(0, 14) || "Chennai Ward 42"} color="blue" icon={<FolderKanban className="w-4 h-4" />} />
        <KPICard label="Total Parcels" value={parcels.length} color="blue" icon={<Layers className="w-4 h-4" />} />
        <KPICard label="Awaiting Review" value={review} color="amber" icon={<AlertTriangle className="w-4 h-4" />} />
        <KPICard label="Field Checks" value={fieldVerif} color="red" />
        <KPICard label="Verified Lots" value={verified} color="emerald" icon={<CheckCircle2 className="w-4 h-4" />} />
        <KPICard label="GNSS Points" value={gnssPoints.length} color="blue" icon={<MapPin className="w-4 h-4" />} />
      </div>

      {/* Charts & Interactive Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card title="Verification Status" subtitle="Breakdown of parcels in current project">
          <div className="h-56 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={4} dataKey="value">
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Priority Review Queue" subtitle="Parcels requiring immediate surveyor attention" className="lg:col-span-2">
          <div className="divide-y divide-slate-100 text-xs max-h-60 overflow-y-auto">
            {parcels.filter(p => p.status === 'requires_review' || p.status === 'field_verification').slice(0, 6).map(p => (
              <div key={p.id} className="p-3 flex items-center justify-between hover:bg-slate-50">
                <div>
                  <div className="font-bold text-slate-800">{p.id}</div>
                  <div className="text-[11px] text-slate-500">Area: {p.aiArea} m² • Status: {p.status}</div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => { setSelectedParcelId(p.id); setCurrentPage('cadastral-map'); }}>
                  Review Parcel
                </Button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
