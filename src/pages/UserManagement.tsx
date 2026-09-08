import { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { apiService } from '@/services/apiService';
import {
  Users, UserPlus, Shield, CheckCircle2, XCircle, Edit3,
  Search, Filter, RefreshCw, Lock, AlertCircle, Building2,
} from 'lucide-react';
import { Button, Card, KPICard } from '@/components/UI';
import type { User, UserRole } from '@/types';

export default function UserManagement() {
  const { userRole, currentUser } = useApp();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Form States
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('SURVEYOR');
  const [formOrg, setFormOrg] = useState('Tamil Nadu Survey & Land Records');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Initial demo seed users fallback
  const initialUsers: User[] = [
    {
      id: 'USR-ADMIN-01',
      fullName: 'A. Sharma',
      email: 'admin@cadastra.ai',
      role: 'ADMIN',
      organization: 'Tamil Nadu Land Survey Directorate',
      isActive: true,
      lastLogin: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    },
    {
      id: 'USR-ANALYST-01',
      fullName: 'A. Kumar',
      email: 'analyst@cadastra.ai',
      role: 'GIS_ANALYST',
      organization: 'State Remote Sensing & GIS Cell',
      isActive: true,
      lastLogin: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    },
    {
      id: 'USR-SURVEYOR-01',
      fullName: 'R. Senthil',
      email: 'surveyor@cadastra.ai',
      role: 'SURVEYOR',
      organization: 'Chennai District Survey Office',
      isActive: true,
      lastLogin: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    },
    {
      id: 'USR-SURVEYOR-02',
      fullName: 'P. Murugan',
      email: 'murugan.p@cadastra.ai',
      role: 'SURVEYOR',
      organization: 'Tambaram Taluk Survey Office',
      isActive: true,
      lastLogin: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    },
    {
      id: 'USR-ANALYST-02',
      fullName: 'K. Divya',
      email: 'divya.k@cadastra.ai',
      role: 'GIS_ANALYST',
      organization: 'Drone Photogrammetry Wing',
      isActive: false,
      lastLogin: null,
    },
  ];

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await apiService.getUsers();
      if (Array.isArray(data) && data.length > 0) {
        setUsers(
          data.map((u: any) => ({
            id: u.id,
            fullName: u.full_name || u.fullName,
            email: u.email,
            role: u.role,
            organization: u.organization,
            isActive: u.is_active !== undefined ? u.is_active : true,
            lastLogin: u.last_login,
            createdAt: u.created_at,
          }))
        );
      } else {
        setUsers(initialUsers);
      }
    } catch {
      setUsers(initialUsers);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      await apiService.createUser({
        fullName: formName,
        email: formEmail,
        password: formPassword,
        role: formRole,
        organization: formOrg,
      });
      setShowAddModal(false);
      resetForm();
      fetchUsers();
    } catch (err: any) {
      // Fallback update in state if backend unavailable
      const newUser: User = {
        id: `USR-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        fullName: formName,
        email: formEmail,
        role: formRole,
        organization: formOrg,
        isActive: true,
        lastLogin: null,
      };
      setUsers((prev) => [...prev, newUser]);
      setShowAddModal(false);
      resetForm();
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSubmitting(true);
    try {
      await apiService.updateUser(editingUser.id, {
        fullName: formName,
        role: formRole,
        organization: formOrg,
      });
      setShowEditModal(false);
      fetchUsers();
    } catch {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === editingUser.id
            ? { ...u, fullName: formName, role: formRole, organization: formOrg }
            : u
        )
      );
      setShowEditModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (user: User) => {
    const newStatus = !user.isActive;
    try {
      await apiService.updateUser(user.id, { isActive: newStatus });
      fetchUsers();
    } catch {
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, isActive: newStatus } : u))
      );
    }
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setFormName(user.fullName);
    setFormEmail(user.email);
    setFormRole(user.role);
    setFormOrg(user.organization);
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormName('');
    setFormEmail('');
    setFormPassword('');
    setFormRole('SURVEYOR');
    setFormOrg('Tamil Nadu Survey & Land Records');
    setFormError('');
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.organization.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && u.isActive) ||
      (statusFilter === 'INACTIVE' && !u.isActive);
    return matchesSearch && matchesRole && matchesStatus;
  });

  const totalUsers = users.length;
  const analysts = users.filter((u) => u.role === 'GIS_ANALYST').length;
  const surveyors = users.filter((u) => u.role === 'SURVEYOR').length;
  const activeCount = users.filter((u) => u.isActive).length;

  const roleStyles: Record<UserRole, { badge: string; label: string }> = {
    ADMIN: { badge: 'bg-purple-100 text-purple-800 border-purple-200', label: 'Admin' },
    GIS_ANALYST: { badge: 'bg-blue-100 text-blue-800 border-blue-200', label: 'GIS Analyst' },
    SURVEYOR: { badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', label: 'Surveyor / Reviewer' },
  };

  return (
    <div className="p-6 space-y-6 max-w-[1500px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800">User Management</h1>
            <span className="text-[11px] bg-purple-100 text-purple-800 border border-purple-200 font-bold px-2 py-0.5 rounded-full">
              ADMIN ONLY
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Manage authenticated platform users, role assignments, and account activation states.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="md" onClick={fetchUsers} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              resetForm();
              setShowAddModal(true);
            }}
          >
            <UserPlus className="w-4 h-4" />
            Add User
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Total Users" value={totalUsers} color="blue" icon={<Users className="w-4 h-4" />} />
        <KPICard label="GIS Analysts" value={analysts} color="blue" />
        <KPICard label="Surveyors / Reviewers" value={surveyors} color="emerald" />
        <KPICard label="Active Accounts" value={activeCount} color="purple" icon={<Shield className="w-4 h-4" />} />
      </div>

      {/* Main Table Card */}
      <Card>
        {/* Filters bar */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, email, or department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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

            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span>Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Organization / Department</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Last Login</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No users match the search criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const meta = roleStyles[u.role] || roleStyles.SURVEYOR;
                  const isCurrent = u.id === currentUser?.id || u.email === currentUser?.email;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-700 text-xs">
                            {u.avatar || u.fullName.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-800 flex items-center gap-1.5">
                              <span>{u.fullName}</span>
                              {isCurrent && (
                                <span className="text-[9px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.2 rounded-full">
                                  YOU
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${meta.badge}`}>
                          <Shield className="w-3 h-3" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-medium">
                        {u.organization}
                      </td>
                      <td className="py-3.5 px-4">
                        {u.isActive ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 font-bold bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                            <XCircle className="w-3 h-3 text-slate-400" />
                            Deactivated
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                        {u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'Never'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEdit(u)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="Edit User"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggleStatus(u)}
                            className={`px-2 py-1 text-[10px] font-bold rounded-lg border transition-colors cursor-pointer ${
                              u.isActive
                                ? 'border-amber-200 text-amber-700 hover:bg-amber-50'
                                : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                            }`}
                            title={u.isActive ? 'Deactivate account' : 'Activate account'}
                          >
                            {u.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in">
            <h3 className="text-lg font-bold text-slate-800 mb-1">Add Platform User</h3>
            <p className="text-xs text-slate-500 mb-4">
              Register a new user account with role-based permissions.
            </p>

            {formError && (
              <div className="mb-3 text-xs text-rose-600 bg-rose-50 border border-rose-200 p-2.5 rounded-lg">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. S. Radhakrishnan"
                  className="w-full text-xs p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="user@cadastra.ai"
                  className="w-full text-xs p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full text-xs p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Platform Role</label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as UserRole)}
                  className="w-full text-xs p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none font-semibold"
                >
                  <option value="SURVEYOR">SURVEYOR (Review, GNSS/GT, Legal Verification)</option>
                  <option value="GIS_ANALYST">GIS ANALYST (Inputs, AI Processing, Topology Repair)</option>
                  <option value="ADMIN">ADMIN (Platform, User & Project Governance)</option>
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  * Note: Only licensed Surveyors can execute cadastral parcel certification.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Organization</label>
                <input
                  type="text"
                  value={formOrg}
                  onChange={(e) => setFormOrg(e.target.value)}
                  className="w-full text-xs p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <Button variant="secondary" size="sm" type="button" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" type="submit" disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create User'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in">
            <h3 className="text-lg font-bold text-slate-800 mb-1">Edit User Profile</h3>
            <p className="text-xs text-slate-500 mb-4">{editingUser.email}</p>

            <form onSubmit={handleUpdateUser} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full text-xs p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Platform Role</label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as UserRole)}
                  className="w-full text-xs p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none font-semibold"
                >
                  <option value="SURVEYOR">SURVEYOR (Review, GNSS/GT, Legal Verification)</option>
                  <option value="GIS_ANALYST">GIS ANALYST (Inputs, AI Processing, Topology Repair)</option>
                  <option value="ADMIN">ADMIN (Platform, User & Project Governance)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Organization</label>
                <input
                  type="text"
                  value={formOrg}
                  onChange={(e) => setFormOrg(e.target.value)}
                  className="w-full text-xs p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <Button variant="secondary" size="sm" type="button" onClick={() => setShowEditModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" type="submit" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
