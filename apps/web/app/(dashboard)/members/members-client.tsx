'use client';

import { MoreHorizontal, Pencil, Upload, UserX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import { PageHeader } from '../../../components/ui/page-header';
import { StatusBadge } from '../../../components/ui/status-badge';
import type { MemberRow, Paginated } from '../../../lib/api';
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
  onEdit: () => void;
  onDeactivate: () => void;
  deactivating: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

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

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 min-w-[160px] bg-surface border border-border rounded-lg shadow-lg py-1 text-sm"
            style={{ top: pos.top, right: pos.right }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit(); }}
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
        </>
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

  // Local search value drives the input; a debounced effect pushes it to the URL.
  const [search, setSearch] = useState(initialSearch);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync when the server re-renders with new URL params (e.g. tab click resets search)
  useEffect(() => { setSearch(initialSearch); }, [initialSearch]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const next = buildUrl({ search: search.trim(), status: initialStatus, page: 1 });
      router.push(next);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function handleStatus(status: string) {
    router.push(buildUrl({ search: search.trim(), status, page: 1 }));
  }

  function handlePage(page: number) {
    router.push(buildUrl({ search: search.trim(), status: initialStatus, page }));
  }

  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editMember, setEditMember] = useState<MemberRow | null>(null);
  const [deactivating, setDeactivating] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<MemberRow | null>(null);

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  async function handleDeactivate(m: MemberRow) {
    if (m.membershipStatus === 'CANCELLED') return;
    setDeactivating(m.id);
    try {
      const res = await fetch(`/api/proxy/members/${m.id}/deactivate`, { method: 'PATCH' });
      if (!res.ok) throw new Error('Failed to deactivate');
      router.refresh();
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
      <div className="mb-4 flex items-center gap-1 border-b border-border overflow-x-auto">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleStatus(tab.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              initialStatus === tab.key
                ? 'border-green text-green'
                : 'border-transparent text-text3 hover:text-text2'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="search"
          placeholder="Search by name, phone, or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder-text3 focus:outline-none focus:ring-2 focus:ring-green/40 focus:border-green/60 transition-colors"
        />
      </div>

      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        {data.items.length === 0 ? (
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
          <table className="w-full text-sm">
            <thead className="bg-surface2 text-text3 text-[11px] font-medium uppercase tracking-wider border-b border-border">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Phone</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Plan</th>
                <th className="text-left px-4 py-3">Provider</th>
                <th className="text-left px-4 py-3">Last check-in</th>
                <th className="text-left px-4 py-3">Joined</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((m) => (
                <tr
                  key={m.id}
                  className="border-t border-border hover:bg-surface2/60 transition-colors"
                >
                  <td
                    onClick={() => router.push(`/members/${m.id}`)}
                    className="px-4 py-3 text-green font-medium cursor-pointer"
                  >
                    {m.fullName}
                  </td>
                  <td className="px-4 py-3 text-text2 tabular-nums">{m.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={m.membershipStatus} />
                  </td>
                  <td className="px-4 py-3 text-text2">
                    {m.activePlanNames.length > 0
                      ? m.activePlanNames.join(', ')
                      : <span className="text-text3">—</span>}
                  </td>
                  <td className="px-4 py-3 text-text2 capitalize">{m.provider.toLowerCase()}</td>
                  <td className="px-4 py-3 text-text2 tabular-nums">{fmt(m.lastCheckinAt)}</td>
                  <td className="px-4 py-3 text-text2 tabular-nums">{fmt(m.joinedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <RowActionsMenu
                      member={m}
                      onEdit={() => setEditMember(m)}
                      onDeactivate={() => setConfirmTarget(m)}
                      deactivating={deactivating === m.id}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Footer: count + pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface2/40">
          <p className="text-xs text-text3 tabular-nums">
            {data.total === 0
              ? 'No members'
              : `${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} of ${data.total} members`}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePage(data.page - 1)}
                disabled={data.page <= 1}
                className="rounded-md border border-border px-3 py-1 text-xs text-text2 hover:bg-surface2 disabled:opacity-40 transition-colors"
              >
                ← Prev
              </button>
              <span className="text-xs text-text3 tabular-nums">
                {data.page} / {totalPages}
              </span>
              <button
                onClick={() => handlePage(data.page + 1)}
                disabled={data.page >= totalPages}
                className="rounded-md border border-border px-3 py-1 text-xs text-text2 hover:bg-surface2 disabled:opacity-40 transition-colors"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showAdd && <MemberFormModal onClose={() => setShowAdd(false)} />}
      {showImport && <CsvImportModal onClose={() => setShowImport(false)} />}
      {editMember && <MemberFormModal member={editMember} onClose={() => setEditMember(null)} />}
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
