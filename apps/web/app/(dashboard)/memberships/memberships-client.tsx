'use client';

import { CreditCard, FileText, MoreVertical, Plus, RefreshCw, Search, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import { EmptyState } from '../../../components/ui/empty-state';
import { SelectField } from '../../../components/ui/select-field';
import { StatusBadge } from '../../../components/ui/status-badge';
import type { MemberRow, MembershipPlanRow, MembershipRow, Paginated, UpcomingRenewalRow } from '../../../lib/api';
import { PlanFormModal } from './plan-form-modal';

const STATUS_TABS = [
  { label: 'All', value: '' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Pending', value: 'PENDING_PAYMENT' },
  { label: 'Frozen', value: 'FROZEN' },
  { label: 'Expired', value: 'EXPIRED' },
  { label: 'Cancelled', value: 'CANCELLED' },
] as const;

interface Props {
  membershipsPage: Paginated<MembershipRow>;
  plans: MembershipPlanRow[];
  upcomingRenewals: UpcomingRenewalRow[];
  initialSearch: string;
  initialStatus: string;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtAed(v: number) {
  return `AED ${v.toLocaleString('en-AE', { minimumFractionDigits: 2 })}`;
}

type Tab = 'memberships' | 'plans' | 'renewals';

interface FreezeTarget {
  membershipId: string;
  memberName: string;
}

interface ChangePlanTarget {
  membershipId: string;
  memberName: string;
  currentPlanName: string;
}

export function MembershipsClient({ membershipsPage, plans, upcomingRenewals, initialSearch, initialStatus }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('memberships');

  // URL-state for memberships list
  const [localSearch, setLocalSearch] = useState(initialSearch);
  const [selectedStatus, setSelectedStatus] = useState(initialStatus);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local state when URL-driven props change (e.g. browser back/forward)
  useEffect(() => { setLocalSearch(initialSearch); }, [initialSearch]);
  useEffect(() => { setSelectedStatus(initialStatus); }, [initialStatus]);
  // Cleanup debounce on unmount
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const buildUrl = useCallback(
    (overrides: { search?: string; status?: string; page?: number }) => {
      const params = new URLSearchParams();
      const s = overrides.search ?? localSearch;
      const st = overrides.status ?? selectedStatus;
      const p = overrides.page ?? 1;
      if (s) params.set('search', s);
      if (st) params.set('status', st);
      if (p > 1) params.set('page', String(p));
      const qs = params.toString();
      return `/memberships${qs ? '?' + qs : ''}`;
    },
    [localSearch, selectedStatus],
  );

  function handleSearchChange(value: string) {
    setLocalSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      router.push(buildUrl({ search: value, page: 1 }));
    }, 400);
  }

  function handleStatusChange(status: string) {
    setSelectedStatus(status);
    router.push(buildUrl({ status, page: 1 }));
  }

  const { items: memberships, total, page, pageSize } = membershipsPage;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  // Membership actions
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<MembershipRow | null>(null);
  const [freezeTarget, setFreezeTarget] = useState<FreezeTarget | null>(null);
  const [freezeForm, setFreezeForm] = useState({ startDate: '', endDate: '', reason: '' });
  const [changePlanTarget, setChangePlanTarget] = useState<ChangePlanTarget | null>(null);
  const [newPlanId, setNewPlanId] = useState('');
  const [changePlanStart, setChangePlanStart] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuAnchorRect, setMenuAnchorRect] = useState<DOMRect | null>(null);

  // Assign new membership from this page
  const [showAssign, setShowAssign] = useState(false);
  const [assignMemberId, setAssignMemberId] = useState('');
  const [assignPlanId, setAssignPlanId] = useState('');
  const [assignStart, setAssignStart] = useState('');
  const [assignPaidNow, setAssignPaidNow] = useState(true);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberOptions, setMemberOptions] = useState<MemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Plan actions
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState<MembershipPlanRow | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<MembershipPlanRow | null>(null);

  // Renewals
  const [renewalsBusy, setRenewalsBusy] = useState(false);
  const [renewalsError, setRenewalsError] = useState<string | null>(null);
  const [renewalsResult, setRenewalsResult] = useState<{ due: number; created: number; skipped: number; failed: number } | null>(null);

  // Load members when assign modal opens
  useEffect(() => {
    if (!showAssign) return;
    setMembersLoading(true);
    fetch('/api/proxy/members?pageSize=100')
      .then((r) => r.json())
      .then((data: Paginated<MemberRow> | MemberRow[]) => {
        const rows = Array.isArray(data) ? data : data.items;
        setMemberOptions(rows);
      })
      .catch(() => null)
      .finally(() => setMembersLoading(false));
  }, [showAssign]);

  const filteredMembers = memberSearch.trim()
    ? memberOptions.filter((m) =>
        m.fullName.toLowerCase().includes(memberSearch.toLowerCase()) ||
        (m.phone ?? '').includes(memberSearch),
      )
    : memberOptions;

  const activePlans = plans.filter((p) => p.active);

  async function doAction(membershipId: string, action: string, body?: object) {
    setBusy(membershipId);
    setActionError(null);
    try {
      const res = await fetch(`/api/proxy/memberships/${membershipId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(b.message ?? `Error ${res.status}`);
      }
      router.refresh();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleAssignSubmit() {
    const start = assignStart
      ? new Date(assignStart + 'T00:00:00').toISOString()
      : new Date().toISOString();
    setShowAssign(false);
    setBusy('assign');
    setActionError(null);
    try {
      const res = await fetch('/api/proxy/memberships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: assignMemberId, planId: assignPlanId, startDate: start, ...(assignPaidNow ? { status: 'ACTIVE' } : {}) }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(b.message ?? `Error ${res.status}`);
      }
      router.refresh();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleChangePlan() {
    if (!changePlanTarget) return;
    const start = changePlanStart
      ? new Date(changePlanStart + 'T00:00:00').toISOString()
      : undefined;
    const target = changePlanTarget;
    setChangePlanTarget(null);
    await doAction(target.membershipId, 'change-plan', {
      newPlanId,
      ...(start ? { startDate: start } : {}),
    });
  }

  async function doArchivePlan(planId: string) {
    setActionError(null);
    try {
      const res = await fetch(`/api/proxy/membership-plans/${planId}`, { method: 'DELETE' });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(b.message ?? `Error ${res.status}`);
      }
      router.refresh();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setArchiveTarget(null);
    }
  }

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-md transition-colors ${
      tab === t ? 'bg-green/10 text-green' : 'text-text2 hover:text-text hover:bg-surface2'
    }`;

  const inputCls =
    'w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-green/40';

  return (
    <div className="space-y-4">
      {actionError && (
        <div className="rounded-md bg-error/10 text-error text-sm px-4 py-3 ring-1 ring-error/20">
          {actionError}
        </div>
      )}

      {/* Tabs + top-level actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-1 w-fit">
          <button className={tabCls('memberships')} onClick={() => setTab('memberships')}>
            Memberships
          </button>
          <button className={tabCls('plans')} onClick={() => setTab('plans')}>
            Plans
          </button>
          <button className={tabCls('renewals')} onClick={() => setTab('renewals')}>
            Auto-Renewals
            {upcomingRenewals.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-warning/20 text-warning text-[10px] font-bold px-1.5 py-0.5 min-w-[18px]">
                {upcomingRenewals.length}
              </span>
            )}
          </button>
        </div>

        {tab === 'memberships' && activePlans.length > 0 && (
          <button
            onClick={() => {
              setAssignMemberId('');
              setAssignPlanId('');
              setAssignStart('');
              setAssignPaidNow(true);
              setMemberSearch('');
              setShowAssign(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green text-white text-sm font-medium hover:bg-green/90 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Assign membership
          </button>
        )}

        {tab === 'plans' && (
          <button
            onClick={() => { setEditingPlan(null); setShowPlanForm(true); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green text-white text-sm font-medium hover:bg-green/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Plan
          </button>
        )}

        {tab === 'renewals' && (
          <button
            disabled={renewalsBusy}
            onClick={() => {
              setRenewalsBusy(true);
              setRenewalsError(null);
              setRenewalsResult(null);
              fetch('/api/proxy/memberships/process-renewals', { method: 'POST' })
                .then(async (r) => {
                  const body = await r.json() as { due: number; created: number; skipped: number; failed: number };
                  if (!r.ok) throw new Error((body as unknown as { message?: string }).message ?? `Error ${r.status}`);
                  setRenewalsResult(body);
                  router.refresh();
                })
                .catch((err: Error) => setRenewalsError(err.message))
                .finally(() => setRenewalsBusy(false));
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green text-white text-sm font-medium hover:bg-green/90 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${renewalsBusy ? 'animate-spin' : ''}`} />
            Run renewals now
          </button>
        )}
      </div>

      {/* Memberships tab */}
      {tab === 'memberships' && (
        <div className="space-y-3">
          {/* Search + status filter */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text3 pointer-events-none" />
              <input
                type="search"
                placeholder="Search by member name or phone…"
                value={localSearch}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-surface2 text-text placeholder-text3 focus:outline-none focus:ring-2 focus:ring-green/40"
              />
            </div>
            <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-1 flex-wrap">
              {STATUS_TABS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => handleStatusChange(t.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    selectedStatus === t.value
                      ? 'bg-green/10 text-green'
                      : 'text-text2 hover:text-text hover:bg-surface2'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            {memberships.length === 0 ? (
              <EmptyState
                icon={CreditCard}
                title="No memberships yet"
                description={
                  localSearch || selectedStatus
                    ? 'No results match your search or filter.'
                    : 'Click "Assign membership" above to assign a plan to a member.'
                }
              />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-surface2 text-text3 text-[11px] font-medium uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3">Member</th>
                    <th className="text-left px-4 py-3">Plan</th>
                    <th className="text-left px-4 py-3">Price</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Start</th>
                    <th className="text-left px-4 py-3">End</th>
                    <th className="text-left px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                {memberships.map((m) => {
                  const isBusy = busy === m.id;
                  const canActivate = m.status === 'PENDING_PAYMENT';
                  const canFreeze = m.status === 'ACTIVE';
                  const canUnfreeze = m.status === 'FROZEN';
                  const canChangePlan =
                    m.status !== 'CANCELLED' &&
                    m.status !== 'EXPIRED' &&
                    activePlans.some((p) => p.id !== m.planId);
                  const canCancel = m.status !== 'CANCELLED' && m.status !== 'EXPIRED';
                  return (
                    <tr
                      key={m.id}
                      onClick={() => router.push(`/members/${m.memberId}`)}
                      className="border-t border-border hover:bg-surface2/60 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 font-medium text-text">
                        {m.member.fullName}
                      </td>
                      <td className="px-4 py-3 text-text2">{m.plan.nameEn}</td>
                      <td className="px-4 py-3 text-text tabular-nums">{fmtAed(m.plan.priceAed)}</td>
                      <td className="px-4 py-3"><StatusBadge status={m.status} /></td>
                      <td className="px-4 py-3 text-text2 tabular-nums">{fmtDate(m.startDate)}</td>
                      <td className="px-4 py-3 text-text2 tabular-nums">{fmtDate(m.endDate)}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="relative flex items-center justify-end gap-2">
                          {canActivate && (
                            <button
                              disabled={isBusy}
                              onClick={() => void doAction(m.id, 'activate')}
                              className="text-xs font-medium text-green hover:underline disabled:opacity-40"
                            >
                              Mark paid
                            </button>
                          )}
                          <button
                            disabled={isBusy}
                            onClick={(e) => { setMenuAnchorRect(e.currentTarget.getBoundingClientRect()); setOpenMenuId(openMenuId === m.id ? null : m.id); }}
                            className="p-1.5 rounded-md hover:bg-surface2 text-text3 hover:text-text disabled:opacity-40 transition-colors"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          {openMenuId === m.id && menuAnchorRect && (
                            <>
                              <div
                                className="fixed inset-0 z-40"
                                onClick={() => setOpenMenuId(null)}
                              />
                              <div
                                className="fixed z-50 min-w-[160px] rounded-lg border border-border bg-surface shadow-lg py-1"
                                style={{ top: menuAnchorRect.bottom + 4, right: window.innerWidth - menuAnchorRect.right }}
                              >
                                {canActivate && (
                                  <button
                                    className="w-full text-left px-3 py-1.5 text-sm text-green hover:bg-surface2 transition-colors"
                                    onClick={() => { setOpenMenuId(null); void doAction(m.id, 'activate'); }}
                                  >
                                    Activate
                                  </button>
                                )}
                                {canFreeze && (
                                  <button
                                    className="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-surface2 transition-colors"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setFreezeTarget({ membershipId: m.id, memberName: m.member.fullName });
                                      setFreezeForm({ startDate: '', endDate: '', reason: '' });
                                    }}
                                  >
                                    Freeze
                                  </button>
                                )}
                                {canUnfreeze && (
                                  <button
                                    className="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-surface2 transition-colors"
                                    onClick={() => { setOpenMenuId(null); void doAction(m.id, 'unfreeze'); }}
                                  >
                                    Unfreeze
                                  </button>
                                )}
                                {canChangePlan && (
                                  <button
                                    className="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-surface2 transition-colors flex items-center gap-1.5"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setChangePlanTarget({
                                        membershipId: m.id,
                                        memberName: m.member.fullName,
                                        currentPlanName: m.plan.nameEn,
                                      });
                                      setNewPlanId('');
                                      setChangePlanStart('');
                                    }}
                                  >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    Change plan
                                  </button>
                                )}
                                {canCancel && (
                                  <>
                                    {(canActivate || canFreeze || canUnfreeze || canChangePlan) && (
                                      <div className="my-1 border-t border-border" />
                                    )}
                                    <button
                                      className="w-full text-left px-3 py-1.5 text-sm text-error hover:bg-error/5 transition-colors"
                                      onClick={() => { setOpenMenuId(null); setCancelTarget(m); }}
                                    >
                                      Cancel membership
                                    </button>
                                  </>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          </div>

          {/* Pagination */}
          {total > 0 && (
            <div className="flex items-center justify-between text-sm text-text2 px-1">
              <span>{rangeStart}–{rangeEnd} of {total} memberships</span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => router.push(buildUrl({ page: page - 1 }))}
                  className="px-3 py-1.5 rounded-md border border-border bg-surface text-text2 hover:bg-surface2 disabled:opacity-40 transition-colors"
                >
                  Prev
                </button>
                <span className="text-text3">{page} / {totalPages}</span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => router.push(buildUrl({ page: page + 1 }))}
                  className="px-3 py-1.5 rounded-md border border-border bg-surface text-text2 hover:bg-surface2 disabled:opacity-40 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Plans tab */}
      {tab === 'renewals' && (
        <div className="space-y-3">
          {renewalsError && (
            <div className="rounded-md bg-error/10 text-error text-sm px-4 py-3 ring-1 ring-error/20">
              {renewalsError}
            </div>
          )}
          {renewalsResult && (
            <div className="rounded-md bg-green/5 text-green text-sm px-4 py-3 ring-1 ring-green/20">
              Sweep complete — created {renewalsResult.created} renewal(s), skipped {renewalsResult.skipped}, failed {renewalsResult.failed} (of {renewalsResult.due} due).
            </div>
          )}
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            {upcomingRenewals.length === 0 ? (
              <EmptyState
                icon={RefreshCw}
                title="No upcoming auto-renewals"
                description="Memberships on auto-renew plans will appear here 30 days before their renewal date."
              />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-surface2 text-text3 text-[11px] font-medium uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3">Member</th>
                    <th className="text-left px-4 py-3">Plan</th>
                    <th className="text-left px-4 py-3">Renewal starts</th>
                    <th className="text-left px-4 py-3">Ends</th>
                    <th className="text-left px-4 py-3">Amount</th>
                    <th className="text-left px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingRenewals.map((r) => {
                    const isBusy = busy === r.id;
                    return (
                      <tr
                        key={r.id}
                        onClick={() => router.push(`/members/${r.memberId}`)}
                        className="border-t border-border hover:bg-surface2/60 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3 font-medium text-text">{r.member.fullName}</td>
                        <td className="px-4 py-3 text-text2">{r.plan.nameEn}</td>
                        <td className="px-4 py-3 text-text2 tabular-nums">{fmtDate(r.startDate)}</td>
                        <td className="px-4 py-3 text-text2 tabular-nums">{fmtDate(r.endDate)}</td>
                        <td className="px-4 py-3 text-text tabular-nums">{fmtAed(r.plan.priceAed)}</td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <button
                            disabled={isBusy}
                            onClick={() => void doAction(r.id, 'activate')}
                            className="px-2.5 py-1 text-xs rounded-md bg-green/10 text-green hover:bg-green/20 disabled:opacity-40 transition-colors font-medium"
                          >
                            {isBusy ? 'Activating…' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Plans tab */}
      {tab === 'plans' && (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          {plans.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No plans yet"
              description="Create your first membership plan to start assigning them to members."
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface2 text-text3 text-[11px] font-medium uppercase tracking-wider border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Price</th>
                  <th className="text-left px-4 py-3">Duration</th>
                  <th className="text-left px-4 py-3">Classes</th>
                  <th className="text-left px-4 py-3">Freeze days</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id} className="border-t border-border hover:bg-surface2/60 transition-colors">
                    <td className="px-4 py-3 font-medium text-text">{p.nameEn}</td>
                    <td className="px-4 py-3 text-text tabular-nums">{fmtAed(p.priceAed)}</td>
                    <td className="px-4 py-3 text-text2">{p.durationDays}d</td>
                    <td className="px-4 py-3 text-text2">{p.includesClasses ? 'Yes' : 'No'}</td>
                    <td className="px-4 py-3 text-text2">{p.maxFreezeDays}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.active ? 'bg-green/10 text-green' : 'bg-border/40 text-text3'}`}>
                        {p.active ? 'Active' : 'Archived'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => { setEditingPlan(p); setShowPlanForm(true); }}
                          className="px-2.5 py-1 text-xs rounded-md bg-surface2 text-text2 hover:bg-border/40 transition-colors"
                        >
                          Edit
                        </button>
                        {p.active && (
                          <button
                            onClick={() => setArchiveTarget(p)}
                            className="px-2.5 py-1 text-xs rounded-md bg-error/10 text-error hover:bg-error/20 transition-colors"
                          >
                            Archive
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Assign membership modal ── */}
      {showAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-surface border border-border rounded-xl shadow-xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-text mb-4">Assign membership plan</h3>
            <div className="space-y-4">
              {/* Member search */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text2 uppercase tracking-wide">Member</label>
                <input
                  type="text"
                  placeholder="Search by name or phone…"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className={inputCls}
                />
                {membersLoading && (
                  <p className="text-xs text-text3">Loading members…</p>
                )}
                {!membersLoading && filteredMembers.length > 0 && (
                  <div className="border border-border rounded-lg max-h-40 overflow-y-auto bg-surface">
                    {filteredMembers.slice(0, 50).map((mem) => (
                      <button
                        key={mem.id}
                        type="button"
                        onClick={() => { setAssignMemberId(mem.id); setMemberSearch(mem.fullName); }}
                        className={`flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-surface2 transition-colors ${assignMemberId === mem.id ? 'bg-green/5 text-green' : 'text-text'}`}
                      >
                        <span className="font-medium">{mem.fullName}</span>
                        {mem.phone && <span className="text-text3 text-xs">{mem.phone}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {!membersLoading && memberSearch && filteredMembers.length === 0 && (
                  <p className="text-xs text-text3">No members match &ldquo;{memberSearch}&rdquo;</p>
                )}
              </div>

              {/* Plan */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text2 uppercase tracking-wide">Plan</label>
                <SelectField
                  value={assignPlanId}
                  onChange={setAssignPlanId}
                  options={activePlans.map((p) => ({
                    value: p.id,
                    label: `${p.nameEn} — AED ${p.priceAed.toLocaleString('en-AE')} / ${p.durationDays}d`,
                  }))}
                />
              </div>

              {/* Start date */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text2 uppercase tracking-wide">
                  Start date <span className="normal-case font-normal text-text3">(defaults to today)</span>
                </label>
                <input
                  type="date"
                  value={assignStart}
                  onChange={(e) => setAssignStart(e.target.value)}
                  className={inputCls}
                />
              </div>

              {/* Payment received */}
              <label className="flex items-center gap-2.5 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={assignPaidNow}
                  onChange={(e) => setAssignPaidNow(e.target.checked)}
                  className="w-4 h-4 accent-green rounded"
                />
                <span className="text-sm text-text">Payment received — activate immediately</span>
              </label>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAssign(false)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-border text-text2 text-sm font-medium hover:bg-surface2 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={!assignMemberId || !assignPlanId}
                onClick={() => void handleAssignSubmit()}
                className="flex-1 px-4 py-2.5 rounded-lg bg-green text-white text-sm font-medium hover:bg-green/90 disabled:opacity-50 transition-colors"
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Change plan modal ── */}
      {changePlanTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-surface border border-border rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-text mb-1">Change membership plan</h3>
            <p className="text-sm text-text2 mb-4">
              {changePlanTarget.memberName} · currently on{' '}
              <span className="font-medium text-text">{changePlanTarget.currentPlanName}</span>
            </p>
            <div className="space-y-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text2 uppercase tracking-wide">New plan</label>
                <SelectField
                  value={newPlanId}
                  onChange={setNewPlanId}
                  options={activePlans
                    .filter((p) => p.nameEn !== changePlanTarget.currentPlanName)
                    .map((p) => ({
                      value: p.id,
                      label: `${p.nameEn} — AED ${p.priceAed.toLocaleString('en-AE')} / ${p.durationDays}d`,
                    }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text2 uppercase tracking-wide">
                  New start date <span className="normal-case font-normal text-text3">(defaults to today)</span>
                </label>
                <input
                  type="date"
                  value={changePlanStart}
                  onChange={(e) => setChangePlanStart(e.target.value)}
                  className={inputCls}
                />
              </div>
              <p className="text-xs text-warning bg-warning/5 rounded-md px-3 py-2 ring-1 ring-warning/20">
                The current membership will be cancelled and a new ACTIVE one will be created immediately.
              </p>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setChangePlanTarget(null)}
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
      {freezeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-surface border border-border rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-text mb-1">Freeze membership</h3>
            <p className="text-sm text-text2 mb-4">{freezeTarget.memberName}</p>
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-text2 uppercase tracking-wide">Start date</label>
                <input
                  type="date"
                  value={freezeForm.startDate}
                  onChange={(e) => setFreezeForm((f) => ({ ...f, startDate: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-text2 uppercase tracking-wide">End date</label>
                <input
                  type="date"
                  value={freezeForm.endDate}
                  onChange={(e) => setFreezeForm((f) => ({ ...f, endDate: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-text2 uppercase tracking-wide">Reason (optional)</label>
                <input
                  type="text"
                  maxLength={500}
                  placeholder="Injury, travel…"
                  value={freezeForm.reason}
                  onChange={(e) => setFreezeForm((f) => ({ ...f, reason: e.target.value }))}
                  className={inputCls}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setFreezeTarget(null)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-border text-text2 text-sm font-medium hover:bg-surface2 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={!freezeForm.startDate || !freezeForm.endDate}
                onClick={() => {
                  const body = {
                    startDate: new Date(freezeForm.startDate + 'T00:00:00').toISOString(),
                    endDate: new Date(freezeForm.endDate + 'T00:00:00').toISOString(),
                    ...(freezeForm.reason ? { reason: freezeForm.reason } : {}),
                  };
                  setFreezeTarget(null);
                  void doAction(freezeTarget.membershipId, 'freeze', body);
                }}
                className="flex-1 px-4 py-2.5 rounded-lg bg-green text-white text-sm font-medium hover:bg-green/90 disabled:opacity-50 transition-colors"
              >
                Freeze
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel confirm ── */}
      {cancelTarget && (
        <ConfirmDialog
          title="Cancel membership"
          message={`Cancel ${cancelTarget.member.fullName}'s ${cancelTarget.plan.nameEn} membership? This cannot be undone.`}
          confirmLabel="Cancel membership"
          destructive
          onConfirm={() => {
            const id = cancelTarget.id;
            setCancelTarget(null);
            void doAction(id, 'cancel');
          }}
          onCancel={() => setCancelTarget(null)}
        />
      )}

      {/* ── Archive confirm ── */}
      {archiveTarget && (
        <ConfirmDialog
          title="Archive plan"
          message={`Archive "${archiveTarget.nameEn}"? It won't be available for new assignments.`}
          confirmLabel="Archive"
          destructive
          onConfirm={() => void doArchivePlan(archiveTarget.id)}
          onCancel={() => setArchiveTarget(null)}
        />
      )}

      {/* ── Plan form modal ── */}
      {showPlanForm && (
        <PlanFormModal
          plan={editingPlan}
          onClose={() => {
            setShowPlanForm(false);
            setEditingPlan(null);
          }}
        />
      )}
    </div>
  );
}

