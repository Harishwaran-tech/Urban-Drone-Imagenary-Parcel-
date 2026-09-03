import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { MapPin, Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';

export default function Login() {
  const { login } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        setError('Invalid credentials. Use the demo account below.');
        setLoading(false);
      }
    }, 600);
  };

  const fillDemo = () => {
    setEmail('surveyor@cadastra.ai');
    setPassword('demo123');
    setError('');
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-900 relative overflow-hidden">
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(ellipse at 20% 30%, #1e3a5f 0%, #172554 40%, #0f172a 80%)',
        }} />
        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: `linear-gradient(rgba(59,130,246,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.3) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }} />

        {/* Simulated parcel overlays */}
        <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 400 600" preserveAspectRatio="xMidYMid slice">
          <g fill="none" stroke="#3b82f6" strokeWidth="1">
            {[...Array(30)].map((_, i) => {
              const x = (i % 6) * 65 + 20;
              const y = Math.floor(i / 6) * 80 + 40;
              return <polygon key={i} points={`${x},${y} ${x+55},${y+5} ${x+58},${y+65} ${x-3},${y+62}`} fill="rgba(59,130,246,0.08)" />
            })}
          </g>
          <g fill="none" stroke="#22c55e" strokeWidth="0.8">
            {[...Array(15)].map((_, i) => {
              const x = (i % 4) * 100 + 50;
              const y = Math.floor(i / 4) * 140 + 80;
              return <polygon key={i} points={`${x},${y} ${x+80},${y+3} ${x+82},${y+110} ${x+2},${y+108}`} fill="rgba(34,197,94,0.05)" />
            })}
          </g>
        </svg>

        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-blue-600 rounded-xl flex items-center justify-center">
              <MapPin className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="text-xl font-bold">CadastraAI</div>
              <div className="text-xs text-slate-400">Cadastral Intelligence Platform</div>
            </div>
          </div>

          <div className="max-w-md">
            <h1 className="text-4xl font-bold mb-4 leading-tight">AI-Assisted Cadastral Mapping</h1>
            <p className="text-lg text-slate-300 leading-relaxed mb-8">
              Accelerate land surveying with AI-powered parcel extraction and verification.
            </p>

            {/* Value proposition */}
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                <span>From manual parcel inspection to intelligent survey prioritization</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <div className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                <span>AI finds the problems. The surveyor makes the decision.</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <div className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
                <span>Drone imagery + AI + GIS + GNSS + Human verification</span>
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-500 max-w-md bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3">
            AI-generated parcel boundaries are preliminary and require surveyor verification before official use.
          </div>
        </div>
      </div>

      {/* Right side - login form */}
      <div className="flex-1 flex items-center justify-center bg-slate-50 px-6 py-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div className="text-xl font-bold text-slate-800">CadastraAI</div>
          </div>

          <h2 className="text-2xl font-bold text-slate-800 mb-2">Welcome back</h2>
          <p className="text-sm text-slate-500 mb-8">Sign in to your surveyor account to continue.</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="surveyor@cadastra.ai"
                  required
                  className="w-full pl-10 pr-3 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full pl-10 pr-10 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm text-slate-600">Remember me</span>
              </label>
              <button type="button" className="text-sm text-blue-600 hover:text-blue-700 font-medium">Forgot password?</button>
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 disabled:opacity-60"
            >
              {loading ? (
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              ) : (
                <>Sign In <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          {/* Demo login */}
          <div className="mt-6 pt-6 border-t border-slate-200 space-y-2">
            <button
              type="button"
              onClick={() => login('admin@cadastra.ai', 'bypass')}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg transition-all text-sm flex items-center justify-center gap-2 shadow-sm"
            >
              ⚡ Instant Admin Access (Bypass)
            </button>
            <button
              type="button"
              onClick={fillDemo}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-2 rounded-lg transition-all text-xs flex items-center justify-center gap-2 border border-slate-200"
            >
              Fill Demo Credentials (surveyor@cadastra.ai)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
