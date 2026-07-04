'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ConfirmDialog } from '../../../../components/ui/confirm-dialog';
import { SelectField } from '../../../../components/ui/select-field';
import { StatusBadge } from '../../../../components/ui/status-badge';
import type { MembershipPlanRow, MembershipRow } from '../../../../lib/api';
import { apiFetch } from '../../../../lib/api';

interface Props {
  memberId: string;
  membership: MembershipRow | null;
}

export function MembershipActionsClient({ memberId, membership }: Props) {
  const router = useRouter();
  const [plans, setPlans] = useState<MembershipPlanRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Assign flow
  const [showAssign, setShowAssign] = useState(false);
  const [assignPlanId, setAssignPlanId] = useState('');
  const [assignStart, setAssignStart] = useState('');

  // Change plan flow
  const [showChangePlan, setShowChangePlan] = useState(false);
  const [newPlanId, setNewPlanId] = useState('');
  const [changePlanStart, setChangePlanStart] = useState('');

  // Cancel / freeze
  const [showCancel, setShowCancel] = useState(false);
  const [showFreeze, setShowFreeze] = useState(false);
  const [freezeStart, setFreezeStart] = useState('');
  const [freezeEnd, setFreezeEnd] = useState('');
  const [freezeReason, setFreezeReason] = useState('');

  useEffect(() => {
    apiFetch<MembershipPlanRow[]>('/membership-plans?active=true')
      
      .then((data) => setPlans(data))
      .catch(() => null);
  }, []);

  const planOptions = plans.map((p) => ({
    value: p.id,
    label: `${p.nameEn} — AED ${p.priceAed.toLocaleString('en-AE')} / ${p.durationDays}d`,
  }));

  // Plans available for "change to" — exclude current plan
  const changePlanOptions = plans
    .filter((p) => p.id !== membership?.planId)
    .map((p) => ({
      value: p.id,
      label: `${p.nameEn} — AED ${p.priceAed.toLocaleString('en-AE')} / ${p.durationDays}d`,
    }));

  async function doAction(path: string, body?: object) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(path, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAssign() {
    const start = assignStart
      ? new Date(assignStart + 'T00:00:00').toISOString()
      : new Date().toISOString();
    setShowAssign(false);
    await doAction('/memberships', { memberId, planId: assignPlanId, startDate: start });
  }

  async function handleChangePlan() {
    const start = changePlanStart
      ? new Date(changePlanStart + 'T00:00:00').toISOString()
      : undefined;
    setShowChangePlan(false);
    await doAction(`/memberships/${membership!.id}/change-plan`, {
      newPlanId,
      ...(start ? { startDate: start } : {}),
    });
  }

  async function handleFreeze() {
    setShowFreeze(false);
    await doAction(`/memberships/${membership!.id}/freeze`, {
      startDate: new Date(freezeStart + 'T00:00:00').toISOString(),
      endDate: new Date(freezeEnd + 'T00:00:00').toISOString(),
      ...(freezeReason ? { reason: freezeReason } : {}),
    });
  }

  const canAssign = !membership || membership.status === 'CANCELLED' || membership.status === 'EXPIRED';
  const canActivate = membership?.status === 'PENDING_PAYMENT';
  const canFreeze = membership?.status === 'ACTIVE';
  const canUnfreeze = membership?.status === 'FROZEN';
  const canChangePlan =
    membership &&
    membership.status !== 'CANCELLED' &&
    membership.status !== 'EXPIRED' &&
    changePlanOptions.length > 0;
  const canCancel = membership && membership.status !== 'CANCELLED' && membership.status !== 'EXPIRED';

  const inputCls =
    'w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-green/40';

  return (
    <>
      {error && (
        <div className="mt-3 rounded-md bg-error/10 text-error text-sm px-3 py-2 ring-1 ring-error/20">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-4">
        {canAssign && plans.length > 0 && (
          <button
            onClick={() => { setAssignPlanId(''); setAssignStart(''); setShowAssign(true); }}
            disabled={busy}
            className="px-3 py-1.5 text-xs rounded-md bg-green/10 text-green hover:bg-green/20 font-medium disabled:opacity-40 transition-colors"
          >
            Assign plan
          </button>
        )}
        {canActivate && (
          <button
            onClick={() => void doAction(`/memberships/${membership!.id}/activate`)}
            disabled={busy}
            className="px-3 py-1.5 text-xs rounded-md bg-green/10 text-green hover:bg-green/20 font-medium disabled:opacity-40 transition-colors"
          >
            Activate
          </button>
        )}
        {canFreeze && (
          <button
            onClick={() => { setFreezeStart(''); setFreezeEnd(''); setFreezeReason(''); setShowFreeze(true); }}
            disabled={busy}
            className="px-3 py-1.5 text-xs rounded-md bg-surface2 text-text2 hover:bg-border/40 font-medium disabled:opacity-40 transition-colors"
          >
            Freeze
          </button>
        )}
        {canUnfreeze && (
          <button
            onClick={() => void doAction(`/memberships/${membership!.id}/unfreeze`)}
            disabled={busy}
            className="px-3 py-1.5 text-xs rounded-md bg-surface2 text-text2 hover:bg-border/40 font-medium disabled:opacity-40 transition-colors"
          >
            Unfreeze
          </button>
        )}
        {canChangePlan && (
          <button
            onClick={() => { setNewPlanId(''); setChangePlanStart(''); setShowChangePlan(true); }}
            disabled={busy}
            className="px-3 py-1.5 text-xs rounded-md bg-surface2 text-text2 hover:bg-border/40 font-medium disabled:opacity-40 transition-colors flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            Change plan
          </button>
        )}
        {canCancel && (
          <button
            onClick={() => setShowCancel(true)}
            disabled={busy}
            className="px-3 py-1.5 text-xs rounded-md bg-error/10 text-error hover:bg-error/20 font-medium disabled:opacity-40 transition-colors"
          >
            Cancel membership
          </button>
        )}
      </div>

      {/* ── Assign plan modal ── */}
      {showAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-surface border border-border rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-text mb-4">Assign membership plan</h3>
            <div className="space-y-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text2 uppercase tracking-wide">Plan</label>
                <SelectField value={assignPlanId} onChange={setAssignPlanId} options={planOptions} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text2 uppercase tracking-wide">
                  Start date <span className="normal-case text-text3 font-normal">(defaults to today)</span>
                </label>
                <input
                  type="date"
                  value={assignStart}
                  onChange={(e) => setAssignStart(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowAssign(false)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-border text-text2 text-sm font-medium hover:bg-surface2 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={!assignPlanId}
                onClick={() => void handleAssign()}
                className="flex-1 px-4 py-2.5 rounded-lg bg-green text-white text-sm font-medium hover:bg-green/90 disabled:opacity-50 transition-colors"
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Change plan modal ── */}
      {showChangePlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-surface border border-border rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-text mb-1">Change membership plan</h3>
            {membership && (
              <p className="text-sm text-text2 mb-4">
                Currently on <span className="font-medium text-text">{membership.plan.nameEn}</span>
              </p>
            )}
            <div className="space-y-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text2 uppercase tracking-wide">New plan</label>
                <SelectField value={newPlanId} onChange={setNewPlanId} options={changePlanOptions} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text2 uppercase tracking-wide">
                  Start date <span className="normal-case text-text3 font-normal">(defaults to today)</span>
                </label>
                <input
                  type="date"
                  value={changePlanStart}
                  onChange={(e) => setChangePlanStart(e.target.value)}
                  className={inputCls}
                />
              </div>
              <p className="text-xs text-warning bg-warning/5 rounded-md px-3 py-2 ring-1 ring-warning/20">
                The current membership will be cancelled and a new ACTIVE one created immediately.
              </p>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowChangePlan(false)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-border text-text2 text-sm font-medium hover:bg-surface2 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={!newPlanId}
                onClick={() => void handleChangePlan()}
                className="flex-1 px-4 py-2.5 rounded-lg bg-green text-white text-sm font-medium hover:bg-green/90 disabled:opacity-50 transition-colors"
              >
                Change plan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Freeze modal ── */}
      {showFreeze && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-surface border border-border rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-text mb-1">Freeze membership</h3>
            {membership && (
              <p className="text-sm text-text2 mb-4">
                <StatusBadge status={membership.status} /> {membership.plan.nameEn}
              </p>
            )}
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-text2 uppercase tracking-wide">Start date</label>
                <input type="date" value={freezeStart} onChange={(e) => setFreezeStart(e.target.value)} className={inputCls} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-text2 uppercase tracking-wide">End date</label>
                <input type="date" value={freezeEnd} onChange={(e) => setFreezeEnd(e.target.value)} className={inputCls} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-text2 uppercase tracking-wide">Reason (optional)</label>
                <input
                  type="text"
                  maxLength={500}
                  placeholder="Injury, travel…"
                  value={freezeReason}
                  onChange={(e) => setFreezeReason(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
            {freezeStart && freezeEnd && freezeEnd < freezeStart && (
              <p className="text-xs text-error">End date must be on or after the start date.</p>
            )}
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowFreeze(false)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-border text-text2 text-sm font-medium hover:bg-surface2 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={!freezeStart || !freezeEnd || freezeEnd < freezeStart}
                onClick={() => void handleFreeze()}
                className="flex-1 px-4 py-2.5 rounded-lg bg-green text-white text-sm font-medium hover:bg-green/90 disabled:opacity-50 transition-colors"
              >
                Freeze
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel confirm ── */}
      {showCancel && (
        <ConfirmDialog
          title="Cancel membership"
          message="Cancel this membership? The member will lose access immediately."
          confirmLabel="Cancel membership"
          destructive
          onConfirm={() => {
            setShowCancel(false);
            void doAction(`/memberships/${membership!.id}/cancel`);
          }}
          onCancel={() => setShowCancel(false)}
        />
      )}
    </>
  );
}
