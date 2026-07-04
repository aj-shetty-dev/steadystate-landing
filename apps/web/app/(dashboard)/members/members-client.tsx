'use client';

import { MoreHorizontal, Pencil, Upload, UserX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import { PageHeader } from '../../../components/ui/page-header';
import { TableSkeleton } from '../../../components/skeletons/table-skeleton';
import { StatusBadge } from '../../../components/ui/status-badge';
import type { MemberDetail, MemberRow, Paginated } from '../../../lib/api';
import { apiFetch } from '../../../lib/api';
import { CsvImportModal } from './csv-import-modal';
import { MemberFormModal } from './member-form-modal';

const STATUS_TABS: { key: string; label: string }[] = [
  { key: '',               label: 'All' },
  { key: 'ACTIVE',         label: 'Active' },
  { key: 'PENDING',        label: 'Pending' },
  { key: 'PAUSED',         label: 'Paused' },
  { key: 'FROZEN',         label: 'Frozen' },
  { key: 'EXPIRED',        label: 'Expired' },
  { key: 'CANCELLED',      label: 'Cancelled' },
  { key: 'PENDING_PAYMENT', label: 'Pending Payment' },
];

function fmt(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function buildUrl(params: { search: string; status: string; page: number }): string {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  if (params.status) qs.set('status', params.status);
  if (params.page > 1) qs.set('page', String(params.page));
  const str = qs.toString();
  return str ? `/members?${str}` : '/members';
}

function RowActionsMenu({
  member,
  onEdit,
  onDeactivate,
  deactivating,
}: {
  member: MemberRow;
  onEdit: (m: MemberRow) => void;
  onDeactivate: () => void;
  deactivating: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  // Close dropdown on scroll (prevents floating menu detached from button)
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true); // capture phase catches table scroll
    return () => window.removeEventListener('scroll', close, true);
  }, [open]);

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation();
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setOpen(true);
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="p-1.5 rounded hover:bg-surface2 text-text3 hover:text-text transition-colors"
        aria-label={`Actions for ${member.fullName}`}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 min-w-[160px] bg-surface border border-border rounded-lg shadow-lg py-1 text-sm"
            style={{ top: pos.top, right: pos.right }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit(member); }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-text hover:bg-surface2 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5 text-text3 shrink-0" />
              Edit member
            </button>
            {member.membershipStatus !== 'CANCELLED' && (
              <button
                onClick={(e) => { e.stopPropagation(); setOpen(false); onDeactivate(); }}
                disabled={deactivating}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-error hover:bg-error/5 transition-colors disabled:opacity-50"
              >
                <UserX className="w-3.5 h-3.5 shrink-0" />
                Deactivate
              </button>
            )}
          </div>
        </>,
        document.body
      )}
    </>
  );
}

interface Props {
  data: Paginated<MemberRow>;
  initialSearch: string;
  initialStatus: string;
}

