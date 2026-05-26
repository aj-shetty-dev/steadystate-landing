'use client';

import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Download,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { EmptyState } from '../../../components/ui/empty-state';
import { PageHeader } from '../../../components/ui/page-header';
import { StatusBadge } from '../../../components/ui/status-badge';
import { TableSkeleton } from '../../../components/skeletons/table-skeleton';
import type { InvoiceRow, Paginated } from '../../../lib/api';

const INVOICE_STATUSES = ['ALL', 'DUE', 'PAID', 'FAILED', 'RETRY_SCHEDULED', 'WRITTEN_OFF'] as const;

const TIMEZONES = ['Asia/Dubai', 'Asia/Muscat', 'Asia/Riyadh', 'Asia/Qatar', 'Asia/Bahrain', 'Asia/Kuwait', 'UTC'];

interface InvoiceDetail extends InvoiceRow {
  member: { id: string; fullName: string; phone: string | null; email: string | null };
  attempts: Array<{
    id: string;
    scheduledFor: string;
    outcome: string;
    attemptedAt: string | null;
    providerResponse: unknown;
  }>;
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}

function fmtInputDate(d: string): string {
  return new Date(d).toISOString().slice(0, 10);
}

function buildUrl(params: { search: string; status: string; page: number }): string {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  if (params.status && params.status !== 'ALL') qs.set('status', params.status);
  if (params.page > 1) qs.set('page', String(params.page));
  const str = qs.toString();
  return str ? `/billing?${str}` : '/billing';
}

