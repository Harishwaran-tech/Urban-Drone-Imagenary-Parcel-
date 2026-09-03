import { useApp } from '@/context/AppContext';
import type { PageId } from '@/types';
import {
  LayoutDashboard, FolderKanban, PlusCircle, Map, AlertTriangle,
  ClipboardCheck, GitBranch, FileText, Settings, LogOut, MapPin,
} from 'lucide-react';

const NAV_ITEMS: { id: PageId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'new-survey', label: 'New Survey', icon: PlusCircle },
  { id: 'cadastral-map', label: 'Cadastral Map', icon: Map },
  { id: 'conflicts', label: 'Conflicts', icon: AlertTriangle },
  { id: 'field-verification', label: 'Field Verification', icon: ClipboardCheck },
  { id: 'topology', label: 'Topology', icon: GitBranch },
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const { currentPage, setCurrentPage, logout, activeProject, parcels } = useApp();
  const reviewCount = parcels.filter(p => p.status === 'requires_review' || p.status === 'field_verification').length;
  const conflictCount = parcels.filter(p => p.conflictType !== null).length;
  const topologyCount = parcels.filter(p => p.topologyStatus === 'invalid').length;

  const badgeMap: Partial<Record<PageId, number>> = {
    conflicts: conflictCount,
    'field-verification': parcels.filter(p => p.status === 'field_verification').length,
    topology: topologyCount,
    'cadastral-map': reviewCount,
  };

  return (
    <aside className="w-60 bg-slate-900 text-slate-300 flex flex-col h-screen sticky top-0 flex-shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <MapPin className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-white text-sm leading-tight">CadastraAI</div>
            <div className="text-[10px] text-slate-400 leading-tight">Cadastral Intelligence</div>
          </div>
        </div>
      </div>

      {/* Active project indicator */}
      {activeProject && (
        <div className="px-4 py-3 border-b border-slate-800">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Active Project</div>
          <div className="text-xs text-slate-300 font-medium truncate" title={activeProject.name}>{activeProject.name}</div>
          <div className="flex items-center gap-1.5 mt-1.5">
            <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${activeProject.progress}%` }} />
            </div>
            <span className="text-[10px] text-slate-400">{activeProject.progress}%</span>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          const badge = badgeMap[item.id];
          return (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all mb-0.5 ${
                isActive ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {badge !== undefined && badge > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-700 text-slate-300'
                }`}>{badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-slate-800">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-all"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