export function MembersClient({ data, initialSearch, initialStatus }: Props) {
  const router = useRouter();

  // ── Controlled loading / optimistic state ──
  const [isLoading, setIsLoading] = useState(false);
  const [optimisticStatus, setOptimisticStatus] = useState(initialStatus);
  const [optimisticPage, setOptimisticPage] = useState(data.page);
  const [optimisticCancelled, setOptimisticCancelled] = useState<Set<string>>(new Set());
  const activeStatus = isLoading ? optimisticStatus : initialStatus;
  const activePage = isLoading ? optimisticPage : data.page;

  // Clear loading when server data arrives
  useEffect(() => { setIsLoading(false); }, [initialStatus, data.page, data.items]);

  // Local search value drives the input; a debounced effect pushes it to the URL.
  const [search, setSearch] = useState(initialSearch);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSearchRef = useRef(initialSearch);

  // Sync when the server re-renders with new URL params
  useEffect(() => { setSearch(initialSearch); }, [initialSearch]);

  useEffect(() => {
    if (search === prevSearchRef.current) return;
    prevSearchRef.current = search;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setIsLoading(true);
      router.push(buildUrl({ search: search.trim(), status: activeStatus, page: 1 }));
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function handleStatus(status: string) {
    setOptimisticStatus(status);
    setOptimisticPage(1);
    setIsLoading(true);
    router.push(buildUrl({ search: search.trim(), status, page: 1 }));
  }

  function handlePage(page: number) {
    setOptimisticPage(page);
    setIsLoading(true);
    router.push(buildUrl({ search: search.trim(), status: initialStatus, page }));
  }

  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editMember, setEditMember] = useState<MemberRow | MemberDetail | null>(null);
  const [deactivating, setDeactivating] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<MemberRow | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  async function handleEdit(m: MemberRow) {
    setLoadingEdit(true);
    try {
      const detail = await apiFetch<MemberDetail>(`/members/${m.id}`);
      setEditMember(detail);
    } catch {
      setEditMember(m); // fall back to row data if fetch fails
    } finally {
      setLoadingEdit(false);
    }
  }

  async function handleDeactivate(m: MemberRow) {
    if (m.membershipStatus === 'CANCELLED') return;
    setDeactivating(m.id);
    setDeactivateError(null);
    setOptimisticCancelled((prev) => new Set(prev).add(m.id));
    try {
      await apiFetch(`/members/${m.id}/deactivate`, { method: 'PATCH' });
            router.refresh();
    } catch (err) {
      setDeactivateError((err as Error).message || 'Failed to deactivate member');
      setOptimisticCancelled((prev) => {
        const next = new Set(prev);
        next.delete(m.id);
        return next;
      });
    } finally {
      setDeactivating(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Members"
        description="All gym members — added manually, imported via CSV, or created at the front desk."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text2 hover:bg-surface2 hover:text-text transition-colors"
            >
              <Upload className="w-4 h-4" />
              Import CSV
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-green px-4 py-2 text-sm font-medium text-white hover:bg-green/90 transition-colors"
            >
              <span className="text-base leading-none">+</span>
              Add Member
            </button>
          </div>
        }
      />

      {/* Status filter tabs */}
      <div className="mb-4 flex items-center gap-1 border-b border-border flex-wrap">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleStatus(tab.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-all duration-200 whitespace-nowrap ${
              activeStatus === tab.key
                ? 'border-green text-green'
                : 'border-transparent text-text3 hover:text-text2'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4 relative w-full max-w-sm">
        <input
          type="search"
          placeholder="Search by name, phone, or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface pl-3 pr-8 py-2 text-sm text-text placeholder-text3 focus:outline-none focus:ring-2 focus:ring-green/40 focus:border-green/60 transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-text3 hover:text-text transition-colors"
            aria-label="Clear search"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div
        className="bg-surface border border-border rounded-lg flex flex-col flex-1 min-h-0 overflow-x-auto"
        role="region"
        aria-label="Members list"
        aria-busy={isLoading}
      >
        {isLoading && data.items.length === 0 ? (
          <TableSkeleton cols={8} rows={8} />
        ) : data.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <p className="text-text2 text-sm">
              {search ? `No members match "${search}"` : 'Import a CSV or add a member manually to get started.'}
            </p>
            {!search && (
              <div className="mt-4 flex items-center gap-3">
                <button onClick={() => setShowImport(true)} className="text-sm text-text2 hover:underline">
                  Import CSV →
                </button>
                <span className="text-text3 text-xs">or</span>
                <button onClick={() => setShowAdd(true)} className="text-sm text-green hover:underline">
                  Add member →
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Header — fixed, no scrollbar */}
            <table className="w-full text-sm table-fixed flex-shrink-0">
              <thead>
                <tr className="bg-surface2 text-text3 text-[11px] font-medium uppercase tracking-wider border-b border-border">
                  <th className="text-left px-4 py-3 w-[25%]">Name</th>
                  <th className="text-left px-4 py-3 w-[15%]">Phone</th>
                  <th className="text-left px-4 py-3 w-[10%]">Status</th>
                  <th className="text-left px-4 py-3 w-[15%]">Plan</th>
                  <th className="text-left px-4 py-3 w-[10%]">Provider</th>
                  <th className="text-left px-4 py-3 w-[10%]">Last check-in</th>
                  <th className="text-left px-4 py-3 w-[10%]">Joined</th>
                  <th className="px-4 py-3 w-[5%]" />
                </tr>
              </thead>
            </table>
            {/* Body — scrollable, scrollbar only here */}
            <div className={`transition-opacity duration-200 flex-1 min-h-0 overflow-y-auto overflow-x-auto ${isLoading ? 'opacity-50' : 'animate-fade-in'}`}>
              <table className="w-full text-sm table-fixed">
                <tbody>
                  {data.items.map((m) => {
                    const isCancelled = optimisticCancelled.has(m.id);
                    return (
                      <tr
                        key={m.id}
                        tabIndex={isCancelled ? undefined : 0}
                        role="link"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !isCancelled) {
                            e.preventDefault();
                            router.push(`/members/${m.id}`);
                          }
                        }}
                        className={`border-t border-border transition-all duration-300 outline-none focus:ring-2 focus:ring-inset focus:ring-green/30 ${
                          isCancelled ? 'opacity-40 pointer-events-none' : 'hover:bg-surface2/60 cursor-pointer'
                        }`}
                        onClick={() => { if (!isCancelled) router.push(`/members/${m.id}`); }}
                      >
                        <td
                          className="px-4 py-3 text-green font-medium w-[25%] truncate"
                          title={m.fullName}
                        >
                          {m.fullName}
                        </td>
                        <td className="px-4 py-3 text-text2 tabular-nums w-[15%] truncate" title={m.phone ?? undefined}>{m.phone ?? '—'}</td>
                        <td className="px-4 py-3 w-[10%]">
                          <StatusBadge status={m.membershipStatus} />
                        </td>
                        <td className="px-4 py-3 text-text2 w-[15%] truncate" title={m.activePlanNames.join(', ') || undefined}>
                          {m.activePlanNames.length > 0
                            ? m.activePlanNames.join(', ')
                            : <span className="text-text3">—</span>}
                        </td>
                        <td className="px-4 py-3 text-text2 capitalize w-[10%]">{m.provider.toLowerCase()}</td>
                        <td className="px-4 py-3 text-text2 tabular-nums w-[10%]">{fmt(m.lastCheckinAt)}</td>
                        <td className="px-4 py-3 text-text2 tabular-nums w-[10%]">{fmt(m.joinedAt)}</td>
                        <td className="px-4 py-3 text-right w-[5%]">
                          <RowActionsMenu
                            member={m}
                            onEdit={handleEdit}
                            onDeactivate={() => setConfirmTarget(m)}
                            deactivating={deactivating === m.id}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Footer: count + pagination */}
        {!isLoading && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface2/40 flex-shrink-0">
            <p className="text-xs text-text3 tabular-nums">
              {data.total === 0
                ? 'No members'
                : `${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} of ${data.total} members`}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePage(activePage - 1)}
                  disabled={activePage <= 1 || isLoading}
                  className="rounded-md border border-border px-3 py-1 text-xs text-text2 hover:bg-surface2 disabled:opacity-40 transition-colors"
                >
                  ← Prev
                </button>
                <span className="text-xs text-text3 tabular-nums">
                  {activePage} / {totalPages}
                </span>
                <button
                  onClick={() => handlePage(activePage + 1)}
                  disabled={activePage >= totalPages || isLoading}
                  className="rounded-md border border-border px-3 py-1 text-xs text-text2 hover:bg-surface2 disabled:opacity-40 transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Deactivate error toast */}
      {deactivateError && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-lg bg-error/10 text-error text-sm px-4 py-3 ring-1 ring-error/20 shadow-lg flex items-center gap-3">
          <span className="flex-1">{deactivateError}</span>
          <button onClick={() => setDeactivateError(null)} className="text-error/60 hover:text-error font-medium text-xs shrink-0">Dismiss</button>
        </div>
      )}

      {/* Modals */}
      {showAdd && <MemberFormModal onClose={() => setShowAdd(false)} />}
      {showImport && <CsvImportModal onClose={() => setShowImport(false)} />}
      {editMember && <MemberFormModal member={editMember as MemberDetail} onClose={() => setEditMember(null)} />}
      {confirmTarget && (
        <ConfirmDialog
          title="Deactivate member"
          message={`${confirmTarget.fullName}'s status will be set to Cancelled. You can undo this by editing the member.`}
          confirmLabel="Deactivate"
          destructive
          onConfirm={() => { void handleDeactivate(confirmTarget); setConfirmTarget(null); }}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
    </>
  );
}
