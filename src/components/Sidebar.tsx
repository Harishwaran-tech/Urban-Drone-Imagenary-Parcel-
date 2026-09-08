import { useApp } from '@/context/AppContext';
import type { PageId, UserRole } from '@/types';
import {
  LayoutDashboard, FolderKanban, PlusCircle, Map, AlertTriangle,
  ClipboardCheck, GitBranch, FileText, Settings, LogOut, MapPin,
  Users, ScrollText, Cpu, Shield,
} from 'lucide-react';

interface NavItem {
  id: PageId;
  label: string;
  icon: typeof LayoutDashboard;
}

const ADMIN_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Admin Dashboard', icon: LayoutDashboard },
  { id: 'projects', label: 'All Projects', icon: FolderKanban },
  { id: 'users', label: 'User Management', icon: Users },
  { id: 'audit-logs', label: 'Audit Logs', icon: ScrollText },
  { id: 'settings', label: 'Validation Settings', icon: Settings },
];

const ANALYST_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Analyst Dashboard', icon: LayoutDashboard },
  { id: 'projects', label: 'Assigned Projects', icon: FolderKanban },
  { id: 'new-survey', label: 'Project Inputs', icon: PlusCircle },
  { id: 'ai-processing', label: 'AI Processing', icon: Cpu },
  { id: 'cadastral-map', label: '2D WebGIS & 3D', icon: Map },
  { id: 'conflicts', label: 'Conflicts & GIS Diff', icon: AlertTriangle },
  { id: 'topology', label: 'Topology Workspace', icon: GitBranch },
  { id: 'reports', label: 'Reports & Exports', icon: FileText },
  { id: 'settings', label: 'Preferences', icon: Settings },
];

const SURVEYOR_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Surveyor Dashboard', icon: LayoutDashboard },
  { id: 'projects', label: 'Assigned Projects', icon: FolderKanban },
  { id: 'cadastral-map', label: 'Survey Review WebGIS', icon: Map },
  { id: 'field-verification', label: 'Ground Truth & GNSS', icon: ClipboardCheck },
  { id: 'conflicts', label: 'Review Queue & Notes', icon: AlertTriangle },
  { id: 'reports', label: 'Survey Dossier', icon: FileText },
  { id: 'settings', label: 'Preferences', icon: Settings },
];

export default function Sidebar() {
  const { currentPage, setCurrentPage, logout, activeProject, parcels, userRole, currentUser } = useApp();

  const reviewCount = parcels.filter(p => p.status === 'requires_review' || p.status === 'field_verification').length;
  const conflictCount = parcels.filter(p => p.conflictType !== null).length;
  const topologyCount = parcels.filter(p => p.topologyStatus === 'invalid').length;

  const badgeMap: Partial<Record<PageId, number>> = {
    conflicts: conflictCount,
    'field-verification': parcels.filter(p => p.status === 'field_verification').length,
    topology: topologyCount,
    'cadastral-map': reviewCount,
  };

  const navItems: NavItem[] =
    userRole === 'ADMIN'
      ? ADMIN_NAV
      : userRole === 'GIS_ANALYST'
      ? ANALYST_NAV
      : SURVEYOR_NAV;

  const roleLabels: Record<UserRole, { label: string; color: string; border: string }> = {
    ADMIN: { label: 'Platform Admin', color: 'bg-purple-950/80 text-purple-300', border: 'border-purple-800/60' },
    GIS_ANALYST: { label: 'GIS Analyst', color: 'bg-blue-950/80 text-blue-300', border: 'border-blue-800/60' },
    SURVEYOR: { label: 'Licensed Surveyor', color: 'bg-emerald-950/80 text-emerald-300', border: 'border-emerald-800/60' },
  };

  const roleMeta = roleLabels[userRole] || roleLabels.SURVEYOR;

  return (
    <aside className="w-60 bg-slate-900 text-slate-300 flex flex-col h-screen sticky top-0 flex-shrink-0 border-r border-slate-800">
      {/* Brand Header */}
      <div className="px-5 py-4 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-md shadow-blue-500/20">
            <MapPin className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-white text-sm leading-tight truncate">CadastraAI</div>
            <div className="text-[10px] text-slate-400 leading-tight">Cadastral Intelligence</div>
          </div>
        </div>

        {/* Current Role Badge */}
        <div className={`mt-3 px-2.5 py-1.5 rounded-lg border flex items-center justify-between text-xs ${roleMeta.color} ${roleMeta.border}`}>
          <div className="flex items-center gap-1.5 truncate">
            <Shield className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="font-semibold truncate">{roleMeta.label}</span>
          </div>
          <span className="text-[9px] font-mono tracking-wider opacity-70">RBAC</span>
        </div>
      </div>

      {/* Active Project Card */}
      {activeProject && (
        <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/50">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 font-semibold">Active Project</div>
          <div className="text-xs text-slate-200 font-medium truncate" title={activeProject.name}>
            {activeProject.name}
          </div>
          <div className="flex items-center gap-1.5 mt-1.5">
            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${activeProject.progress}%` }} />
            </div>
            <span className="text-[10px] text-slate-400 font-mono">{activeProject.progress}%</span>
          </div>
        </div>
      )}

      {/* Dynamic Role Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          const badge = badgeMap[item.id];
          return (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 text-left truncate">{item.label}</span>
              {badge !== undefined && badge > 0 && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                    isActive ? 'bg-white/25 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'
                  }`}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User Info & Logout */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/40">
        <div className="px-2 py-1.5 mb-2 flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-700 rounded-full flex items-center justify-center text-xs font-bold text-white">
            {currentUser?.avatar || 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-slate-200 truncate">{currentUser?.fullName || currentUser?.name}</div>
            <div className="text-[10px] text-slate-500 truncate">{currentUser?.organization}</div>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-all border border-rose-900/30 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
