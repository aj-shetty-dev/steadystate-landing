'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ClassTypeRow, StaffRow } from '../../../lib/api';

const DAYS = [
  { label: 'Sun', value: 0 },
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
];

interface Props {
  types: ClassTypeRow[];
  staff: StaffRow[];
  onClose: () => void;
}

export function RecurrenceFormModal({ types, staff, onClose }: Props) {
  const router = useRouter();
  const activeTypes = types.filter((t) => t.active);
  const activeStaff = staff.filter((s) => s.active);

  const [form, setForm] = useState({
    classTypeId: activeTypes[0]?.id ?? '',
    instructorId: '',
    daysOfWeek: [] as number[],
    startTime: '07:00',
    durationMin: activeTypes[0]?.durationMin ?? 60,
    room: '',
    validFrom: new Date().toISOString().slice(0, 10),
    validUntil: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputCls =
    'w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-green/40';

  function toggleDay(day: number) {
    setForm((f) => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(day)
        ? f.daysOfWeek.filter((d) => d !== day)
        : [...f.daysOfWeek, day],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.daysOfWeek.length === 0) {
      setError('Select at least one day of week');
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      classTypeId: form.classTypeId,
      daysOfWeek: form.daysOfWeek,
      startTime: form.startTime,
      durationMin: Number(form.durationMin),
      validFrom: new Date(form.validFrom + 'T00:00:00').toISOString(),
      ...(form.instructorId ? { instructorId: form.instructorId } : {}),
      ...(form.room ? { room: form.room } : {}),
      ...(form.validUntil ? { validUntil: new Date(form.validUntil + 'T23:59:59').toISOString() } : {}),
    };
    try {
      const res = await fetch('/api/proxy/classes/recurrences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(b.message ?? `Error ${res.status}`);
      }
      router.refresh();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-surface border border-border rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text">New recurring schedule</h2>
          <button onClick={onClose} className="text-text3 hover:text-text transition-colors text-xl leading-none">
            ×
          </button>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }} className="p-6 space-y-4">
          {error && (
            <div className="rounded-md bg-error/10 text-error text-sm px-4 py-3 ring-1 ring-error/20">
              {error}
            </div>
          )}

          {activeTypes.length === 0 ? (
            <p className="text-sm text-text3">No active class types. Create a class type first.</p>
          ) : (
            <>
              <div className="space-y-1">
                <label className="text-xs font-medium text-text2">Class type *</label>
                <select
                  required
                  value={form.classTypeId}
                  onChange={(e) => {
                    const t = types.find((x) => x.id === e.target.value);
                    setForm((f) => ({ ...f, classTypeId: e.target.value, durationMin: t?.durationMin ?? f.durationMin }));
                  }}
                  className={inputCls}
                >
                  {activeTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.nameEn}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-text2">Days of week *</label>
                <div className="flex gap-1.5 flex-wrap">
                  {DAYS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDay(d.value)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                        form.daysOfWeek.includes(d.value)
                          ? 'bg-green/10 text-green border-green/30'
                          : 'border-border text-text2 hover:bg-surface2'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-text2">Start time *</label>
                  <input
                    required
                    type="time"
                    value={form.startTime}
                    onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-text2">Duration (min) *</label>
                  <input
                    required
                    type="number"
                    min={5}
                    value={form.durationMin}
                    onChange={(e) => setForm((f) => ({ ...f, durationMin: Number(e.target.value) }))}
                    className={inputCls}
                  />
                </div>
              </div>

              {activeStaff.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-text2">Instructor</label>
                  <select
                    value={form.instructorId}
                    onChange={(e) => setForm((f) => ({ ...f, instructorId: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="">— No instructor —</option>
                    {activeStaff.map((s) => (
                      <option key={s.id} value={s.id}>{s.fullName} ({s.role})</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-text2">Room</label>
                <input
                  type="text"
                  value={form.room}
                  onChange={(e) => setForm((f) => ({ ...f, room: e.target.value }))}
                  className={inputCls}
                  placeholder="e.g. Studio A"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-text2">Valid from *</label>
                  <input
                    required
                    type="date"
                    value={form.validFrom}
                    onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-text2">Valid until</label>
                  <input
                    type="date"
                    value={form.validUntil}
                    onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
                    className={inputCls}
                    placeholder="No end date"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-text2 hover:bg-surface2 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-green text-white text-sm font-medium hover:bg-green/90 disabled:opacity-50 transition-colors"
                >
                  {busy ? 'Creating…' : 'Create recurrence'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
