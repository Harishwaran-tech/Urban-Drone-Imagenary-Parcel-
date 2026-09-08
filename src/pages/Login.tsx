import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { MapPin, Mail, Lock, Eye, EyeOff, ArrowRight, Shield, Layers, ClipboardCheck, Sparkles } from 'lucide-react';
import type { UserRole } from '@/types';

interface DemoRoleOption {
  role: UserRole;
  title: string;
  email: string;
  password: string;
  badgeColor: string;
  description: string;
  icon: typeof Shield;
}

const DEMO_ROLES: DemoRoleOption[] = [
  {
    role: 'ADMIN',
    title: 'Platform Admin',
    email: 'admin@cadastra.ai',
    password: 'admin123',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
    description: 'System management, users, project assignments, validation parameters & audit logs.',
    icon: Shield,
  },
  {
    role: 'GIS_ANALYST',
    title: 'GIS Analyst',
    email: 'analyst@cadastra.ai',
    password: 'analyst123',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
    description: 'Geospatial input ingestion, AI feature processing, geometry correction & topology.',
    icon: Layers,
  },
  {
    role: 'SURVEYOR',
    title: 'Surveyor / Reviewer',
    email: 'surveyor@cadastra.ai',
    password: 'surveyor123',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    description: 'Review AI/analyst outputs against Ground Truth & GNSS; certify cadastral boundaries.',
    icon: ClipboardCheck,
  },
];

export default function Login() {
  const { login } = useApp();
  const [email, setEmail] = useState('surveyor@cadastra.ai');
  const [password, setPassword] = useState('surveyor123');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setTimeout(() => {
      const success = login(email, password);
      if (!success) {
        setError('Invalid credentials. Use one of the 3 role demo accounts below.');
        setLoading(false);
      }
    }, 400);
  };

  const handleSelectRole = (opt: DemoRoleOption) => {
    setEmail(opt.email);
    setPassword(opt.password);
    setError('');
    login(opt.email, opt.password);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - branding & architectural overview */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-900 relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at 20% 30%, #1e3a5f 0%, #172554 40%, #0f172a 80%)',
          }}
        />
        {/* Cadastral grid pattern */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `linear-gradient(rgba(59,130,246,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.3) 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
          }}
        />

        {/* Geometric parcel overlays */}
        <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 400 600" preserveAspectRatio="xMidYMid slice">
          <g fill="none" stroke="#3b82f6" strokeWidth="1">
            {[...Array(24)].map((_, i) => {
              const x = (i % 6) * 65 + 20;
              const y = Math.floor(i / 6) * 80 + 40;
              return <polygon key={i} points={`${x},${y} ${x + 55},${y + 5} ${x + 58},${y + 65} ${x - 3},${y + 62}`} fill="rgba(59,130,246,0.08)" />;
            })}
          </g>
          <g fill="none" stroke="#22c55e" strokeWidth="0.8">
            {[...Array(12)].map((_, i) => {
              const x = (i % 4) * 100 + 50;
              const y = Math.floor(i / 4) * 140 + 80;
              return <polygon key={i} points={`${x},${y} ${x + 80},${y + 3} ${x + 82},${y + 110} ${x + 2},${y + 108}`} fill="rgba(34,197,94,0.05)" />;
            })}
          </g>
        </svg>

        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
              <MapPin className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="text-xl font-bold">CadastraAI</div>
              <div className="text-xs text-slate-400">Cadastral Intelligence & Survey Review Platform</div>
            </div>
          </div>

          <div className="max-w-md">
            <h1 className="text-4xl font-extrabold mb-4 leading-tight tracking-tight">
              AI-Assisted Cadastral Boundary Extraction
            </h1>
            <p className="text-base text-slate-300 leading-relaxed mb-6">
              Accelerate municipal resurvey workflows through deep-learning parcel prediction, automated metric topology validation, and strict surveyor verification.
            </p>

            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <span className="w-2 h-2 bg-purple-400 rounded-full" />
                <span><strong>Admin:</strong> Complete system governance, project assignments & audit logs</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <span className="w-2 h-2 bg-blue-400 rounded-full" />
                <span><strong>GIS Analyst:</strong> Ingestion, AI inference & topology repair</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <span className="w-2 h-2 bg-emerald-400 rounded-full" />
                <span><strong>Surveyor:</strong> Ground truth, GNSS rover checks & certified sign-off</span>
              </div>
            </div>
          </div>

          <div className="text-xs text-amber-300/90 max-w-md bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 leading-relaxed">
            <strong>Cadastral Integrity Notice:</strong> AI outputs are preliminary decision-support drafts. Legal certification is exclusively reserved for authorized human surveyors.
          </div>
        </div>
      </div>

      {/* Right side - login form and 3 demo roles */}
      <div className="flex-1 flex items-center justify-center bg-slate-50 px-6 py-10 overflow-y-auto">
        <div className="w-full max-w-md my-auto">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div className="text-xl font-bold text-slate-800">CadastraAI</div>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-1">Sign In to CadastraAI</h2>
          <p className="text-sm text-slate-500 mb-6">Role-Based Access Control System (Admin • GIS Analyst • Surveyor)</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@cadastra.ai"
                  required
                  className="w-full pl-10 pr-3 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full pl-10 pr-10 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-slate-600">Remember session</span>
              </label>
              <span className="text-slate-400">SIH 2024 / Demo System</span>
            </div>

            {error && (
              <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 shadow-md shadow-blue-600/20 disabled:opacity-60 cursor-pointer"
            >
              {loading ? (
                <span className="text-sm">Authenticating...</span>
              ) : (
                <>
                  <span className="text-sm">Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* 3 Quick Role Demo Selectors */}
          <div className="mt-6 pt-5 border-t border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                ⚡ Instant Role Access (One-Click)
              </span>
              <span className="text-[10px] bg-slate-200/80 text-slate-600 px-1.5 py-0.5 rounded font-medium">3 ROLES</span>
            </div>

            <div className="space-y-2">
              {DEMO_ROLES.map((r) => {
                const Icon = r.icon;
                return (
                  <button
                    key={r.role}
                    type="button"
                    onClick={() => handleSelectRole(r)}
                    className="w-full text-left p-3 rounded-xl border border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50/40 transition-all group flex items-start gap-3 shadow-2xs cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center flex-shrink-0 transition-colors">
                      <Icon className="w-4 h-4 text-slate-700 group-hover:text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">{r.title}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded border font-semibold ${r.badgeColor}`}>
                          {r.role}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">{r.email}</div>
                      <div className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{r.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