export function BillingClient({
  invoicesPage,
  initialError,
  initialSearch,
  initialStatus,
}: {
  invoicesPage: Paginated<InvoiceRow>;
  initialError: string | null;
  initialSearch: string;
  initialStatus: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'invoices' | 'salary' | 'reconciliation'>('invoices');

  // Controlled loading / optimistic state
  const [isLoading, setIsLoading] = useState(false);
  const [optimisticStatus, setOptimisticStatus] = useState(initialStatus || 'ALL');
  const [optimisticPage, setOptimisticPage] = useState(invoicesPage.page);
  const activeStatus = isLoading ? optimisticStatus : (initialStatus || 'ALL');
  const activePage = isLoading ? optimisticPage : invoicesPage.page;

  // Clear loading when server data arrives
  useEffect(() => { setIsLoading(false); }, [initialStatus, invoicesPage.page, invoicesPage.items]);

  // Sync when server re-renders
  useEffect(() => { setOptimisticStatus(initialStatus || 'ALL'); }, [initialStatus]);
  useEffect(() => { setOptimisticPage(invoicesPage.page); }, [invoicesPage.page]);

  // ── Invoices state ──
  const { items: invoices, total } = invoicesPage;
  const [error, setError] = useState<string | null>(initialError);
  const [search, setSearch] = useState(initialSearch);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync search when URL-driven prop changes
  useEffect(() => { setSearch(initialSearch); }, [initialSearch]);
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  // ── Detail / Edit ──
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState<{ amountAed: number; vatAed: number; dueDate: string; description: string }>({ amountAed: 0, vatAed: 0, dueDate: '', description: '' });
  const [editSaving, setEditSaving] = useState(false);

  // ── Compose ──
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeSaving, setComposeSaving] = useState(false);
  const [composeForm, setComposeForm] = useState({ amountAed: 0, vatAed: 0, dueDate: '', description: '' });
  const [composeMemberSearch, setComposeMemberSearch] = useState('');
  const [composeMemberResults, setComposeMemberResults] = useState<{ id: string; fullName: string; phone: string | null }[]>([]);
  const [composeSelectedMember, setComposeSelectedMember] = useState<{ id: string; fullName: string } | null>(null);

  // ── Salary window ──
  const [salaryLoading, setSalaryLoading] = useState(false);
  const [salarySaving, setSalarySaving] = useState(false);
  const [salaryForm, setSalaryForm] = useState({ startDay: 25, endDay: 28, timezone: 'Asia/Dubai', jitterMinutes: 120 });

  // ── Reconciliation ──
  const [recon, setRecon] = useState<Record<string, string> | null>(null);
  const [reconLoading, setReconLoading] = useState(false);

  const pageSize = invoicesPage.pageSize || 50;

  function navigate(overrides: { status?: string; search?: string; page?: number }) {
    const s = overrides.search ?? search;
    const st = overrides.status ?? activeStatus;
    const p = overrides.page ?? 1;
    if (overrides.status !== undefined) setOptimisticStatus(st);
    if (overrides.page !== undefined) setOptimisticPage(p);
    setIsLoading(true);
    router.push(buildUrl({ search: s.trim(), status: st, page: p }));
  }

  function handleSearchSubmit() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    navigate({ search, page: 1 });
  }

  const loadDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/proxy/billing/invoices/${id}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Failed');
      const data = await res.json();
      setDetail(data);
      setDetailOpen(true);
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Failed to load invoice');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!composeSelectedMember) return;
    setComposeSaving(true);
    try {
      const res = await fetch('/api/proxy/billing/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: composeSelectedMember.id,
          amountAed: composeForm.amountAed,
          vatAed: composeForm.vatAed,
          dueDate: new Date(composeForm.dueDate).toISOString(),
          description: composeForm.description || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Failed');
      setComposeOpen(false);
      setComposeSelectedMember(null);
      setComposeForm({ amountAed: 0, vatAed: 0, dueDate: '', description: '' });
      router.refresh();
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Failed to create invoice');
    } finally {
      setComposeSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!detail) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/proxy/billing/invoices/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountAed: editData.amountAed,
          vatAed: editData.vatAed,
          dueDate: new Date(editData.dueDate).toISOString(),
          description: editData.description || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Failed');
      setEditOpen(false);
      router.refresh();
      loadDetail(detail.id);
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Failed to update invoice');
    } finally {
      setEditSaving(false);
    }
  };

  const handleVoid = async (id: string) => {
    try {
      const res = await fetch(`/api/proxy/billing/invoices/${id}/void`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Failed');
      router.refresh();
      loadDetail(id);
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Failed to void invoice');
    }
  };

  const handleWriteOff = async (id: string) => {
    try {
      const res = await fetch(`/api/proxy/billing/invoices/${id}/write-off`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Failed');
      router.refresh();
      loadDetail(id);
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Failed to write off invoice');
    }
  };

  const handlePaymentLink = async (id: string) => {
    try {
      const res = await fetch(`/api/proxy/billing/invoices/${id}/payment-link`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Failed');
      const data = await res.json();
      window.open(data.url, '_blank');
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Failed to generate payment link');
    }
  };

  const handleDownloadHtml = async (id: string) => {
    try {
      const res = await fetch(`/api/proxy/billing/invoices/${id}/html`);
      const data = await res.json();
      const blob = new Blob([data.html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `invoice-${id.slice(0, 8)}.html`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Failed to download invoice');
    }
  };

  const handleMemberSearch = async (q: string) => {
    setComposeMemberSearch(q);
    if (q.length < 2) { setComposeMemberResults([]); return; }
    try {
      const res = await fetch(`/api/proxy/members?search=${encodeURIComponent(q)}&take=10`);
      if (!res.ok) return;
      const data = await res.json();
      setComposeMemberResults((data.items ?? data).slice(0, 10));
    } catch { /* ignore */ }
  };

  const loadSalaryWindow = async () => {
    setSalaryLoading(true);
    try {
      const res = await fetch('/api/proxy/billing/salary-window');
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      if (data) {
        setSalaryForm({ startDay: data.startDay, endDay: data.endDay, timezone: data.timezone, jitterMinutes: data.jitterMinutes });
      }
    } catch { /* use defaults */ } finally {
      setSalaryLoading(false);
    }
  };

  const saveSalaryWindow = async () => {
    setSalarySaving(true);
    try {
      const res = await fetch('/api/proxy/billing/salary-window', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(salaryForm),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Failed');
      await res.json();
      setError(null);
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Failed to save');
    } finally {
      setSalarySaving(false);
    }
  };

  const loadReconciliation = async () => {
    setReconLoading(true);
    try {
      const res = await fetch('/api/proxy/billing/reconciliation');
      if (!res.ok) throw new Error('Failed');
      setRecon(await res.json());
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Failed to load');
    } finally {
      setReconLoading(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <PageHeader
        title="Billing"
        description="Invoice management, salary-synced retries, and revenue reconciliation."
        actions={
          <button
            onClick={() => setComposeOpen(true)}
            className="px-4 py-2 bg-green text-white rounded-lg text-sm font-medium hover:brightness-110 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> New Invoice
          </button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-surface2 rounded-lg p-1 mb-6 w-fit">
        {([
          ['invoices', 'Invoices', Wallet],
          ['salary', 'Salary Window', Calendar],
          ['reconciliation', 'Reconciliation', Settings],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => {
              setTab(key);
              if (key === 'salary') loadSalaryWindow();
              if (key === 'reconciliation') loadReconciliation();
            }}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${tab === key ? 'bg-surface text-text shadow-sm' : 'text-text3 hover:text-text'}`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 bg-error/10 border border-error/30 rounded-lg px-4 py-3 text-sm text-error flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ── Invoices Tab ── */}
      {tab === 'invoices' && (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <select
              value={activeStatus}
              onChange={(e) => navigate({ status: e.target.value, page: 1 })}
              className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text"
            >
              {INVOICE_STATUSES.map((s) => (
                <option key={s} value={s}>{s === 'ALL' ? 'All statuses' : s.replace('_', ' ').charAt(0) + s.replace('_', ' ').slice(1).toLowerCase()}</option>
              ))}
            </select>
            <div className="relative">
              <Search className="w-4 h-4 text-text3 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                className="bg-surface border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text w-56 placeholder:text-text3"
                placeholder="Search member..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearchSubmit(); }}
              />
            </div>
            <button onClick={() => { setSearch(''); navigate({ status: 'ALL', search: '', page: 1 }); }}
              className="p-2 text-text3 hover:text-text transition-colors" title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div
            className="bg-surface border border-border rounded-lg overflow-hidden"
            role="region"
            aria-label="Invoices list"
            aria-busy={isLoading}
          >
            {isLoading && invoices.length === 0 ? (
              <TableSkeleton cols={5} rows={8} />
            ) : invoices.length === 0 ? (
              <EmptyState icon={Wallet} title="No invoices found" description="Create your first invoice to get started." />
            ) : (
              <>
                <table className={`w-full text-sm transition-opacity duration-200 ${isLoading ? 'opacity-50' : ''}`}>
                  <thead className="bg-surface2 text-text3 text-[11px] font-medium uppercase tracking-wider border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-3">Member</th>
                      <th className="text-left px-4 py-3">Amount</th>
                      <th className="text-left px-4 py-3">Due</th>
                      <th className="text-left px-4 py-3">Status</th>
                      <th className="text-left px-4 py-3">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr
                        key={inv.id}
                        onClick={() => loadDetail(inv.id)}
                        className="border-t border-border hover:bg-surface2/60 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3">
                          <div className="text-text font-medium">{inv.member.fullName}</div>
                          <div className="text-text3 text-xs tabular-nums">{inv.member.phone ?? '—'}</div>
                        </td>
                        <td className="px-4 py-3 text-text font-medium tabular-nums">
                          AED {((inv.amountAed + inv.vatAed) / 100).toFixed(2)}
                          {inv.vatAed > 0 && <span className="text-text3 text-xs ml-1">(incl. VAT)</span>}
                        </td>
                        <td className="px-4 py-3 text-text2 tabular-nums">{new Date(inv.dueDate).toLocaleDateString()}</td>
                        <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                        <td className="px-4 py-3 text-text2 max-w-xs truncate">{inv.description ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!isLoading && (
                  <div className="flex items-center justify-between px-4 py-3 text-xs text-text3 border-t border-border bg-surface2/40">
                    <span>{total} total</span>
                    {totalPages > 1 && (
                      <div className="flex items-center gap-2">
                        <button disabled={activePage <= 1 || isLoading}
                          onClick={() => navigate({ page: activePage - 1 })}
                          className="px-2 py-1 rounded border border-border disabled:opacity-40 hover:bg-surface2">Prev</button>
                        <span>Page {activePage} of {totalPages}</span>
                        <button disabled={activePage >= totalPages || isLoading}
                          onClick={() => navigate({ page: activePage + 1 })}
                          className="px-2 py-1 rounded border border-border disabled:opacity-40 hover:bg-surface2">Next</button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* ── Salary Window Tab ── */}
      {tab === 'salary' && (
        <div className="bg-surface border border-border rounded-lg p-6 max-w-lg">
          {salaryLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 text-text3 animate-spin" /></div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-text2 mb-1.5">Start Day</label>
                  <input type="number" min={1} max={28} value={salaryForm.startDay}
                    onChange={(e) => setSalaryForm({ ...salaryForm, startDay: Number(e.target.value) })}
                    className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text2 mb-1.5">End Day</label>
                  <input type="number" min={1} max={31} value={salaryForm.endDay}
                    onChange={(e) => setSalaryForm({ ...salaryForm, endDay: Number(e.target.value) })}
                    className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text2 mb-1.5">Timezone</label>
                  <select value={salaryForm.timezone}
                    onChange={(e) => setSalaryForm({ ...salaryForm, timezone: e.target.value })}
                    className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text">
                    {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text2 mb-1.5">Jitter (minutes)</label>
                  <input type="number" min={0} max={1440} value={salaryForm.jitterMinutes}
                    onChange={(e) => setSalaryForm({ ...salaryForm, jitterMinutes: Number(e.target.value) })}
                    className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text" />
                </div>
              </div>
              <p className="text-xs text-text3">
                Retries are scheduled between day {salaryForm.startDay}–{salaryForm.endDay} of each month in {salaryForm.timezone}, with messages spread across {salaryForm.jitterMinutes} minutes.
              </p>
              <button onClick={saveSalaryWindow} disabled={salarySaving}
                className="px-4 py-2 bg-green text-white rounded-lg text-sm font-medium hover:brightness-110 transition-all disabled:opacity-40 flex items-center gap-2">
                {salarySaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {salarySaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Reconciliation Tab ── */}
      {tab === 'reconciliation' && (
        <div className="bg-surface border border-border rounded-lg p-6">
          {reconLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 text-text3 animate-spin" /></div>
          ) : recon ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-surface2 border border-border rounded-lg p-4">
                <div className="text-text3 text-xs uppercase tracking-wider mb-1">POS Revenue</div>
                <div className="text-lg font-semibold text-text">AED {recon.posRevenueAed}</div>
              </div>
              <div className="bg-surface2 border border-border rounded-lg p-4">
                <div className="text-text3 text-xs uppercase tracking-wider mb-1">Invoice Revenue</div>
                <div className="text-lg font-semibold text-text">AED {recon.invoiceRevenueAed}</div>
              </div>
              <div className="bg-surface2 border border-border rounded-lg p-4">
                <div className="text-text3 text-xs uppercase tracking-wider mb-1">Total Revenue</div>
                <div className="text-lg font-semibold text-text">AED {recon.totalRevenueAed}</div>
              </div>
              <div className="bg-surface2 border border-border rounded-lg p-4">
                <div className="text-text3 text-xs uppercase tracking-wider mb-1">Active Members</div>
                <div className="text-lg font-semibold text-text">{recon.activeMembers}</div>
                <div className="text-xs text-text2 mt-1">Est. AED {recon.estimatedMonthlyAed}/mo</div>
              </div>
            </div>
          ) : (
            <button onClick={loadReconciliation} className="text-sm text-green hover:underline">Load reconciliation data</button>
          )}
        </div>
      )}

      {/* ── Detail Slide-over ── */}
      {detailOpen && detail && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setDetailOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-md bg-surface border-l border-border h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-surface z-10">
              <h2 className="text-base font-semibold text-text">Invoice #{detail.id.slice(0, 8)}</h2>
              <button onClick={() => setDetailOpen(false)} className="p-1 text-text3 hover:text-text"><X className="w-5 h-5" /></button>
            </div>

            {detailLoading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-text3 animate-spin" /></div>
            ) : (
              <div className="p-5 space-y-5">
                <div>
                  <div className="text-xs font-medium text-text3 uppercase tracking-wider mb-2">Bill To</div>
                  <div className="text-text font-semibold">{detail.member.fullName}</div>
                  {detail.member.phone && <div className="text-text2 text-sm">{detail.member.phone}</div>}
                  {detail.member.email && <div className="text-text2 text-sm">{detail.member.email}</div>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-surface2 rounded-lg p-3">
                    <div className="text-text3 text-xs mb-0.5">Amount</div>
                    <div className="text-text font-semibold">AED {((detail.amountAed + detail.vatAed) / 100).toFixed(2)}</div>
                    {detail.vatAed > 0 && <div className="text-text3 text-xs">incl. VAT AED {(detail.vatAed / 100).toFixed(2)}</div>}
                  </div>
                  <div className="bg-surface2 rounded-lg p-3">
                    <div className="text-text3 text-xs mb-0.5">Due Date</div>
                    <div className="text-text font-semibold">{new Date(detail.dueDate).toLocaleDateString()}</div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-text3 uppercase tracking-wider mb-1">Status</div>
                  <StatusBadge status={detail.status} />
                  {detail.description && <p className="text-text2 text-sm mt-2">{detail.description}</p>}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  {detail.status === 'DUE' && (
                    <>
                      <button onClick={() => {
                        setEditData({
                          amountAed: detail.amountAed,
                          vatAed: detail.vatAed,
                          dueDate: fmtInputDate(detail.dueDate),
                          description: detail.description ?? '',
                        });
                        setEditOpen(true);
                      }}
                        className="px-3 py-1.5 bg-surface2 border border-border rounded-lg text-sm text-text2 hover:text-text transition-colors flex items-center gap-1.5">
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button onClick={() => handleVoid(detail.id)}
                        className="px-3 py-1.5 bg-surface2 border border-border rounded-lg text-sm text-text2 hover:text-error transition-colors flex items-center gap-1.5">
                        <Trash2 className="w-3.5 h-3.5" /> Void
                      </button>
                    </>
                  )}
                  {(detail.status === 'FAILED' || detail.status === 'RETRY_SCHEDULED') && (
                    <button onClick={() => handleWriteOff(detail.id)}
                      className="px-3 py-1.5 bg-surface2 border border-border rounded-lg text-sm text-text2 hover:text-text transition-colors flex items-center gap-1.5">
                      <Trash2 className="w-3.5 h-3.5" /> Write Off
                    </button>
                  )}
                  <button onClick={() => handlePaymentLink(detail.id)}
                    className="px-3 py-1.5 bg-surface2 border border-border rounded-lg text-sm text-text2 hover:text-text transition-colors flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" /> Payment Link
                  </button>
                  <button onClick={() => handleDownloadHtml(detail.id)}
                    className="px-3 py-1.5 bg-surface2 border border-border rounded-lg text-sm text-text2 hover:text-text transition-colors flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                </div>

                {/* Attempts */}
                {detail.attempts && detail.attempts.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-text3 uppercase tracking-wider mb-2">Payment Attempts</div>
                    <div className="space-y-2">
                      {detail.attempts.map((a) => (
                        <div key={a.id} className="bg-surface2 border border-border rounded-lg px-3 py-2 flex items-center justify-between">
                          <div>
                            <div className="text-text text-sm">{new Date(a.scheduledFor).toLocaleString()}</div>
                            {a.attemptedAt && <div className="text-text3 text-xs">Attempted {new Date(a.attemptedAt).toLocaleString()}</div>}
                          </div>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${a.outcome === 'PENDING' ? 'bg-yellow-500/15 text-yellow-600' : a.outcome === 'SUCCESS' ? 'bg-green/15 text-green' : a.outcome === 'FAILED' ? 'bg-error/15 text-error' : 'bg-gray-500/15 text-gray-500'}`}>
                            {a.outcome}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-xs text-text3">
                  Created {fmtDate(detail.createdAt)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editOpen && detail && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setEditOpen(false)}>
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-text">Edit Invoice</h2>
              <button onClick={() => setEditOpen(false)} className="p-1 text-text3 hover:text-text"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-text2 mb-1.5">Amount (fils)</label>
                  <input type="number" value={editData.amountAed}
                    onChange={(e) => setEditData({ ...editData, amountAed: Number(e.target.value) })}
                    className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text2 mb-1.5">VAT (fils)</label>
                  <input type="number" value={editData.vatAed}
                    onChange={(e) => setEditData({ ...editData, vatAed: Number(e.target.value) })}
                    className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-text2 mb-1.5">Due Date</label>
                <input type="date" value={editData.dueDate}
                  onChange={(e) => setEditData({ ...editData, dueDate: e.target.value })}
                  className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text2 mb-1.5">Description</label>
                <input value={editData.description}
                  onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                  className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text" />
              </div>
              <button onClick={handleEdit} disabled={editSaving}
                className="w-full px-4 py-2.5 bg-green text-white rounded-lg text-sm font-medium hover:brightness-110 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Invoice Modal ── */}
      {composeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setComposeOpen(false)}>
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-text">New Invoice</h2>
              <button onClick={() => setComposeOpen(false)} className="p-1 text-text3 hover:text-text"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-text2 mb-1.5">Member</label>
                {composeSelectedMember ? (
                  <div className="flex items-center justify-between bg-surface2 border border-border rounded-lg px-3 py-2">
                    <span className="text-sm font-medium text-text">{composeSelectedMember.fullName}</span>
                    <button onClick={() => { setComposeSelectedMember(null); setComposeMemberSearch(''); setComposeMemberResults([]); }}
                      className="p-1 text-text3 hover:text-error"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="w-4 h-4 text-text3 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input className="w-full bg-surface2 border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text placeholder:text-text3"
                      placeholder="Search member by name..."
                      value={composeMemberSearch}
                      onChange={(e) => handleMemberSearch(e.target.value)} />
                    {composeMemberResults.length > 0 && (
                      <div className="absolute top-full mt-1 w-full bg-surface border border-border rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                        {composeMemberResults.map((m) => (
                          <button key={m.id}
                            onClick={() => { setComposeSelectedMember(m); setComposeMemberResults([]); setComposeMemberSearch(''); }}
                            className="w-full text-left px-3 py-2 hover:bg-surface2 transition-colors border-b border-border last:border-0">
                            <div className="text-sm font-medium text-text">{m.fullName}</div>
                            {m.phone && <div className="text-xs text-text2">{m.phone}</div>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-text2 mb-1.5">Amount (fils)</label>
                  <input type="number" value={composeForm.amountAed}
                    onChange={(e) => setComposeForm({ ...composeForm, amountAed: Number(e.target.value) })}
                    className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text2 mb-1.5">VAT (fils)</label>
                  <input type="number" value={composeForm.vatAed}
                    onChange={(e) => setComposeForm({ ...composeForm, vatAed: Number(e.target.value) })}
                    className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-text2 mb-1.5">Due Date</label>
                <input type="date" value={composeForm.dueDate}
                  onChange={(e) => setComposeForm({ ...composeForm, dueDate: e.target.value })}
                  className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text2 mb-1.5">Description</label>
                <input value={composeForm.description}
                  onChange={(e) => setComposeForm({ ...composeForm, description: e.target.value })}
                  placeholder="e.g. Monthly membership renewal"
                  className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text3" />
              </div>
              <button onClick={handleCreate} disabled={composeSaving || !composeSelectedMember || !composeForm.dueDate}
                className="w-full px-4 py-2.5 bg-green text-white rounded-lg text-sm font-medium hover:brightness-110 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                {composeSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {composeSaving ? 'Creating...' : 'Create Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
