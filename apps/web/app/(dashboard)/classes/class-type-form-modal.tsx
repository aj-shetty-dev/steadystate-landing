'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '../../../lib/api';
import type { ClassTypeRow } from '../../../lib/api';
const PRESET_COLORS = [
  '#22c55e', '#3b82f6', '#f97316', '#a855f7',
  '#ec4899', '#14b8a6', '#eab308', '#ef4444',
];

interface Props {
  type?: ClassTypeRow | null;
  onClose: () => void;
}

export function ClassTypeFormModal({ type, onClose }: Props) {
  const router = useRouter();
  const editing = !!type;
  const [form, setForm] = useState({
    nameEn: type?.nameEn ?? '',
    nameAr: type?.nameAr ?? '',
    description: type?.description ?? '',
    durationMin: type?.durationMin ?? 60,
    capacity: type?.capacity ?? 20,
    color: type?.color ?? '#22c55e',
    requiresEquipment: type?.requiresEquipment ?? false,
    dropInPriceAed: type?.dropInPriceAed?.toString() ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputCls =
    'w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-green/40';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      nameEn: form.nameEn,
      ...(form.nameAr ? { nameAr: form.nameAr } : {}),
      ...(form.description ? { description: form.description } : {}),
      durationMin: Number(form.durationMin),
      capacity: Number(form.capacity),
      color: form.color,
      requiresEquipment: form.requiresEquipment,
      ...(form.dropInPriceAed ? { dropInPriceAed: Number(form.dropInPriceAed) } : {}),
    };
    try {
      const url = editing
        ? `/classes/types/${type!.id}`
        : '/classes/types';
      await apiFetch(url, {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      
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
      <div className="bg-surface border border-border rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text">
            {editing ? 'Edit class type' : 'New class type'}
          </h2>
          <button
            onClick={onClose}
            className="text-text3 hover:text-text transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }} className="p-6 space-y-4">
          {error && (
            <div className="rounded-md bg-error/10 text-error text-sm px-4 py-3 ring-1 ring-error/20">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <label className="text-xs font-medium text-text2">Name (EN) *</label>
              <input
                required
                value={form.nameEn}
                onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))}
                className={inputCls}
                placeholder="e.g. Yoga Flow"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-xs font-medium text-text2">Name (AR)</label>
              <input
                value={form.nameAr}
                onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))}
                className={inputCls}
                placeholder="بالعربية"
                dir="rtl"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-xs font-medium text-text2">Description</label>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className={inputCls}
                placeholder="Optional description…"
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
            <div className="space-y-1">
              <label className="text-xs font-medium text-text2">Capacity *</label>
              <input
                required
                type="number"
                min={1}
                value={form.capacity}
                onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value) }))}
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-text2">Drop-in price (AED)</label>
              <input
                type="number"
                min={0}
                value={form.dropInPriceAed}
                onChange={(e) => setForm((f) => ({ ...f, dropInPriceAed: e.target.value }))}
                className={inputCls}
                placeholder="Leave blank if N/A"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-text2">Color</label>
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-md border border-border flex-shrink-0"
                  style={{ backgroundColor: form.color }}
                />
                <input
                  type="text"
                  maxLength={7}
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className={`${inputCls} font-mono`}
                  placeholder="#22c55e"
                />
              </div>
              <div className="flex gap-1 flex-wrap mt-1">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className={`w-5 h-5 rounded-full border-2 transition-all ${form.color === c ? 'border-text scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.requiresEquipment}
              onChange={(e) => setForm((f) => ({ ...f, requiresEquipment: e.target.checked }))}
              className="w-4 h-4 accent-green"
            />
            <span className="text-sm text-text">Requires equipment</span>
          </label>

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
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
