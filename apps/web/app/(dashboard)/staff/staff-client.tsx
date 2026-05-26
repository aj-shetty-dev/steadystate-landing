'use client';

import {
  Check,
  Key,
  MoreVertical,
  Plus,
  RefreshCw,
  UserCog,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EmptyState } from '../../../components/ui/empty-state';
import { PageHeader } from '../../../components/ui/page-header';
import { StatusBadge } from '../../../components/ui/status-badge';
import type { StaffRow } from '../../../lib/api';

const ROLES = ['TRAINER', 'RECEPTION', 'MANAGER', 'CLEANER', 'OTHER'] as const;

function fmt(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toISOString().slice(0, 10);
}

interface Props {
  staff: StaffRow[];
  initialError: string | null;
}

export function StaffClient({ staff: initialStaff, initialError }: Props) {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffRow[]>(initialStaff);
  const [error, setError] = useState<string | null>(null);

  // Form modal
  const [showForm, setShowForm] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffRow | null>(null);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    role: 'TRAINER' as string,
    hourlyRateAed: '',
    commissionPercent: '',
    color: '#22c55e',
    userId: '',
  });
  const [saving, setSaving] = useState(false);

  // PIN modal
  const [showPin, setShowPin] = useState(false);
  const [pinTarget, setPinTarget] = useState<StaffRow | null>(null);
  const [pinValue, setPinValue] = useState('');
  const [savingPin, setSavingPin] = useState(false);

  // Action menu
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  function resetForm() {
    setFormData({
      fullName: '',
      email: '',
      phone: '',
      role: 'TRAINER',
      hourlyRateAed: '',
      commissionPercent: '',
      color: '#22c55e',
      userId: '',
    });
  }

  function openAdd() {
    setEditingStaff(null);
    resetForm();
    setShowForm(true);
  }

  function openEdit(s: StaffRow) {
    setEditingStaff(s);
    setFormData({
      fullName: s.fullName,
      email: s.email ?? '',
      phone: s.phone ?? '',
      role: s.role,
      hourlyRateAed: s.hourlyRateAed != null ? String(s.hourlyRateAed) : '',
      commissionPercent: s.commissionPercent != null ? String(s.commissionPercent) : '',
      color: s.color ?? '#22c55e',
      userId: s.userId ?? '',
    });
    setShowForm(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const body = {
        fullName: formData.fullName.trim(),
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        role: formData.role,
        hourlyRateAed: formData.hourlyRateAed ? Number(formData.hourlyRateAed) : undefined,
        commissionPercent: formData.commissionPercent ? Number(formData.commissionPercent) : undefined,
        color: formData.color,
        userId: formData.userId.trim() || undefined,
      };

      if (editingStaff) {
        const res = await fetch(`/api/proxy/staff/${editingStaff.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const b = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(b.message ?? `Error ${res.status}`);
        }
        const updated = (await res.json()) as StaffRow;
        setStaff((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      } else {
        const res = await fetch('/api/proxy/staff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const b = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(b.message ?? `Error ${res.status}`);
        }
        const created = (await res.json()) as StaffRow;
        setStaff((prev) => [...prev, created]);
      }
      setShowForm(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSetPin() {
    if (!pinTarget || pinValue.length < 4) return;
    setSavingPin(true);
    setError(null);
    try {
      const res = await fetch(`/api/proxy/staff/${pinTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinValue }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(b.message ?? `Error ${res.status}`);
      }
      setShowPin(false);
      setPinTarget(null);
      setPinValue('');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingPin(false);
    }
  }

  async function handleDeactivate(s: StaffRow) {
    setError(null);
    try {
      const res = await fetch(`/api/proxy/staff/${s.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(b.message ?? `Error ${res.status}`);
      }
      setStaff((prev) => prev.map((x) => (x.id === s.id ? { ...x, active: false, terminatedAt: new Date().toISOString() } : x)));
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
    setOpenMenuId(null);
  }

  async function handleReactivate(s: StaffRow) {
    setError(null);
    try {
      const res = await fetch(`/api/proxy/staff/${s.id}/reactivate`, { method: 'POST' });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(b.message ?? `Error ${res.status}`);
      }
      setStaff((prev) => prev.map((x) => (x.id === s.id ? { ...x, active: true, terminatedAt: null } : x)));
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
    setOpenMenuId(null);
  }

  function aed(fils: number | null): string {
    if (fils == null) return '—';
    return `AED ${(fils / 100).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  const displayError = error ?? initialError;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Staff"
        description="Trainers, front desk, and managers with kiosk access."
        actions={
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green text-white text-sm font-medium hover:bg-green/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add staff
          </button>
        }
      />

      {displayError && (
        <div className="rounded-md bg-error/10 text-error text-sm px-4 py-3 ring-1 ring-error/20 flex items-center justify-between">
          <span>{displayError}</span>
          <button onClick={() => setError(null)} className="text-error/70 hover:text-error">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        {staff.length === 0 ? (
          <EmptyState
            icon={UserCog}
            title="No staff yet"
            description="Add a trainer or front-desk user to enable kiosk check-ins and POS."
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface2 text-text3 text-[11px] font-medium uppercase tracking-wider border-b border-border">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Role</th>
                <th className="text-left px-4 py-3">Contact</th>
                <th className="text-left px-4 py-3">Rate / Comm.</th>
                <th className="text-left px-4 py-3">Hired</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className="border-t border-border hover:bg-surface2/60 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0 ring-1 ring-inset ring-black/10 dark:ring-white/10"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="text-text font-medium">{s.fullName}</span>
                      {s.pinHash && <Key className="w-3 h-3 text-green flex-shrink-0" />}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text2">{s.role}</td>
                  <td className="px-4 py-3 text-text2">
                    <div>{s.email ?? '—'}</div>
                    {s.phone && <div className="text-xs text-text3 tabular-nums">{s.phone}</div>}
                  </td>
                  <td className="px-4 py-3 text-text2 text-xs">
                    <div>{aed(s.hourlyRateAed)}/hr</div>
                    {s.commissionPercent != null && (
                      <div className="text-text3">{s.commissionPercent}% comm.</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text2 tabular-nums">{fmt(s.hiredAt)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.active ? 'ACTIVE' : 'INACTIVE'} />
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="relative flex justify-end">
                      <button
                        onClick={() => setOpenMenuId(openMenuId === s.id ? null : s.id)}
                        className="p-1.5 rounded-md hover:bg-surface2 text-text3 hover:text-text transition-colors"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {openMenuId === s.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                          <div className="absolute right-0 top-8 z-20 min-w-[150px] rounded-lg border border-border bg-surface shadow-lg py-1">
                            <button
                              className="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-surface2 transition-colors"
                              onClick={() => { setOpenMenuId(null); openEdit(s); }}
                            >
                              Edit
                            </button>
                            <button
                              className="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-surface2 transition-colors"
                              onClick={() => { setOpenMenuId(null); setPinTarget(s); setPinValue(''); setShowPin(true); }}
                            >
                              {s.pinHash ? 'Reset PIN' : 'Set PIN'}
                            </button>
                            <div className="my-1 border-t border-border" />
                            {s.active ? (
                              <button
                                className="w-full text-left px-3 py-1.5 text-sm text-error hover:bg-error/5 transition-colors"
                                onClick={() => void handleDeactivate(s)}
                              >
                                Deactivate
                              </button>
                            ) : (
                              <button
                                className="w-full text-left px-3 py-1.5 text-sm text-green hover:bg-green/5 transition-colors"
                                onClick={() => void handleReactivate(s)}
                              >
                                Reactivate
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Add / Edit Staff Modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[5vh]">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowForm(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-surface shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-text">
                {editingStaff ? 'Edit Staff' : 'Add Staff'}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-text3 hover:text-text">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-text3 block mb-1">Full name *</label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData((d) => ({ ...d, fullName: e.target.value }))}
                  placeholder="Ahmed Al-Rashid"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface2 text-text placeholder-text3 focus:outline-none focus:ring-2 focus:ring-green/40"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-text3 block mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData((d) => ({ ...d, email: e.target.value }))}
                    placeholder="ahmed@example.com"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface2 text-text placeholder-text3 focus:outline-none focus:ring-2 focus:ring-green/40"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-text3 block mb-1">Phone</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData((d) => ({ ...d, phone: e.target.value }))}
                    placeholder="+971501234567"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface2 text-text placeholder-text3 focus:outline-none focus:ring-2 focus:ring-green/40"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-text3 block mb-1">Role *</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData((d) => ({ ...d, role: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface2 text-text focus:outline-none focus:ring-2 focus:ring-green/40"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-text3 block mb-1">Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formData.color}
                      onChange={(e) => setFormData((d) => ({ ...d, color: e.target.value }))}
                      className="w-9 h-9 rounded-md border border-border cursor-pointer"
                    />
                    <input
                      type="text"
                      value={formData.color}
                      onChange={(e) => setFormData((d) => ({ ...d, color: e.target.value }))}
                      className="flex-1 px-3 py-2 text-sm rounded-lg border border-border bg-surface2 text-text font-mono focus:outline-none focus:ring-2 focus:ring-green/40"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-text3 block mb-1">
                    Hourly rate (fils, e.g. 5000 = AED 50)
                  </label>
                  <input
                    type="number"
                    value={formData.hourlyRateAed}
                    onChange={(e) => setFormData((d) => ({ ...d, hourlyRateAed: e.target.value }))}
                    placeholder="5000"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface2 text-text placeholder-text3 focus:outline-none focus:ring-2 focus:ring-green/40"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-text3 block mb-1">Commission %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.commissionPercent}
                    onChange={(e) => setFormData((d) => ({ ...d, commissionPercent: e.target.value }))}
                    placeholder="5"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface2 text-text placeholder-text3 focus:outline-none focus:ring-2 focus:ring-green/40"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-text3 block mb-1">
                  Link User ID (optional — for dashboard login)
                </label>
                <input
                  type="text"
                  value={formData.userId}
                  onChange={(e) => setFormData((d) => ({ ...d, userId: e.target.value }))}
                  placeholder="UUID of the User record"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface2 text-text placeholder-text3 focus:outline-none focus:ring-2 focus:ring-green/40"
                />
                <p className="text-xs text-text3 mt-1">Link a User account to grant dashboard access to this staff member.</p>
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-5">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg border border-border text-sm text-text2 hover:bg-surface2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={saving || !formData.fullName.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green text-white text-sm font-medium hover:bg-green/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : editingStaff ? (
                  'Save changes'
                ) : (
                  'Add staff'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Set / Reset PIN Modal ── */}
      {showPin && pinTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowPin(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-surface shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-text">
                {pinTarget.pinHash ? 'Reset PIN' : 'Set Kiosk PIN'}
              </h3>
              <button onClick={() => setShowPin(false)} className="text-text3 hover:text-text">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-text2 mb-3">
              {pinTarget.pinHash
                ? `Enter a new PIN for ${pinTarget.fullName}. Leave empty to remove kiosk access.`
                : `Set a PIN for ${pinTarget.fullName} to enable kiosk check-in access.`}
            </p>
            <div className="mb-4">
              <label className="text-xs font-medium text-text3 block mb-1">PIN (4–8 digits)</label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                value={pinValue}
                onChange={(e) => setPinValue(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="1234"
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface2 text-text placeholder-text3 focus:outline-none focus:ring-2 focus:ring-green/40 font-mono tracking-widest"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') void handleSetPin(); }}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowPin(false)}
                className="px-4 py-2 rounded-lg border border-border text-sm text-text2 hover:bg-surface2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSetPin()}
                disabled={savingPin}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green text-white text-sm font-medium hover:bg-green/90 disabled:opacity-50 transition-colors"
              >
                {savingPin ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Save PIN
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
