import { useState, useRef, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import {
  Search, Bell, ChevronDown, Layers, MapPin, LayoutDashboard,
  FolderKanban, Cpu, ShieldCheck, FileText, CheckCircle2,
} from 'lucide-react';
import type { PageId } from '@/types';

const PAGE_TITLES: Record<PageId, string> = {
  dashboard: 'Dashboard',
  projects: 'Projects',
  'new-survey': 'New Survey Project',
  'ai-processing': 'AI Processing',
  'cadastral-map': 'Cadastral Map / WebGIS',
  conflicts: 'Conflict Analysis',
  'field-verification': 'Field Verification',
  topology: 'Topology Validation',
  reports: 'Reports',
  settings: 'Settings',
};

export default function TopBar() {
  const {
    currentUser,
    activeProject,
    notifications,
    unreadCount,
    searchQuery,
    setSearchQuery,
    searchResults,
    setCurrentPage,
    setSelectedParcelId,
    markNotificationRead,
    currentPage,
    logout,
  } = useApp();

  const [showNotifs, setShowNotifs] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifs(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setShowProfile(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSearch(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSearchResult = (id: string) => {
    setSelectedParcelId(id);
    setCurrentPage('cadastral-map');
    setShowSearch(false);
    setSearchQuery('');
  };

  const statusColors: Record<string, string> = {
    info: 'bg-blue-500',
    warning: 'bg-amber-500',
    success: 'bg-green-500',
    error: 'bg-red-500',
  };

  // 1. For Cadastral Map Page: Show LAND-AI Navigation Header (Image 2 style)
  if (currentPage === 'cadastral-map') {
    return (
      <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 sticky top-0 z-30 select-none flex-shrink-0">
        {/* Left: LAND-AI Brand + Navigation Menu */}
        <div className="flex items-center gap-8">
          {/* Brand Logo */}
          <button
            onClick={() => setCurrentPage('cadastral-map')}
            className="flex items-center gap-2.5 text-left focus:outline-none group"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 via-cyan-500 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/30 group-hover:scale-105 transition-transform">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-black text-white text-base tracking-wider font-sans">LAND-AI</span>
            </div>
          </button>

          {/* Top Navigation Links */}
          <nav className="hidden md:flex items-center gap-1">
            <button
              onClick={() => setCurrentPage('dashboard')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 text-slate-300 hover:text-white hover:bg-slate-800/60"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setCurrentPage('projects')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 text-slate-300 hover:text-white hover:bg-slate-800/60"
            >
              <FolderKanban className="w-3.5 h-3.5" />
              <span>Projects</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            <button
              onClick={() => setCurrentPage('ai-processing')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 text-slate-300 hover:text-white hover:bg-slate-800/60"
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>AI Processing</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            <button
              onClick={() => setCurrentPage('conflicts')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 text-slate-300 hover:text-white hover:bg-slate-800/60"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Validation</span>
            </button>

            <button
              onClick={() => setCurrentPage('reports')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 text-slate-300 hover:text-white hover:bg-slate-800/60"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Reports</span>
            </button>
          </nav>
        </div>

        {/* Right: Notifications & User Profile Pill */}
        <div className="flex items-center gap-4">
          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setShowNotifs(!showNotifs)}
              className="relative w-8 h-8 flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-red-500 text-white text-[8px] font-extrabold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifs && (
              <div className="absolute top-full mt-2 right-0 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in">
                <div className="px-4 py-3 border-b border-slate-100 font-bold text-xs text-slate-800 flex items-center justify-between">
                  <span>Notifications</span>
                  <span className="text-[10px] text-blue-600 font-semibold">{unreadCount} unread</span>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 text-xs">
                  {notifications.map(n => (
                    <div
                      key={n.id}
                      onClick={() => markNotificationRead(n.id)}
                      className={`px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${!n.read ? 'bg-blue-50/50' : ''}`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${statusColors[n.type]}`} />
                        <div className="flex-1">
                          <div className="font-bold text-slate-800 text-xs">{n.title}</div>
                          <div className="text-slate-600 text-[11px] mt-0.5">{n.message}</div>
                          <div className="text-[9px] text-slate-400 mt-1">{n.time}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* User Profile Pill */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setShowProfile(!showProfile)}
              className="flex items-center gap-2.5 py-1 px-1.5 rounded-full hover:bg-slate-800/80 transition-colors"
            >
              <div className="w-8 h-8 bg-slate-700 border border-slate-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-inner">
                <svg className="w-4 h-4 text-slate-300" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-xs font-bold text-white leading-tight">
                  {currentUser?.name || 'Drone GIS Cell'}
                </div>
                <div className="text-[10px] text-slate-400 leading-tight font-medium">
                  {currentUser?.role || 'Tamil Nadu Land Authority'}
                </div>
              </div>
            </button>

            {showProfile && (
              <div className="absolute top-full mt-2 right-0 w-60 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                  <div className="text-xs font-bold text-slate-800">{currentUser?.name || 'Drone GIS Cell'}</div>
                  <div className="text-[10px] text-slate-500">{currentUser?.email || 'gis.cell@landauthority.tn.gov.in'}</div>
                  <div className="text-[10px] text-blue-600 font-semibold mt-0.5">{currentUser?.role || 'Tamil Nadu Land Authority'}</div>
                </div>
                <div className="p-1 text-xs">
                  <button
                    onClick={() => { setShowProfile(false); setCurrentPage('settings'); }}
                    className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-100 rounded-lg font-medium"
                  >
                    Settings & Preferences
                  </button>
                  <button
                    onClick={() => logout()}
                    className="w-full px-3 py-2 text-left text-red-600 hover:bg-red-50 rounded-lg font-medium"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
    );
  }

  // 2. For All Other Pages: Show the standard clean white TopBar
  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-5 sticky top-0 z-30 flex-shrink-0">
      {/* Left: page title + project status */}
      <div className="flex items-center gap-4">
        <h1 className="font-bold text-slate-800 text-sm">{PAGE_TITLES[currentPage] || 'Dashboard'}</h1>
        {activeProject && (
          <div className="hidden md:flex items-center gap-2 text-xs">
            <span className="text-slate-400">|</span>
            <span className="text-slate-600 font-medium truncate max-w-[260px]">{activeProject.name}</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-semibold">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
              {activeProject.status.replace(/_/g, ' ')}
            </span>
          </div>
        )}
      </div>

      {/* Right: search, notifications, profile */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative" ref={searchRef}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowSearch(true); }}
              onFocus={() => setShowSearch(true)}
              placeholder="Search parcel, survey no, ward..."
              className="w-56 pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>
          {showSearch && searchResults.length > 0 && (
            <div className="absolute top-full mt-2 right-0 w-80 bg-white rounded-lg shadow-xl border border-slate-200 max-h-80 overflow-y-auto z-50">
              <div className="px-3 py-2 text-xs font-bold text-slate-500 border-b border-slate-100">{searchResults.length} results</div>
              {searchResults.slice(0, 8).map(p => (
                <button
                  key={p.id}
                  onClick={() => handleSearchResult(p.id)}
                  className="w-full px-3 py-2.5 hover:bg-slate-50 flex items-center justify-between border-b border-slate-50 last:border-0 text-left"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{p.id}</div>
                    <div className="text-xs text-slate-500">{p.surveyNumber} · {p.ward}</div>
                  </div>
                  <span className="text-xs text-slate-400">{p.status.replace(/_/g, ' ')}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifs(!showNotifs)}
            className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors"
          >
            <Bell className="w-5 h-5 text-slate-600" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{unreadCount}</span>
            )}
          </button>
          {showNotifs && (
            <div className="absolute top-full mt-2 right-0 w-80 bg-white rounded-lg shadow-xl border border-slate-200 z-50">
              <div className="px-4 py-3 border-b border-slate-100 font-bold text-sm text-slate-800">Notifications</div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.map(n => (
                  <div
                    key={n.id}
                    onClick={() => markNotificationRead(n.id)}
                    className={`px-4 py-3 border-b border-slate-50 last:border-0 cursor-pointer hover:bg-slate-50 ${!n.read ? 'bg-blue-50/40' : ''}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${statusColors[n.type]}`} />
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-slate-800">{n.title}</div>
                        <div className="text-xs text-slate-600 mt-0.5">{n.message}</div>
                        <div className="text-[10px] text-slate-400 mt-1">{n.time}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Profile */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setShowProfile(!showProfile)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
              {currentUser?.avatar || 'U'}
            </div>
            <div className="hidden md:block text-left">
              <div className="text-sm font-semibold text-slate-800 leading-tight">{currentUser?.name || 'Surveyor'}</div>
              <div className="text-[10px] text-slate-500 leading-tight">{currentUser?.role || ''}</div>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </button>
          {showProfile && (
            <div className="absolute top-full mt-2 right-0 w-56 bg-white rounded-lg shadow-xl border border-slate-200 z-50">
              <div className="px-4 py-3 border-b border-slate-100">
                <div className="text-sm font-bold text-slate-800">{currentUser?.name}</div>
                <div className="text-xs text-slate-500">{currentUser?.email}</div>
                <div className="text-xs text-blue-600 font-semibold mt-1">{currentUser?.role}</div>
              </div>
              <button onClick={() => { setShowProfile(false); setCurrentPage('settings'); }} className="w-full px-4 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-50">Settings</button>
              <button onClick={() => logout()} className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50">Sign Out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
