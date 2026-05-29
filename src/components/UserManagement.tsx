import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@supabase/supabase-js';
import { supabase, supabaseAnonKey, supabaseUrl } from '@/lib/supabase';
import type { RpaUser } from '@/types';
import { normalizeBranch, ALL_BRANCHES, NORTH_REGION as NORTH_BRANCHES, SOUTH_REGION as SOUTH_BRANCHES } from '@/data/mockData';
import {
  UserPlus, Pencil, Trash2, X, Check, Search, Shield, Building2,
  Users, AlertTriangle, ChevronDown, Eye, EyeOff, User, FileDown,
} from 'lucide-react';

const ROLES: { value: RpaUser['role']; label: string; color: string }[] = [
  { value: 'HS-ADMIN', label: 'HS Admin', color: 'bg-[#46286E] text-white' },
  { value: 'COUNTRY-MANAGER', label: 'Country Manager', color: 'bg-[#FFC8B2] text-[#21264E]' },
  { value: 'UK-ADMIN', label: 'UK Admin', color: 'bg-[#1E3A8A] text-white' },
  { value: 'ADMIN', label: 'Admin', color: 'bg-[#0EA5E9] text-white' },
  { value: 'RSM', label: 'Regional Manager', color: 'bg-[#006AE0] text-white' },
  { value: 'ASM', label: 'Area Manager', color: 'bg-[#08DC7D] text-white' },
  { value: 'ZONE-MANAGER', label: 'Zone Manager', color: 'bg-[#0891B2] text-white' },
];

const emptyForm = {
  full_name: '',
  email: '',
  username: '',
  role: 'ASM' as RpaUser['role'],
  branches: [] as string[],
  zone: '',
  is_active: true,
  pdf_export_enabled: true,
  password: '',
};

