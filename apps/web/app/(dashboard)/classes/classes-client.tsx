'use client';

import {
  CalendarDays,
  CalendarRange,
  ListChecks,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import { EmptyState } from '../../../components/ui/empty-state';
import { StatusBadge } from '../../../components/ui/status-badge';
import type {
  ClassRecurrenceRow,
  ClassSessionRow,
  ClassTypeRow,
  StaffRow,
} from '../../../lib/api';
import { ClassTypeFormModal } from './class-type-form-modal';
import { RecurrenceFormModal } from './recurrence-form-modal';
import { SessionDetailModal } from './session-detail-modal';
import { SessionFormModal } from './session-form-modal';

const DAY_LABELS: Record<number, string> = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };

const SESSION_STATUS_TABS = [
  { label: 'All', value: '' },
  { label: 'Scheduled', value: 'SCHEDULED' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

const DATE_PRESETS = [
  { label: 'Today', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
];

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtDuration(start: string, end: string) {
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
  return mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 > 0 ? ` ${mins % 60}m` : ''}` : `${mins}m`;
}

type Tab = 'sessions' | 'types' | 'recurrences';

interface Props {
  sessions: ClassSessionRow[];
  types: ClassTypeRow[];
  recurrences: ClassRecurrenceRow[];
  staff: StaffRow[];
  initialStatus: string;
  initialTypeId: string;
  initialFrom: string;
  initialTo: string;
}

function buildUrl(params: {
  status: string;
  typeId: string;
  from: string;
  to: string;
}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.typeId) qs.set('typeId', params.typeId);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  const str = qs.toString();
  return str ? `/classes?${str}` : '/classes';
}

export function ClassesClient({
  sessions,
  types,
  recurrences,
  staff,
  initialStatus,
  initialTypeId,
  initialFrom,
  initialTo,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('sessions');

  // Sessions filter state (URL-synced)
  const [selectedStatus, setSelectedStatus] = useState(initialStatus);
  const [selectedTypeId, setSelectedTypeId] = useState(initialTypeId);
  const [fromDate, setFromDate] = useState(initialFrom);
  const [toDate, setToDate] = useState(initialTo);
  const [typeSearch, setTypeSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync props → state on URL navigation
  useEffect(() => { setSelectedStatus(initialStatus); }, [initialStatus]);
  useEffect(() => { setSelectedTypeId(initialTypeId); }, [initialTypeId]);
  useEffect(() => { setFromDate(initialFrom); }, [initialFrom]);
  useEffect(() => { setToDate(initialTo); }, [initialTo]);
  // Cleanup on unmount
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const push = useCallback(
    (overrides: Partial<{ status: string; typeId: string; from: string; to: string }>) => {
      router.push(
        buildUrl({
          status: overrides.status ?? selectedStatus,
          typeId: overrides.typeId ?? selectedTypeId,
          from: overrides.from ?? fromDate,
          to: overrides.to ?? toDate,
        }),
      );
    },
    [router, selectedStatus, selectedTypeId, fromDate, toDate],
  );

  function applyPreset(days: number) {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from.getTime() + days * 86400_000);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);
    setFromDate(fromStr);
    setToDate(toStr);
    push({ from: fromStr, to: toStr });
  }

  // Session actions
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [cancelSessionTarget, setCancelSessionTarget] = useState<ClassSessionRow | null>(null);
  const [cancellingSession, setCancellingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [detailSession, setDetailSession] = useState<ClassSessionRow | null>(null);

  // Class type actions
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [editingType, setEditingType] = useState<ClassTypeRow | null>(null);
  const [archiveTypeTarget, setArchiveTypeTarget] = useState<ClassTypeRow | null>(null);
  const [typeError, setTypeError] = useState<string | null>(null);

  // Recurrence actions
  const [showRecurrenceForm, setShowRecurrenceForm] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<ClassRecurrenceRow | null>(null);
  const [recError, setRecError] = useState<string | null>(null);

  // Session form modal
  const [showSessionForm, setShowSessionForm] = useState(false);

  async function doSessionCancel(sessionId: string) {
    setCancellingSession(true);
    setSessionError(null);
    try {
      const res = await fetch(`/api/proxy/classes/sessions/${sessionId}/cancel`, { method: 'POST' });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(b.message ?? `Error ${res.status}`);
      }
      setCancelSessionTarget(null);
      setDetailSession(null);
      router.refresh();
    } catch (err) {
      setSessionError((err as Error).message);
    } finally {
      setCancellingSession(false);
    }
  }

  async function doArchiveType(typeId: string) {
    setTypeError(null);
    try {
      const res = await fetch(`/api/proxy/classes/types/${typeId}`, { method: 'DELETE' });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(b.message ?? `Error ${res.status}`);
      }
      setArchiveTypeTarget(null);
      router.refresh();
    } catch (err) {
      setTypeError((err as Error).message);
    }
  }

  async function doDeactivateRecurrence(recId: string) {
    setRecError(null);
    try {
      const res = await fetch(`/api/proxy/classes/recurrences/${recId}`, { method: 'DELETE' });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(b.message ?? `Error ${res.status}`);
      }
      setDeactivateTarget(null);
      router.refresh();
    } catch (err) {
      setRecError((err as Error).message);
    }
  }

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-md transition-colors ${
      tab === t ? 'bg-green/10 text-green' : 'text-text2 hover:text-text hover:bg-surface2'
    }`;

  const filteredTypes = typeSearch.trim()
    ? types.filter((t) => t.nameEn.toLowerCase().includes(typeSearch.toLowerCase()))
    : types;

  return (
    <div className="space-y-4">
      {/* Tab bar + top actions */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-1">
          <button className={tabCls('sessions')} onClick={() => setTab('sessions')}>
            <span className="flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              Sessions
            </span>
          </button>
          <button className={tabCls('types')} onClick={() => setTab('types')}>
            <span className="flex items-center gap-1.5">
              <ListChecks className="w-3.5 h-3.5" />
              Class Types
            </span>
          </button>
          <button className={tabCls('recurrences')} onClick={() => setTab('recurrences')}>
            <span className="flex items-center gap-1.5">
              <CalendarRange className="w-3.5 h-3.5" />
              Recurrences
            </span>
          </button>
        </div>

        {tab === 'sessions' && (
          <button
            onClick={() => setShowSessionForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green text-white text-sm font-medium hover:bg-green/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New session
          </button>
        )}
        {tab === 'types' && (
          <button
            onClick={() => { setEditingType(null); setShowTypeForm(true); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green text-white text-sm font-medium hover:bg-green/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add class type
          </button>
        )}
        {tab === 'recurrences' && (
          <button
            onClick={() => setShowRecurrenceForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green text-white text-sm font-medium hover:bg-green/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add recurrence
          </button>
        )}
      </div>

      {/* ── Sessions tab ── */}
      {tab === 'sessions' && (
        <div className="space-y-3">
          {sessionError && (
            <div className="rounded-md bg-error/10 text-error text-sm px-4 py-3 ring-1 ring-error/20">
              {sessionError}
            </div>
          )}

          {/* Filters row */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
            {/* Date presets */}
            <div className="flex items-center gap-1">
              {DATE_PRESETS.map((p) => (
                <button
                  key={p.days}
                  onClick={() => applyPreset(p.days)}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-border text-text2 hover:bg-surface2 transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom date range */}
            <div className="flex items-center gap-2 text-sm">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  if (debounceRef.current) clearTimeout(debounceRef.current);
                  debounceRef.current = setTimeout(() => push({ from: e.target.value }), 400);
                }}
                className="rounded-lg border border-border bg-surface2 px-2 py-1.5 text-xs text-text focus:outline-none focus:ring-2 focus:ring-green/40"
              />
              <span className="text-text3">→</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  if (debounceRef.current) clearTimeout(debounceRef.current);
                  debounceRef.current = setTimeout(() => push({ to: e.target.value }), 400);
                }}
                className="rounded-lg border border-border bg-surface2 px-2 py-1.5 text-xs text-text focus:outline-none focus:ring-2 focus:ring-green/40"
              />
            </div>

            {/* Status tabs */}
            <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-1">
              {SESSION_STATUS_TABS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => { setSelectedStatus(t.value); push({ status: t.value }); }}
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

            {/* Class type filter */}
            {types.filter((t) => t.active).length > 0 && (
              <select
                value={selectedTypeId}
                onChange={(e) => { setSelectedTypeId(e.target.value); push({ typeId: e.target.value }); }}
                className="rounded-lg border border-border bg-surface2 px-3 py-1.5 text-xs text-text focus:outline-none focus:ring-2 focus:ring-green/40"
              >
                <option value="">All class types</option>
                {types.filter((t) => t.active).map((t) => (
                  <option key={t.id} value={t.id}>{t.nameEn}</option>
                ))}
              </select>
            )}
          </div>

          {/* Sessions table */}
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            {sessions.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="No sessions found"
                description="Try adjusting the date range or filters, or create a new session."
              />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-surface2 text-text3 text-[11px] font-medium uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3">When</th>
                    <th className="text-left px-4 py-3">Class</th>
                    <th className="text-left px-4 py-3">Instructor</th>
                    <th className="text-left px-4 py-3">Room</th>
                    <th className="text-left px-4 py-3">Capacity</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => setDetailSession(s)}
                      className="border-t border-border hover:bg-surface2/60 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 tabular-nums text-text2">
                        <div>{fmtDate(s.startsAt)}</div>
                        <div className="text-xs text-text3">
                          {fmtTime(s.startsAt)} · {fmtDuration(s.startsAt, s.endsAt)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: s.classType.color }}
                          />
                          <span className="font-medium text-text">{s.classType.nameEn}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text2">{s.instructor?.fullName ?? '—'}</td>
                      <td className="px-4 py-3 text-text2">{s.room ?? '—'}</td>
                      <td className="px-4 py-3 tabular-nums">
                        <span className={s._count.bookings >= (s.capacityOverride ?? s.classType.capacity) ? 'text-orange-500' : 'text-text2'}>
                          {s._count.bookings}
                        </span>
                        <span className="text-text3"> / {s.capacityOverride ?? s.classType.capacity}</span>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
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
                              <div className="absolute right-0 top-8 z-20 min-w-[140px] rounded-lg border border-border bg-surface shadow-lg py-1">
                                <button
                                  className="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-surface2 transition-colors"
                                  onClick={() => { setOpenMenuId(null); setDetailSession(s); }}
                                >
                                  View bookings
                                </button>
                                {s.status === 'SCHEDULED' && (
                                  <>
                                    <div className="my-1 border-t border-border" />
                                    <button
                                      className="w-full text-left px-3 py-1.5 text-sm text-error hover:bg-error/5 transition-colors"
                                      onClick={() => { setOpenMenuId(null); setCancelSessionTarget(s); }}
                                    >
                                      Cancel session
                                    </button>
                                  </>
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

          <p className="text-xs text-text3 text-right px-1">
            {sessions.length} session{sessions.length !== 1 ? 's' : ''} in range
          </p>
        </div>
      )}

      {/* ── Class Types tab ── */}
      {tab === 'types' && (
        <div className="space-y-3">
          {typeError && (
            <div className="rounded-md bg-error/10 text-error text-sm px-4 py-3 ring-1 ring-error/20">
              {typeError}
            </div>
          )}

          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text3 pointer-events-none" />
            <input
              type="search"
              placeholder="Search class types…"
              value={typeSearch}
              onChange={(e) => setTypeSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-surface2 text-text placeholder-text3 focus:outline-none focus:ring-2 focus:ring-green/40"
            />
          </div>

          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            {filteredTypes.length === 0 ? (
              <EmptyState
                icon={ListChecks}
                title="No class types yet"
                description="Create your first class type to start scheduling sessions."
              />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-surface2 text-text3 text-[11px] font-medium uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3">Name</th>
                    <th className="text-left px-4 py-3">Duration</th>
                    <th className="text-left px-4 py-3">Capacity</th>
                    <th className="text-left px-4 py-3">Drop-in</th>
                    <th className="text-left px-4 py-3">Equipment</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTypes.map((t) => (
                    <tr key={t.id} className="border-t border-border hover:bg-surface2/60 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: t.color }}
                          />
                          <span className="font-medium text-text">{t.nameEn}</span>
                          {t.nameAr && <span className="text-text3 text-xs">{t.nameAr}</span>}
                        </div>
                        {t.description && <p className="text-xs text-text3 mt-0.5 ml-5 truncate max-w-xs">{t.description}</p>}
                      </td>
                      <td className="px-4 py-3 text-text2 tabular-nums">{t.durationMin} min</td>
                      <td className="px-4 py-3 text-text2 tabular-nums">{t.capacity}</td>
                      <td className="px-4 py-3 text-text2 tabular-nums">
                        {t.dropInPriceAed != null ? `AED ${t.dropInPriceAed}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-text2">
                        {t.requiresEquipment ? (
                          <span className="text-xs bg-orange-500/10 text-orange-600 px-1.5 py-0.5 rounded">Yes</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={t.active ? 'ACTIVE' : 'ARCHIVED'} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="relative flex justify-end">
                          <button
                            onClick={() => setOpenMenuId(openMenuId === t.id ? null : t.id)}
                            className="p-1.5 rounded-md hover:bg-surface2 text-text3 hover:text-text transition-colors"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          {openMenuId === t.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                              <div className="absolute right-0 top-8 z-20 min-w-[140px] rounded-lg border border-border bg-surface shadow-lg py-1">
                                <button
                                  className="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-surface2 transition-colors"
                                  onClick={() => { setOpenMenuId(null); setEditingType(t); setShowTypeForm(true); }}
                                >
                                  Edit
                                </button>
                                {t.active && (
                                  <>
                                    <div className="my-1 border-t border-border" />
                                    <button
                                      className="w-full text-left px-3 py-1.5 text-sm text-error hover:bg-error/5 transition-colors"
                                      onClick={() => { setOpenMenuId(null); setArchiveTypeTarget(t); }}
                                    >
                                      Archive
                                    </button>
                                  </>
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
        </div>
      )}

      {/* ── Recurrences tab ── */}
      {tab === 'recurrences' && (
        <div className="space-y-3">
          {recError && (
            <div className="rounded-md bg-error/10 text-error text-sm px-4 py-3 ring-1 ring-error/20">
              {recError}
            </div>
          )}

          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            {recurrences.length === 0 ? (
              <EmptyState
                icon={CalendarRange}
                title="No recurring schedules"
                description="Add a recurrence to automatically generate sessions on a weekly pattern."
              />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-surface2 text-text3 text-[11px] font-medium uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3">Class</th>
                    <th className="text-left px-4 py-3">Days</th>
                    <th className="text-left px-4 py-3">Time</th>
                    <th className="text-left px-4 py-3">Duration</th>
                    <th className="text-left px-4 py-3">Instructor</th>
                    <th className="text-left px-4 py-3">Room</th>
                    <th className="text-left px-4 py-3">Valid</th>
                    <th className="text-left px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recurrences.map((r) => (
                    <tr key={r.id} className="border-t border-border hover:bg-surface2/60 transition-colors">
                      <td className="px-4 py-3 font-medium text-text">{r.classType.nameEn}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-0.5 flex-wrap">
                          {r.daysOfWeek
                            .slice()
                            .sort((a, b) => a - b)
                            .map((d) => (
                              <span
                                key={d}
                                className="text-xs bg-green/10 text-green px-1.5 py-0.5 rounded font-medium"
                              >
                                {DAY_LABELS[d]}
                              </span>
                            ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text2 tabular-nums">{r.startTime}</td>
                      <td className="px-4 py-3 text-text2 tabular-nums">{r.durationMin} min</td>
                      <td className="px-4 py-3 text-text2">{r.instructor?.fullName ?? '—'}</td>
                      <td className="px-4 py-3 text-text2">{r.room ?? '—'}</td>
                      <td className="px-4 py-3 text-text2 tabular-nums text-xs">
                        {fmtDate(r.validFrom)}
                        {r.validUntil && ` → ${fmtDate(r.validUntil)}`}
                        {!r.validUntil && <span className="text-text3"> · ongoing</span>}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setDeactivateTarget(r)}
                          className="flex items-center gap-1 text-xs text-text2 hover:text-error transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Deactivate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Modals ── */}

      {/* Session detail / bookings */}
      {detailSession && (
        <SessionDetailModal
          session={detailSession}
          onClose={() => setDetailSession(null)}
          onCancelSession={() => void doSessionCancel(detailSession.id)}
          cancellingSession={cancellingSession}
        />
      )}

      {/* Cancel session confirm */}
      {cancelSessionTarget && !detailSession && (
        <ConfirmDialog
          title="Cancel session"
          message={`Cancel the ${cancelSessionTarget.classType.nameEn} session on ${fmtDate(cancelSessionTarget.startsAt)}? All bookings will be notified.`}
          confirmLabel="Cancel session"
          destructive
          onConfirm={() => void doSessionCancel(cancelSessionTarget.id)}
          onCancel={() => setCancelSessionTarget(null)}
        />
      )}

      {/* Session create form */}
      {showSessionForm && (
        <SessionFormModal
          types={types}
          staff={staff}
          onClose={() => setShowSessionForm(false)}
        />
      )}

      {/* Class type form */}
      {showTypeForm && (
        <ClassTypeFormModal
          type={editingType}
          onClose={() => { setShowTypeForm(false); setEditingType(null); }}
        />
      )}

      {/* Archive class type confirm */}
      {archiveTypeTarget && (
        <ConfirmDialog
          title="Archive class type"
          message={`Archive "${archiveTypeTarget.nameEn}"? It won't be available for new sessions. Existing sessions are unaffected.`}
          confirmLabel="Archive"
          destructive
          onConfirm={() => void doArchiveType(archiveTypeTarget.id)}
          onCancel={() => setArchiveTypeTarget(null)}
        />
      )}

      {/* Recurrence form */}
      {showRecurrenceForm && (
        <RecurrenceFormModal
          types={types}
          staff={staff}
          onClose={() => setShowRecurrenceForm(false)}
        />
      )}

      {/* Deactivate recurrence confirm */}
      {deactivateTarget && (
        <ConfirmDialog
          title="Deactivate recurrence"
          message={`Stop generating new sessions for the ${deactivateTarget.classType.nameEn} recurrence? Existing sessions will remain.`}
          confirmLabel="Deactivate"
          destructive
          onConfirm={() => void doDeactivateRecurrence(deactivateTarget.id)}
          onCancel={() => setDeactivateTarget(null)}
        />
      )}
    </div>
  );
}
