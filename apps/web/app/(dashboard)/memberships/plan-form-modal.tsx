'use client';

import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { SelectField } from '../../../components/ui/select-field';
import type { MembershipPlanRow } from '../../../lib/api';

interface Props {
  plan?: MembershipPlanRow | null;
  onClose: () => void;
}

type FormState = {
  nameEn: string;
  nameAr: string;
  description: string;
  durationDays: string;
  priceAed: string;
  vatRate: string;
  includesClasses: boolean;
  maxFreezeDays: string;
};

const VAT_OPTIONS = [
  { value: '0', label: '0%' },
  { value: '5', label: '5% (UAE standard)' },
];

const inputCls =
  'w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-text placeholder-text3 focus:outline-none focus:ring-2 focus:ring-green/40 focus:border-green/60 transition-colors';

export function PlanFormModal({ plan, onClose }: Props) {
  const router = useRouter();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(plan);

  const [form, setForm] = useState<FormState>({
    nameEn: plan?.nameEn ?? '',
    nameAr: plan?.nameAr ?? '',
    description: plan?.description ?? '',
    durationDays: String(plan?.durationDays ?? 30),
    priceAed: String(plan?.priceAed ?? ''),
    vatRate: String(plan?.vatRate ?? 5),
    includesClasses: plan?.includesClasses ?? false,
    maxFreezeDays: String(plan?.maxFreezeDays ?? 0),
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function setStr(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload: Record<string, unknown> = {
      nameEn: form.nameEn.trim(),
      durationDays: parseInt(form.durationDays, 10),
      priceAed: parseInt(form.priceAed, 10),
      vatRate: parseInt(form.vatRate, 10),
      includesClasses: form.includesClasses,
      maxFreezeDays: parseInt(form.maxFreezeDays, 10),
    };
    if (form.nameAr.trim()) payload.nameAr = form.nameAr.trim();
    if (form.description.trim()) payload.description = form.description.trim();

    try {
      const url = isEdit
        ? `/api/proxy/membership-plans/${plan!.id}`
        : '/api/proxy/membership-plans';
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Error ${res.status}`);
      }
      router.refresh();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? 'Edit plan' : 'Create plan'}
    >
      <div className="w-full max-w-md bg-surface h-full overflow-y-auto shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <h2 className="text-lg font-semibold text-text">
            {isEdit ? 'Edit Plan' : 'Create Plan'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-text3 hover:text-text hover:bg-surface2 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="flex flex-col gap-5 px-6 py-6 flex-1"
        >
          {error && (
            <div className="rounded-md bg-error/10 text-error text-sm px-4 py-3 ring-1 ring-error/20">
              {error}
            </div>
          )}

          {/* Name */}
          <div className="space-y-4">
            <p className="text-[11px] font-semibold text-text3 uppercase tracking-widest">
              Plan Details
            </p>

            <Field label="Name (English)" required>
              <input
                type="text"
                required
                maxLength={160}
                placeholder="Monthly Gold"
                value={form.nameEn}
                onChange={setStr('nameEn')}
                className={inputCls}
              />
            </Field>

            <Field label="Name (Arabic)" hint="Shown to Arabic-speaking members">
              <input
                type="text"
                maxLength={160}
                placeholder="ذهبي شهري"
                value={form.nameAr}
                onChange={setStr('nameAr')}
                className={inputCls}
                dir="rtl"
              />
            </Field>

            <Field label="Description">
              <textarea
                rows={2}
                maxLength={2000}
                placeholder="Brief description…"
                value={form.description}
                onChange={setStr('description')}
                className={`${inputCls} resize-none`}
              />
            </Field>
          </div>

          <div className="border-t border-border" />

          {/* Pricing */}
          <div className="space-y-4">
            <p className="text-[11px] font-semibold text-text3 uppercase tracking-widest">
              Pricing
            </p>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Price (AED)" required>
                <input
                  type="number"
                  required
                  min={0}
                  step={1}
                  placeholder="499"
                  value={form.priceAed}
                  onChange={setStr('priceAed')}
                  className={inputCls}
                />
              </Field>

              <Field label="VAT Rate">
                <SelectField
                  value={form.vatRate}
                  onChange={(v) => setForm((f) => ({ ...f, vatRate: v }))}
                  options={VAT_OPTIONS}
                />
              </Field>
            </div>
          </div>

          <div className="border-t border-border" />

          {/* Terms */}
          <div className="space-y-4">
            <p className="text-[11px] font-semibold text-text3 uppercase tracking-widest">
              Terms
            </p>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Duration (days)" required>
                <input
                  type="number"
                  required
                  min={1}
                  max={3650}
                  placeholder="30"
                  value={form.durationDays}
                  onChange={setStr('durationDays')}
                  className={inputCls}
                />
              </Field>

              <Field label="Max Freeze Days">
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={form.maxFreezeDays}
                  onChange={setStr('maxFreezeDays')}
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.includesClasses}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, includesClasses: e.target.checked }))
                  }
                  className="w-4 h-4 accent-green rounded"
                />
                <span className="text-sm text-text">Includes class bookings</span>
              </label>
            </div>
          </div>

          <div className="mt-auto pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg border border-border text-text2 text-sm font-medium hover:bg-surface2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-lg bg-green text-white text-sm font-medium hover:bg-green/90 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-text2 uppercase tracking-wide">
        {label}
        {required && <span className="text-error ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-text3">{hint}</p>}
    </div>
  );
}
