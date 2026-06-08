'use client';

import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CalendarPopover } from '../../../components/ui/calendar-popover';
import { SelectField } from '../../../components/ui/select-field';
import { apiFetch } from '../../../lib/api';
import type { MemberDetail, MemberRow, MembershipPlanRow, StaffRow } from '../../../lib/api';

interface Props {
  member?: MemberRow | MemberDetail | null;
  onClose: () => void;
}

type FormState = {
  fullName: string;
  phone: string;
  email: string;
  membershipStatus: string;
  joinedAt: string;
  preferredLocale: string;
  gender: string;
  dateOfBirth: string;
  medicalNotes: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  assignedTrainerId: string;
  planId: string;
  planStartDate: string;
};

function isDetail(m: MemberRow | MemberDetail): m is MemberDetail {
  return 'preferredLocale' in m;
}

const STATUS_OPTIONS = [
  { value: 'ACTIVE',          label: 'Active' },
  { value: 'PENDING',         label: 'Pending' },
  { value: 'PAUSED',          label: 'Paused' },
  { value: 'FROZEN',          label: 'Frozen' },
  { value: 'EXPIRED',         label: 'Expired' },
  { value: 'CANCELLED',       label: 'Cancelled' },
  { value: 'PENDING_PAYMENT', label: 'Pending Payment' },
];
const LOCALE_OPTIONS = [{ value: 'EN', label: 'English' }, { value: 'AR', label: 'العربية (Arabic)' }];
const GENDER_OPTIONS = [
  { value: '',       label: 'Not specified' },
  { value: 'MALE',   label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER',  label: 'Other' },
];

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 10);
}

