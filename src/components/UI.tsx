import type { ReactNode } from 'react';

interface StatusBadgeProps {
  status: string;
  label?: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  verified: { bg: 'bg-green-100', text: 'text-green-700', label: 'Verified' },
  ai_preliminary: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'AI Preliminary' },
  requires_review: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Requires Review' },
  field_verification: { bg: 'bg-red-100', text: 'text-red-700', label: 'Field Verification' },
  rejected: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Rejected' },
  not_reviewed: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Not Reviewed' },
  under_review: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Under Review' },
  valid: { bg: 'bg-green-100', text: 'text-green-700', label: 'Valid' },
  invalid: { bg: 'bg-red-100', text: 'text-red-700', label: 'Invalid' },
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] || { bg: 'bg-gray-100', text: 'text-gray-600', label: status };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${style.bg} ${style.text}`}>
      {label || style.label}
    </span>
  );
}

interface PriorityBadgeProps {
  priority: string;
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  const styles: Record<string, string> = {
    CRITICAL: 'bg-red-600 text-white',
    HIGH: 'bg-orange-500 text-white',
    MEDIUM: 'bg-amber-400 text-amber-900',
    LOW: 'bg-emerald-100 text-emerald-700',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-bold ${styles[priority] || styles.LOW}`}>
      {priority}
    </span>
  );
}

interface ConfidenceBarProps {
  value: number;
  showLabel?: boolean;
}

export function ConfidenceBar({ value, showLabel = true }: ConfidenceBarProps) {
  const color = value >= 95 ? 'bg-emerald-500' : value >= 80 ? 'bg-blue-500' : value >= 60 ? 'bg-amber-500' : 'bg-red-500';
  const label = value >= 95 ? 'Very High' : value >= 80 ? 'High' : value >= 60 ? 'Medium' : 'Low';
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        {showLabel && <span className="text-xs text-slate-500">{label} Confidence</span>}
        <span className="text-xs font-bold text-slate-700">{value}%</span>
      </div>
      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

interface KPICardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: string;
  color?: 'blue' | 'green' | 'amber' | 'red' | 'slate';
}

export function KPICard({ label, value, icon, trend, color = 'slate' }: KPICardProps) {
  const colorMap: Record<string, string> = {
    blue: 'border-blue-200 bg-blue-50',
    green: 'border-green-200 bg-green-50',
    amber: 'border-amber-200 bg-amber-50',
    red: 'border-red-200 bg-red-50',
    slate: 'border-slate-200 bg-white',
  };
  const iconColorMap: Record<string, string> = {
    blue: 'text-blue-600 bg-blue-100',
    green: 'text-green-600 bg-green-100',
    amber: 'text-amber-600 bg-amber-100',
    red: 'text-red-600 bg-red-100',
    slate: 'text-slate-600 bg-slate-100',
  };
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
        {icon && <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconColorMap[color]}`}>{icon}</div>}
      </div>
      <div className="text-2xl font-bold text-slate-800">{value}</div>
      {trend && <div className="text-xs text-slate-500 mt-1">{trend}</div>}
    </div>
  );
}

interface DisclaimerProps {
  className?: string;
}

export function AIDisclaimer({ className = '' }: DisclaimerProps) {
  return (
    <div className={`flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 ${className}`}>
      <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
      </svg>
      <span>AI-generated parcel boundaries are preliminary and require surveyor verification before official use.</span>
    </div>
  );
}

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}

export function Button({ children, onClick, variant = 'primary', size = 'md', disabled, className = '', type = 'button' }: ButtonProps) {
  const variants: Record<string, string> = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm',
    secondary: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-sm',
    danger: 'bg-red-600 hover:bg-red-700 text-white shadow-sm',
    success: 'bg-green-600 hover:bg-green-700 text-white shadow-sm',
    ghost: 'hover:bg-slate-100 text-slate-600',
  };
  const sizes: Record<string, string> = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-2.5 text-sm',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all ${variants[variant]} ${sizes[size]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      {children}
    </button>
  );
}

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
}

export function Card({ children, className = '', title, subtitle, action }: CardProps) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            {title && <h3 className="font-bold text-slate-800">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