type FormData = typeof emptyForm;

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<RpaUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [zones, setZones] = useState<string[]>([]);
  const [zoneToBranch, setZoneToBranch] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<RpaUser | null>(null);
  const [form, setForm] = useState<FormData>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('rpa_users')
      .select('*')
      .order('created_at', { ascending: false });
    if (!err && data) setUsers(data as RpaUser[]);
    setLoading(false);
  }, []);

  useEffect(() => { 
    fetchUsers(); 
  }, [fetchUsers]);

  useEffect(() => {
    supabase
      .from('zone_coverage_summary')
      .select('zone, branch')
      .order('zone', { ascending: true })
      .limit(5000)
      .then(({ data }) => {
        const rows = (data as any[] | null) || [];
        const list = rows.map(r => String(r.zone || '').trim()).filter(Boolean);
        const map: Record<string, string> = {};
        for (const r of rows) {
          const z = String(r.zone || '').trim();
          if (!z) continue;
          const b = String(r.branch || '').trim();
          if (b) map[z] = b;
        }
        setZones(Array.from(new Set(list)).sort());
        setZoneToBranch(map);
      });
  }, []);

  // Auto-clear success message
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(''), 4000);
      return () => clearTimeout(t);
    }
  }, [success]);

  const filteredUsers = users.filter(u => {
    const matchSearch =
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const openCreate = () => {
    setEditingUser(null);
    setForm({ ...emptyForm });
    setError('');
    setShowModal(true);
  };

  const openEdit = (u: RpaUser) => {
    setEditingUser(u);
    setForm({
      full_name: u.full_name,
      email: u.email,
      username: u.username,
      role: u.role,
      branches: u.branches.map(normalizeBranch),
      zone: u.zone || '',
      is_active: u.is_active,
      pdf_export_enabled: u.pdf_export_enabled ?? true,
      password: '',
    });
    setError('');
    setShowModal(true);
  };

  const toggleBranch = (branch: string) => {
    setForm(prev => ({
      ...prev,
      branches: prev.branches.includes(branch)
        ? prev.branches.filter(b => b !== branch)
        : [...prev.branches, branch],
    }));
  };

  const selectRegion = (region: 'north' | 'south' | 'all') => {
    const regionBranches =
      region === 'north' ? NORTH_BRANCHES :
      region === 'south' ? SOUTH_BRANCHES : ALL_BRANCHES;
    setForm(prev => {
      const isSingleBranchRole = prev.role === 'ASM';
      return {
        ...prev,
        branches: isSingleBranchRole ? (regionBranches[0] ? [regionBranches[0]] : []) : [...regionBranches],
      };
    });
  };

  const handleRoleChange = (role: RpaUser['role']) => {
    let branches = form.branches;
    let zone = form.zone;
    if (role === 'ZONE-MANAGER') {
      branches = [];
      zone = '';
    } else {
      if (form.role === 'ZONE-MANAGER') {
        branches = [];
        zone = '';
      }
      if (role === 'HS-ADMIN' || role === 'COUNTRY-MANAGER' || role === 'UK-ADMIN') branches = [...ALL_BRANCHES];
      else if (role === 'RSM') branches = branches.length > 4 ? [...NORTH_BRANCHES] : branches;
      else if (role === 'ASM') branches = branches.length > 1 ? [branches[0]] : branches;
    }
    setForm(prev => ({ ...prev, role, branches, zone }));
  };

  const sendPasswordResetEmail = async (u: RpaUser) => {
    setResettingPassword(true);
    try {
      const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { error } = await authClient.auth.resetPasswordForEmail(u.email, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
    } finally {
      setResettingPassword(false);
    }
  };

  const validate = (): string | null => {
    if (!form.full_name.trim()) return 'Full name is required';
    if (!form.email.trim()) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Invalid email format';
    if (!form.username.trim()) return 'Username is required';
    if (form.role === 'ZONE-MANAGER') {
      if (!form.zone.trim()) return 'Zone is required for Zone Manager';
      if (form.branches.length !== 1) return 'Zone Manager must have exactly one branch assigned';
    } else {
      if (form.branches.length === 0) return 'At least one branch must be selected';
    }
    if (form.role === 'ASM' && form.branches.length > 1) return 'ASM can only have one branch';
    if (!editingUser && !form.password) return 'Password is required for new users';
    if (form.password && form.password.length < 6) return 'Password must be at least 6 characters';
    // Check uniqueness against existing users (excluding current editing user)
    const emailNorm = form.email.trim().toLowerCase();
    const usernameNorm = form.username.trim();
    const dup = users.find(u => u.id !== editingUser?.id &&
      (u.username === usernameNorm || u.email.toLowerCase() === emailNorm));
    if (dup) return dup.email.toLowerCase() === emailNorm ? 'Email already in use' : 'Username already in use';
    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setSaving(true);
    setError('');

    try {
      const emailNorm = form.email.trim().toLowerCase();
      if (editingUser) {
        // UPDATE existing user
        const updates: Record<string, unknown> = {
          full_name: form.full_name.trim(),
          email: emailNorm,
          username: form.username.trim(),
          role: form.role,
          branches: form.branches,
          zone: form.role === 'ZONE-MANAGER' ? form.zone.trim() : null,
          is_active: form.is_active,
          pdf_export_enabled: form.pdf_export_enabled,
          updated_at: new Date().toISOString(),
        };

        const { error: updateErr } = await supabase
          .from('rpa_users')
          .update(updates)
          .eq('id', editingUser.id);

        if (updateErr) throw updateErr;

        if (form.password) {
          if (editingUser.auth_user_id && editingUser.auth_user_id === currentUser?.auth_user_id) {
            const { error: authErr } = await supabase.auth.updateUser({ password: form.password });
            if (authErr) throw authErr;
            setSuccess(`User "${form.full_name}" updated successfully`);
          } else if (!editingUser.auth_user_id) {
            const authClient = createClient(supabaseUrl, supabaseAnonKey, {
              auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
            });

            const { data: signUpData, error: signUpErr } = await authClient.auth.signUp({
              email: emailNorm,
              password: form.password,
              options: { data: { full_name: form.full_name.trim() } },
            });

            if (signUpErr) {
              const msg = signUpErr.message || '';
              if (msg.toLowerCase().includes('already registered')) {
                await sendPasswordResetEmail(editingUser);
                setSuccess(`User "${form.full_name}" updated. A password reset link was sent to ${editingUser.email}.`);
              } else {
                throw signUpErr;
              }
            } else if (signUpData?.user?.id) {
              const { error: authIdErr } = await supabase
                .from('rpa_users')
                .update({ auth_user_id: signUpData.user.id })
                .eq('id', editingUser.id);

              if (authIdErr) throw authIdErr;
              setSuccess(`User "${form.full_name}" updated and password set successfully.`);
            } else {
              await sendPasswordResetEmail(editingUser);
              setSuccess(`User "${form.full_name}" updated. A password reset link was sent to ${editingUser.email}.`);
            }
          } else {
            await sendPasswordResetEmail(editingUser);
            setSuccess(`User "${form.full_name}" updated. A password reset link was sent to ${editingUser.email}.`);
          }
        } else {
          setSuccess(`User "${form.full_name}" updated successfully`);
        }
      } else {
        // CREATE new user
        // Step 1: Create auth user using a stateless client so the admin session is not affected
        let authUserId: string | null = null;
        const authClient = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });

        const { data: signUpData, error: signUpErr } = await authClient.auth.signUp({
          email: emailNorm,
          password: form.password,
          options: { data: { full_name: form.full_name.trim() } },
        });

        if (signUpErr) {
          const msg = signUpErr.message || '';
          if (!msg.toLowerCase().includes('already registered')) {
            throw signUpErr;
          }
        } else if (signUpData?.user?.id) {
          authUserId = signUpData.user.id;
        }

        // Step 2: Insert rpa_users profile
        const { error: insertErr } = await supabase
          .from('rpa_users')
          .insert({
            auth_user_id: authUserId,
            full_name: form.full_name.trim(),
            email: emailNorm,
            username: form.username.trim(),
            role: form.role,
            branches: form.branches,
            zone: form.role === 'ZONE-MANAGER' ? form.zone.trim() : null,
            is_active: form.is_active,
            pdf_export_enabled: form.pdf_export_enabled,
            created_by: currentUser?.id || null,
          });

        if (insertErr) throw insertErr;
        setSuccess(`User "${form.full_name}" created successfully. If email confirmation is enabled, the user must verify their email before logging in.`);
      }

      setShowModal(false);
      fetchUsers();
    } catch (err: any) {
      console.error('Submit error:', err);
      const msg = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
      setError(msg || 'An error occurred');
    }

    setSaving(false);
  };

  const handleDelete = async (userId: string) => {
    if (userId === currentUser?.id) {
      setError('You cannot delete your own account');
      return;
    }
    setDeleting(true);
    try {
      const { error: delErr } = await supabase
        .from('rpa_users')
        .delete()
        .eq('id', userId);
      if (delErr) throw delErr;
      setDeleteConfirm(null);
      setSuccess('User deleted successfully');
      fetchUsers();
    } catch (err: any) {
      console.error('Delete error:', err);
      const msg = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
      setError(msg || 'Failed to delete user');
    }
    setDeleting(false);
  };

  const toggleActive = async (u: RpaUser) => {
    if (u.id === currentUser?.id) return;
    const { error: err } = await supabase
      .from('rpa_users')
      .update({ is_active: !u.is_active, updated_at: new Date().toISOString() })
      .eq('id', u.id);
    if (!err) {
      setSuccess(`User "${u.full_name}" ${u.is_active ? 'deactivated' : 'activated'}`);
      fetchUsers();
    } else {
      console.error('Toggle error:', err);
      const msg = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
      setError(msg || 'Failed to update user status');
    }
  };

  const getRoleBadge = (role: string) => {
    const r = ROLES.find(x => x.value === role);
    return (
      <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${r?.color || 'bg-gray-400 text-white'}`}>
        <Shield size={10} />
        {r?.label || role}
      </span>
    );
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[#21264E] flex items-center gap-3">
            <Users size={28} />
            User Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Create, edit and manage user accounts and permissions
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#21264E] hover:bg-[#245bc1] text-white text-sm font-semibold rounded-xl transition shadow-lg shadow-[#21264E]/20 w-full md:w-auto"
        >
          <UserPlus size={18} />
          Create User
        </button>
      </div>

      {/* Success / Error banners */}
      {success && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm">
          <Check size={16} />
          {success}
        </div>
      )}
      {error && !showModal && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          <AlertTriangle size={16} />
          {error}
          <button onClick={() => setError('')} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email or username..."
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl text-[#21264E] placeholder:text-gray-400 focus:ring-2 focus:ring-[#245bc1] outline-none bg-white"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="relative flex-1 md:flex-none">
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="appearance-none w-full md:w-auto pl-3 pr-8 py-2.5 text-sm border border-gray-200 rounded-xl text-[#21264E] bg-white focus:ring-2 focus:ring-[#245bc1] outline-none cursor-pointer"
            >
              <option value="all">All Roles</option>
              {ROLES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          <div className="text-sm text-gray-500 whitespace-nowrap">
            {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Users List - Table for Desktop, Cards for Mobile */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <svg className="animate-spin h-6 w-6 mr-3" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading users...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Users size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No users found</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#21264E]/[0.03] border-b border-gray-100">
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-[#21264E]/60 uppercase tracking-wider">User</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-[#21264E]/60 uppercase tracking-wider">Username</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-[#21264E]/60 uppercase tracking-wider">Role</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-[#21264E]/60 uppercase tracking-wider">Branches</th>
                    <th className="text-center px-5 py-3.5 text-xs font-semibold text-[#21264E]/60 uppercase tracking-wider">Status</th>
                    <th className="text-right px-5 py-3.5 text-xs font-semibold text-[#21264E]/60 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredUsers.map(u => (
                    <tr key={u.id} className={`hover:bg-[#fff7f2]/60 transition ${!u.is_active ? 'opacity-50' : ''}`}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                            ROLES.find(r => r.value === u.role)?.color || 'bg-gray-400 text-white'
                          }`}>
                            {u.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-[#21264E]">{u.full_name}</p>
                            <p className="text-xs text-gray-400">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded text-[#21264E]">{u.username}</code>
                      </td>
                      <td className="px-5 py-4">{getRoleBadge(u.role)}</td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-1">
                          {u.branches.slice(0, 3).map(b => (
                            <span key={b} className="text-[10px] px-2 py-0.5 rounded-full bg-[#21264E]/5 text-[#21264E] font-medium">
                              {b}
                            </span>
                          ))}
                          {u.branches.length > 3 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#21264E]/10 text-[#21264E] font-medium">
                              +{u.branches.length - 3} more
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <button
                          onClick={() => toggleActive(u)}
                          disabled={u.id === currentUser?.id}
                          className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium transition cursor-pointer disabled:cursor-not-allowed ${
                            u.is_active
                              ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                              : 'bg-red-50 text-red-500 hover:bg-red-100'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-red-400'}`} />
                          {u.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(u)} className="p-2 text-gray-400 hover:text-[#21264E] hover:bg-gray-100 rounded-lg transition">
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                setError('');
                                await sendPasswordResetEmail(u);
                                setSuccess(`Password reset link sent to ${u.email}`);
                              } catch (err: any) {
                                console.error('Password reset error:', err);
                                setError(err?.message || 'Failed to send password reset email');
                              }
                            }}
                            disabled={resettingPassword}
                            title="Send password reset email"
                            className="p-2 text-gray-400 hover:text-[#21264E] hover:bg-gray-100 rounded-lg transition"
                          >
                            <Shield size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-gray-100">
              {filteredUsers.map(u => (
                <div key={u.id} className={`p-4 ${!u.is_active ? 'opacity-50' : ''}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                        ROLES.find(r => r.value === u.role)?.color || 'bg-gray-400 text-white'
                      }`}>
                        {u.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#21264E]">{u.full_name}</p>
                        <p className="text-xs text-gray-400">{u.username}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(u)} className="p-2 text-gray-400 hover:text-[#21264E] hover:bg-gray-100 rounded-lg transition">
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            setError('');
                            await sendPasswordResetEmail(u);
                            setSuccess(`Password reset link sent to ${u.email}`);
                          } catch (err: any) {
                            console.error('Password reset error:', err);
                            setError(err?.message || 'Failed to send password reset email');
                          }
                        }}
                        disabled={resettingPassword}
                        title="Send password reset email"
                        className="p-2 text-gray-400 hover:text-[#21264E] hover:bg-gray-100 rounded-lg transition"
                      >
                        <Shield size={16} />
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-2 mb-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider">Role</span>
                      {getRoleBadge(u.role)}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider">Status</span>
                      <button
                        onClick={() => toggleActive(u)}
                        disabled={u.id === currentUser?.id}
                        className={`inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full font-medium transition cursor-pointer disabled:cursor-not-allowed ${
                          u.is_active
                            ? 'bg-emerald-50 text-emerald-600'
                            : 'bg-red-50 text-red-500'
                        }`}
                      >
                        {u.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {u.branches.map(b => (
                      <span key={b} className="text-[9px] px-2 py-0.5 rounded-full bg-[#21264E]/5 text-[#21264E] font-medium">
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 mt-6">
        {ROLES.map(r => {
          const count = users.filter(u => u.role === r.value).length;
          return (
            <div key={r.value} className="bg-white rounded-xl border border-gray-200 p-3 md:p-4 flex items-center gap-3">
              <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg ${r.color} flex items-center justify-center flex-shrink-0`}>
                <User size={16} className="md:w-5 md:h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xl md:text-2xl font-bold text-[#21264E]">{count}</p>
                <p className="text-[10px] md:text-xs text-gray-500 truncate">{r.label}s</p>
              </div>
            </div>
          );
        })}
        <div className="bg-white rounded-xl border border-gray-200 p-3 md:p-4 flex items-center gap-3">
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-[#F04438] flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={16} className="md:w-5 md:h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xl md:text-2xl font-bold text-[#21264E]">{users.filter(u => !u.is_active).length}</p>
            <p className="text-[10px] md:text-xs text-gray-500">Inactive</p>
          </div>
        </div>
      </div>

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#21264E]/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4 mx-auto">
              <AlertTriangle size={24} />
            </div>
            <h3 className="text-lg font-bold text-[#21264E] text-center mb-2">Delete User?</h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              This action cannot be undone. All user access will be immediately revoked.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-500 hover:bg-gray-100 rounded-xl transition"
              >
                Keep
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl transition disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#21264E]/40 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-xl font-bold text-[#21264E]">
                {editingUser ? 'Edit User' : 'Create New User'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition">
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {error && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
                  <AlertTriangle size={16} />
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-[#21264E]/70 uppercase tracking-wider mb-1.5">
                    Full Name <span className="text-[#F04438]">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.full_name}
                    onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                    placeholder="Mario Rossi"
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl text-[#21264E] placeholder:text-gray-400 focus:ring-2 focus:ring-[#245bc1] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#21264E]/70 uppercase tracking-wider mb-1.5">
                    Email Address <span className="text-[#F04438]">*</span>
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="user@company.com"
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl text-[#21264E] placeholder:text-gray-400 focus:ring-2 focus:ring-[#245bc1] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#21264E]/70 uppercase tracking-wider mb-1.5">
                    Username <span className="text-[#F04438]">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.username}
                    onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                    placeholder="m.rossi"
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl text-[#21264E] placeholder:text-gray-400 focus:ring-2 focus:ring-[#245bc1] outline-none"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-[#21264E]/70 uppercase tracking-wider mb-1.5">
                  Password {!editingUser && <span className="text-[#F04438]">*</span>}
                  {editingUser && (
                    <span className="text-gray-400 normal-case font-normal">
                      (leave blank to keep current; for other users this sends a reset link)
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    placeholder={editingUser ? '••••••••' : 'Min 6 characters'}
                    className="w-full px-4 py-2.5 pr-11 text-sm border border-gray-200 rounded-xl text-[#21264E] placeholder:text-gray-400 focus:ring-2 focus:ring-[#245bc1] outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#21264E] transition"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-semibold text-[#21264E]/70 uppercase tracking-wider mb-2">
                  Role <span className="text-[#F04438]">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ROLES.map(r => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => handleRoleChange(r.value)}
                      className={`px-3 py-2.5 rounded-xl text-[11px] font-medium border-2 transition ${
                        form.role === r.value
                          ? 'border-[#245bc1] bg-[#245bc1]/5 text-[#21264E]'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <Shield size={14} className={`mx-auto mb-1 ${form.role === r.value ? 'text-[#245bc1]' : 'text-gray-400'}`} />
                      {r.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5">
                  {form.role === 'HS-ADMIN' && 'Full access to all branches, data import, and user management'}
                  {form.role === 'COUNTRY-MANAGER' && 'National oversight with access to all branches'}
                  {form.role === 'UK-ADMIN' && 'All-branch operational access (no HS-ADMIN privileges)'}
                  {form.role === 'ADMIN' && 'Access to selected territories only'}
                  {form.role === 'RSM' && 'Access to assigned regional branches (up to 4)'}
                  {form.role === 'ASM' && 'Access to a single assigned branch only'}
                  {form.role === 'ZONE-MANAGER' && 'Zone-level access for assigned zones'}
                </p>
              </div>

              {/* Account Settings Toggles */}
              <div className="space-y-3">
                {/* Account Status Toggle (HS Admin only, Edit mode only) */}
                {editingUser && currentUser?.role === 'HS-ADMIN' && (
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl border border-gray-100">
                    <div>
                      <p className="text-sm font-semibold text-[#21264E]">Account Status</p>
                      <p className="text-[11px] text-gray-400">Inactive users cannot log in to the system</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, is_active: !p.is_active }))}
                      className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none ${
                        form.is_active ? 'bg-[#08DC7D]' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${
                          form.is_active ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                )}

                {/* PDF Export Permission Toggle */}
                {currentUser?.role === 'HS-ADMIN' && (
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl border border-gray-100">
                    <div>
                      <p className="text-sm font-semibold text-[#21264E]">PDF Export Permission</p>
                      <p className="text-[11px] text-gray-400">Allow this user to export retailer data as PDF</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, pdf_export_enabled: !p.pdf_export_enabled }))}
                      className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none ${
                        form.pdf_export_enabled ? 'bg-[#21264E]' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${
                          form.pdf_export_enabled ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                )}
              </div>

              {/* Branches */}
              <div>
                <label className="block text-xs font-semibold text-[#21264E]/70 uppercase tracking-wider mb-2">
                  <Building2 size={12} className="inline mr-1" />
                  {form.role === 'ZONE-MANAGER' ? 'Zone' : 'Branches'} <span className="text-[#F04438]">*</span>
                  <span className="text-gray-400 normal-case font-normal ml-2">
                    ({form.role === 'ZONE-MANAGER' ? (form.zone ? 1 : 0) : form.branches.length} selected)
                  </span>
                </label>

                {form.role === 'ZONE-MANAGER' ? (
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {zones.map(z => (
                        <label
                          key={z}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition text-xs ${
                            form.zone === z
                              ? 'bg-white shadow-sm border border-gray-100 text-[#21264E] font-semibold'
                              : 'text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          <input
                            type="radio"
                            className="w-3.5 h-3.5 rounded-full border-gray-300 text-[#245bc1] focus:ring-[#245bc1]"
                            checked={form.zone === z}
                            onChange={() => {
                              const b = zoneToBranch[z] ? normalizeBranch(zoneToBranch[z]) : '';
                              setForm(p => ({ ...p, zone: z, branches: b ? [b] : [] }));
                            }}
                          />
                          {z}
                        </label>
                      ))}
                    </div>
                    {form.zone && (
                      <div className="mt-3 text-xs text-gray-600">
                        Assigned Branch: <span className="font-semibold text-[#21264E]">{form.branches[0] || '—'}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2 mb-3">
                      <button
                        type="button"
                        onClick={() => selectRegion('north')}
                        className="text-[10px] px-2.5 py-1.5 rounded-lg bg-[#006AE0]/10 text-[#006AE0] hover:bg-[#006AE0]/20 transition font-medium"
                      >
                        North Region
                      </button>
                      <button
                        type="button"
                        onClick={() => selectRegion('south')}
                        className="text-[10px] px-2.5 py-1.5 rounded-lg bg-[#08DC7D]/10 text-[#08dc7d] hover:bg-[#08DC7D]/20 transition font-medium"
                      >
                        South Region
                      </button>
                      <button
                        type="button"
                        onClick={() => selectRegion('all')}
                        className="text-[10px] px-2.5 py-1.5 rounded-lg bg-[#46286E]/10 text-[#46286E] hover:bg-[#46286E]/20 transition font-medium"
                      >
                        All Branches
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-[#006AE0] uppercase tracking-widest px-1 mb-2">North Region</p>
                        <div className="grid grid-cols-1 gap-1">
                          {NORTH_BRANCHES.map(b => (
                            <label
                              key={b}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition text-xs ${
                                form.branches.includes(b)
                                  ? 'bg-white shadow-sm border border-gray-100 text-[#21264E] font-semibold'
                                  : 'text-gray-500 hover:bg-gray-100'
                              } ${(form.role === 'ASM') && form.branches.length >= 1 && !form.branches.includes(b) ? 'opacity-40 cursor-not-allowed' : ''}`}
                            >
                              <input
                                type="checkbox"
                                className="w-3.5 h-3.5 rounded border-gray-300 text-[#245bc1] focus:ring-[#245bc1]"
                                checked={form.branches.includes(b)}
                                onChange={() => {
                                  if (form.role === 'ASM' && !form.branches.includes(b)) {
                                    setForm(p => ({ ...p, branches: [b] }));
                                  } else {
                                    toggleBranch(b);
                                  }
                                }}
                                disabled={(form.role === 'ASM') && form.branches.length >= 1 && !form.branches.includes(b)}
                              />
                              {b}
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-[#08DC7D] uppercase tracking-widest px-1 mb-2">South Region</p>
                        <div className="grid grid-cols-1 gap-1">
                          {SOUTH_BRANCHES.map(b => (
                            <label
                              key={b}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition text-xs ${
                                form.branches.includes(b)
                                  ? 'bg-white shadow-sm border border-gray-100 text-[#21264E] font-semibold'
                                  : 'text-gray-500 hover:bg-gray-100'
                              } ${(form.role === 'ASM') && form.branches.length >= 1 && !form.branches.includes(b) ? 'opacity-40 cursor-not-allowed' : ''}`}
                            >
                              <input
                                type="checkbox"
                                className="w-3.5 h-3.5 rounded border-gray-300 text-[#245bc1] focus:ring-[#245bc1]"
                                checked={form.branches.includes(b)}
                                onChange={() => {
                                  if (form.role === 'ASM' && !form.branches.includes(b)) {
                                    setForm(p => ({ ...p, branches: [b] }));
                                  } else {
                                    toggleBranch(b);
                                  }
                                }}
                                disabled={(form.role === 'ASM') && form.branches.length >= 1 && !form.branches.includes(b)}
                              />
                              {b}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50 rounded-b-3xl flex gap-3 sticky bottom-0 z-10">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-500 hover:bg-gray-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-[2] px-4 py-2.5 bg-[#21264E] hover:bg-[#245bc1] text-white text-sm font-semibold rounded-xl transition disabled:opacity-50 shadow-lg shadow-[#21264E]/20"
              >
                {saving ? 'Saving...' : editingUser ? 'Update User' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