export function MemberFormModal({ member, onClose }: Props) {
  const router = useRouter();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<MembershipPlanRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const isEdit = Boolean(member);

  const detail = member && isDetail(member) ? member : null;

  useEffect(() => {
    if (!isEdit) {
      apiFetch<MembershipPlanRow[]>('/membership-plans?active=true')
        .then((data: MembershipPlanRow[]) => setPlans(data))
        .catch(() => null);
    }
  }, [isEdit]);

  useEffect(() => {
    apiFetch<StaffRow[]>('/staff')
      .then((data: StaffRow[]) => setStaff(data))
      .catch(() => null);
  }, []);

  const [form, setForm] = useState<FormState>({
    fullName: member?.fullName ?? '',
    phone: member?.phone ?? '',
    email: member?.email ?? '',
    membershipStatus: member?.membershipStatus ?? 'ACTIVE',
    joinedAt: toDateInput(member?.joinedAt),
    preferredLocale: detail?.preferredLocale ?? 'EN',
    gender: detail?.gender ?? '',
    dateOfBirth: toDateInput(detail?.dateOfBirth),
    medicalNotes: detail?.medicalNotes ?? '',
    emergencyContactName: (detail?.emergencyContact as { name?: string } | undefined)?.name ?? '',
    emergencyContactPhone: (detail?.emergencyContact as { phone?: string } | undefined)?.phone ?? '',
    assignedTrainerId: detail?.assignedTrainerId ?? '',
    planId: '',
    planStartDate: '',
  });

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function set(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload: Record<string, unknown> = {
      fullName: form.fullName.trim(),
      membershipStatus: form.membershipStatus,
      preferredLocale: form.preferredLocale,
    };
    if (form.phone.trim()) {
      // Normalize: strip spaces, dashes, parentheses, and dots
      payload.phone = form.phone.trim().replace(/[\s\-\(\)\.]/g, '');
    } else {
      payload.phone = null;
    }
    if (form.email.trim()) payload.email = form.email.trim();
    else payload.email = null;
    if (form.joinedAt) payload.joinedAt = form.joinedAt;
    if (form.gender) payload.gender = form.gender;
    else payload.gender = null;
    if (form.dateOfBirth) payload.dateOfBirth = form.dateOfBirth;
    else payload.dateOfBirth = null;
    if (form.medicalNotes.trim()) payload.medicalNotes = form.medicalNotes.trim();
    else payload.medicalNotes = null;
    if (form.emergencyContactName.trim() || form.emergencyContactPhone.trim()) {
      payload.emergencyContact = {
        name: form.emergencyContactName.trim() || undefined,
        phone: form.emergencyContactPhone.trim().replace(/[\s\-\(\)\.]/g, '') || undefined,
      };
    } else {
      payload.emergencyContact = null;
    }
    if (form.assignedTrainerId) payload.assignedTrainerId = form.assignedTrainerId;
    else payload.assignedTrainerId = null;

    try {
      const url = isEdit ? `/members/${member!.id}` : '/members';
      const created = await apiFetch<{ id?: string }>(url, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      
      // On create, optionally assign a membership plan
      if (!isEdit && form.planId) {
        if (created?.id) {
          const start = form.planStartDate
            ? new Date(form.planStartDate + 'T00:00:00').toISOString()
            : new Date().toISOString();
          await apiFetch('/memberships', {
            method: 'POST',
            body: JSON.stringify({ memberId: created.id, planId: form.planId, startDate: start }),
          });
        }
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
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? 'Edit member' : 'Add member'}
    >
      <div className="w-full max-w-md bg-surface h-full overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <h2 className="text-lg font-semibold text-text">{isEdit ? 'Edit Member' : 'Add Member'}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-text3 hover:text-text hover:bg-surface2 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={(e) => { void handleSubmit(e); }} className="flex flex-col gap-5 px-6 py-6 flex-1">
          {error && (
            <div className="rounded-md bg-error/10 text-error text-sm px-4 py-3 ring-1 ring-error/20">
              {error}
            </div>
          )}

          {/* Identity */}
          <div className="space-y-4">
            <p className="text-[11px] font-semibold text-text3 uppercase tracking-widest">Identity</p>

            <Field label="Full Name" required>
              <input
                type="text" required maxLength={200}
                placeholder="Ahmed Al Mansoori"
                value={form.fullName} onChange={set('fullName')}
                className={inputCls}
              />
            </Field>

            <Field label="Phone" hint="E.164 format — e.g. +971501234567">
              <input
                type="tel" placeholder="+971501234567"
                value={form.phone} onChange={set('phone')}
                className={inputCls}
              />
            </Field>

            <Field label="Email">
              <input
                type="email" placeholder="ahmed@example.com"
                value={form.email} onChange={set('email')}
                className={inputCls}
              />
            </Field>
          </div>

          <div className="border-t border-border" />

          {/* Membership */}
          <div className="space-y-4">
            <p className="text-[11px] font-semibold text-text3 uppercase tracking-widest">Membership</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Status" required>
                <SelectField
                  value={form.membershipStatus}
                  onChange={(v) => setForm((f) => ({ ...f, membershipStatus: v }))}
                  options={STATUS_OPTIONS}
                />
              </Field>

              <Field label="Joined Date">
                <CalendarPopover
                  value={form.joinedAt}
                  onChange={(v) => setForm((f) => ({ ...f, joinedAt: v }))}
                />
              </Field>
            </div>
          </div>

          <div className="border-t border-border" />

          {/* Personal */}
          <div className="space-y-4">
            <p className="text-[11px] font-semibold text-text3 uppercase tracking-widest">Personal</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Gender">
                <SelectField
                  value={form.gender}
                  onChange={(v) => setForm((f) => ({ ...f, gender: v }))}
                  options={GENDER_OPTIONS}
                />
              </Field>

              <Field label="Date of Birth">
                <CalendarPopover
                  value={form.dateOfBirth}
                  onChange={(v) => setForm((f) => ({ ...f, dateOfBirth: v }))}
                />
              </Field>
            </div>

            <Field label="Language">
              <SelectField
                value={form.preferredLocale}
                onChange={(v) => setForm((f) => ({ ...f, preferredLocale: v }))}
                options={LOCALE_OPTIONS}
              />
            </Field>

            <Field label="Medical Notes">
              <textarea
                rows={3}
                maxLength={1000}
                placeholder="Allergies, injuries, or other relevant notes…"
                value={form.medicalNotes}
                onChange={set('medicalNotes')}
                className={`${inputCls} resize-none`}
              />
            </Field>

            <div className="border-t border-border" />
            <p className="text-[11px] font-semibold text-text3 uppercase tracking-widest">Emergency Contact</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Name">
                <input
                  type="text" maxLength={200}
                  placeholder="Contact person name"
                  value={form.emergencyContactName} onChange={set('emergencyContactName')}
                  className={inputCls}
                />
              </Field>
              <Field label="Phone">
                <input
                  type="tel" placeholder="+971501234567"
                  value={form.emergencyContactPhone} onChange={set('emergencyContactPhone')}
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label="Assigned Trainer">
              <SelectField
                value={form.assignedTrainerId}
                onChange={(v) => setForm((f) => ({ ...f, assignedTrainerId: v }))}
                options={[
                  { value: '', label: 'No trainer assigned' },
                  ...staff
                    .filter((s) => s.active)
                    .map((s) => ({ value: s.id, label: s.fullName })),
                ]}
              />
            </Field>
          </div>

          {/* Plan assignment — create only */}
          {!isEdit && plans.length > 0 && (
            <>
              <div className="border-t border-border" />
              <div className="space-y-4">
                <p className="text-[11px] font-semibold text-text3 uppercase tracking-widest">
                  Membership Plan <span className="normal-case font-normal">(optional)</span>
                </p>
                <Field label="Plan">
                  <SelectField
                    value={form.planId}
                    onChange={(v) => setForm((f) => ({ ...f, planId: v }))}
                    options={[
                      { value: '', label: 'No plan — assign later' },
                      ...plans.map((p) => ({
                        value: p.id,
                        label: `${p.nameEn} — AED ${p.priceAed.toLocaleString('en-AE')} / ${p.durationDays}d`,
                      })),
                    ]}
                  />
                </Field>
                {form.planId && (
                  <Field label="Start Date" hint="Defaults to today">
                    <CalendarPopover
                      value={form.planStartDate}
                      onChange={(v) => setForm((f) => ({ ...f, planStartDate: v }))}
                    />
                  </Field>
                )}
              </div>
            </>
          )}

          {/* Footer buttons */}
          <div className="mt-auto pt-4 flex gap-3">
            <button
              type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg border border-border text-text2 text-sm font-medium hover:bg-surface2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-lg bg-green text-white text-sm font-medium hover:bg-green/90 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-text2 uppercase tracking-wide">
        {label}{required && <span className="text-error ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-text3">{hint}</p>}
    </div>
  );
}

const inputCls = 'w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-text placeholder-text3 focus:outline-none focus:ring-2 focus:ring-green/40 focus:border-green/60 transition-colors';
