import { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { apiService } from '@/services/apiService';
import {
  ScrollText, Shield, Filter, Search, RefreshCw, Clock,
  FolderKanban, CheckCircle2, AlertTriangle, ArrowRight,
} from 'lucide-react';
import { Card, KPICard, Button } from '@/components/UI';
import type { AuditLogRecord } from '@/types';

export default function AuditLogs() {
  const { activeProject } = useApp();
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchAction, setSearchAction] = useState('');
  const [projectFilter, setProjectFilter] = useState<string>('ALL');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  const defaultLogs: AuditLogRecord[] = [
    {
      id: 'LOG-INIT-01',
      timestamp: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
      userName: 'R. Senthil',
      role: 'SURVEYOR',
      projectId: 'PRJ-001',
      featureId: 'TN-CHN-W42-000184',
      action: 'PARCEL_VERIFY',
      previousState: 'READY_FOR_SURVEY_REVIEW',
      newState: 'VERIFIED',
      reasonNotes: 'Boundary cross-referenced with RTK CORS Rover CP-04; RMSE 0.18m within tolerance.',
    },
    {
      id: 'LOG-INIT-02',
      timestamp: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
      userName: 'A. Kumar',
      role: 'GIS_ANALYST',
      projectId: 'PRJ-001',
      featureId: 'TOP-CHN-004',
      action: 'TOPOLOGY_FIX_APPLIED',
      previousState: 'TOPOLOGY_INVALID (Gap 0.28m)',
      newState: 'TOPOLOGY_VALID',
      reasonNotes: 'Auto-snapped vertex to cadastral parcel lot 183 common wall.',
    },
    {
      id: 'LOG-INIT-03',
      timestamp: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
      userName: 'A. Kumar',
      role: 'GIS_ANALYST',
      projectId: 'PRJ-001',
      featureId: 'TN-CHN-W42-000184',
      action: 'GEOMETRY_CORRECTED',
      previousState: 'AI_GENERATED',
      newState: 'ANALYST_CORRECTED',
      reasonNotes: 'Refined southeastern boundary node to match orthomosaic roof boundary line.',
    },
    {
      id: 'LOG-INIT-04',
      timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
      userName: 'A. Kumar',
      role: 'GIS_ANALYST',
      projectId: 'PRJ-001',
      featureId: null,
      action: 'PROCESSING_STARTED',
      previousState: 'DATA_UPLOADED',
      newState: 'PROCESSING',
      reasonNotes: 'Initiated U-Net parcel segmentation and topology comparison pass.',
    },
    {
      id: 'LOG-INIT-05',
      timestamp: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
      userName: 'A. Sharma',
      role: 'ADMIN',
      projectId: 'PRJ-001',
      featureId: null,
      action: 'PROJECT_ASSIGNMENT',
      previousState: 'UNASSIGNED',
      newState: 'ASSIGNED',
      reasonNotes: 'Assigned A. Kumar (GIS Analyst) and R. Senthil (Surveyor) to Chennai Ward 42.',
    },
    {
      id: 'LOG-INIT-06',
      timestamp: new Date(Date.now() - 1000 * 60 * 720).toISOString(),
      userName: 'A. Sharma',
      role: 'ADMIN',
      projectId: 'PRJ-001',
      featureId: null,
      action: 'PROJECT_CREATED',
      previousState: 'NONE',
      newState: 'CREATED',
      reasonNotes: 'Created project Chennai Ward 42 Urban Cadastral Resurvey.',
    },
  ];

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await apiService.getAuditLogs();
      if (Array.isArray(data) && data.length > 0) {
        setLogs(
          data.map((d: any) => ({
            id: d.id,
            timestamp: d.timestamp,
            userId: d.user_id,
            userName: d.user_name || 'System',
            role: d.role || 'ADMIN',
            projectId: d.project_id,
            featureId: d.feature_id,
            action: d.action,
            previousState: d.previous_state,
            newState: d.new_state,
            reasonNotes: d.reason_notes,
          }))
        );
      } else {
        setLogs(defaultLogs);
      }
    } catch {
      setLogs(defaultLogs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter((log) => {
    const matchesAction =
      searchAction.trim() === '' ||
      log.action.toLowerCase().includes(searchAction.toLowerCase()) ||
      log.userName.toLowerCase().includes(searchAction.toLowerCase()) ||
      (log.featureId && log.featureId.toLowerCase().includes(searchAction.toLowerCase())) ||
      (log.reasonNotes && log.reasonNotes.toLowerCase().includes(searchAction.toLowerCase()));
    const matchesProject = projectFilter === 'ALL' || log.projectId === projectFilter;
    const matchesRole = roleFilter === 'ALL' || log.role === roleFilter;
    return matchesAction && matchesProject && matchesRole;
  });

  const getActionBadgeColor = (action: string) => {
    if (action.includes('VERIFY')) return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    if (action.includes('REJECT')) return 'bg-rose-100 text-rose-800 border-rose-300';
    if (action.includes('FIX') || action.includes('CORRECT')) return 'bg-blue-100 text-blue-800 border-blue-300';
    if (action.includes('ASSIGN') || action.includes('CREATED')) return 'bg-purple-100 text-purple-800 border-purple-300';
    return 'bg-amber-100 text-amber-800 border-amber-300';
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800">Immutable Audit Trail</h1>
            <span className="text-[11px] bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded-full border border-slate-300">
              TAMPER-PROOF
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Complete chronological record of all administrative, GIS processing, geometry editing, and cadastral verification actions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="md" onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh Trail
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Total Logged Events" value={logs.length} color="blue" icon={<ScrollText className="w-4 h-4" />} />
        <KPICard
          label="Surveyor Verifications"
          value={logs.filter((l) => l.action.includes('VERIFY')).length}
          color="emerald"
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
        <KPICard
          label="Analyst Corrections"
          value={logs.filter((l) => l.action.includes('CORRECT') || l.action.includes('FIX')).length}
          color="blue"
        />
        <KPICard
          label="Admin Governance Actions"
          value={logs.filter((l) => l.role === 'ADMIN').length}
          color="purple"
          icon={<Shield className="w-4 h-4" />}
        />
      </div>

      {/* Main Table Card */}
      <Card>
        {/* Filters */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[260px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by action, user, parcel ID, or reason..."
              value={searchAction}
              onChange={(e) => setSearchAction(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Filter className="w-3.5 h-3.5" />
              <span>Role:</span>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">All Roles</option>
                <option value="ADMIN">Admin</option>
                <option value="GIS_ANALYST">GIS Analyst</option>
                <option value="SURVEYOR">Surveyor</option>
              </select>
            </div>
          </div>
        </div>

        {/* Audit Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Operator</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Target Feature / Project</th>
                <th className="py-3 px-4">State Progression</th>
                <th className="py-3 px-4">Reason & Field Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-mono">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 font-sans">
                    No audit records match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 text-slate-500 text-[11px] whitespace-nowrap">
                      <div className="flex items-center gap-1.5 font-sans">
                        <Clock className="w-3 h-3 text-slate-400 flex-shrink-0" />
                        <span>{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                    </td>

                    <td className="py-3 px-4 font-sans">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-700">
                          {log.userName.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-slate-800 text-xs">{log.userName}</div>
                          <div className="text-[10px] text-slate-400">{log.role}</div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4 font-sans">
                      <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-md border ${getActionBadgeColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>

                    <td className="py-3 px-4 font-sans">
                      <div>
                        {log.featureId ? (
                          <div className="font-bold text-blue-600 text-xs">{log.featureId}</div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">-</span>
                        )}
                        {log.projectId && (
                          <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <FolderKanban className="w-2.5 h-2.5" />
                            <span>{log.projectId}</span>
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-4 text-[11px] font-sans">
                      {log.previousState || log.newState ? (
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <span className="text-slate-500 truncate max-w-[120px]" title={log.previousState || ''}>
                            {log.previousState || 'N/A'}
                          </span>
                          <ArrowRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
                          <span className="font-bold text-slate-800 truncate max-w-[120px]" title={log.newState || ''}>
                            {log.newState}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>

                    <td className="py-3 px-4 font-sans text-slate-600 text-[11px] max-w-xs">
                      <p className="line-clamp-2" title={log.reasonNotes || ''}>
                        {log.reasonNotes || 'No notes attached.'}
                      </p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
