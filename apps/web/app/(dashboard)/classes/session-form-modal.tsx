'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ClassTypeRow, StaffRow } from '../../../lib/api';

interface Props {
  types: ClassTypeRow[];
  staff: StaffRow[];
  onClose: () => void;
}

export function SessionFormModal({ types, staff, onClose }: Props) {
  const router = useRouter();
  const activeTypes = types.filter((t) => t.active);
  const activeStaff = staff.filter((s) => s.active);

  const [form, setForm] = useState({
    classTypeId: activeTypes[0]?.id ?? '',
    instructorId: '',
    startsAt: '',
    durationMin: '',
    room: '',
    capacityOverride: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedType = types.find((t) => t.id === form.classTypeId);

  const inputCls =
    'w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-green/40';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.startsAt) return;
    setBusy(true);
    setError(null);
    const payload = {
      classTypeId: form.classTypeId,
      startsAt: new Date(form.startsAt).toISOString(),
      ...(form.instructorId ? { instructorId: form.instructorId } : {}),
      ...(form.durationMin ? { durationMin: Number(form.durationMin) } : {}),
      ...(form.room ? { room: form.room } : {}),
      ...(form.capacityOverride ? { capacityOverride: Number(form.capacityOverride) } : {}),
    };
    try {
      const res = await fetch('/api/proxy/classes/sessions', {
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
          <h2 className="text-base font-semibold text-text">New session</h2>
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
                  onChange={(e) => setForm((f) => ({ ...f, classTypeId: e.target.value }))}
                  className={inputCls}
                >
                  {activeTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nameEn} ({t.durationMin} min, cap {t.capacity})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-text2">Start date & time *</label>
                <input
                  required
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                  className={inputCls}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-text2">
                    Duration (min)
                    {selectedType && (
                      <span className="text-text3 ml-1">default {selectedType.durationMin}</span>
                    )}
                  </label>
                  <input
                    type="number"
                    min={5}
                    value={form.durationMin}
                    onChange={(e) => setForm((f) => ({ ...f, durationMin: e.target.value }))}
                    className={inputCls}
                    placeholder={selectedType ? String(selectedType.durationMin) : 'mins'}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-text2">
                    Capacity override
                    {selectedType && (
                      <span className="text-text3 ml-1">default {selectedType.capacity}</span>
                    )}
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={form.capacityOverride}
                    onChange={(e) => setForm((f) => ({ ...f, capacityOverride: e.target.value }))}
                    className={inputCls}
                    placeholder={selectedType ? String(selectedType.capacity) : ''}
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
                  {busy ? 'Scheduling…' : 'Schedule session'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
