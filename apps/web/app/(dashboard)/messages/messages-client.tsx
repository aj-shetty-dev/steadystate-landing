'use client';

import {
  AlertCircle,
  CheckCircle,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Send,
  Users,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '../../../components/ui/empty-state';
import { PageHeader } from '../../../components/ui/page-header';
import { StatusBadge } from '../../../components/ui/status-badge';
import { TableSkeleton } from '../../../components/skeletons/table-skeleton';
import type { MessageRow, Paginated } from '../../../lib/api';
import { apiFetch } from '../../../lib/api';

const STATUSES = ['ALL', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'UNDELIVERED'] as const;
const MEMBERSHIP_STATUSES = ['ACTIVE', 'FROZEN', 'EXPIRED', 'CANCELLED', 'PAUSED', 'PENDING'] as const;

function fmt(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}

function buildUrl(params: { search: string; status: string; from: string; to: string; page: number }): string {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  if (params.status && params.status !== 'ALL') qs.set('status', params.status);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.page > 1) qs.set('page', String(params.page));
  const str = qs.toString();
  return str ? `/messages?${str}` : '/messages';
}

export function MessagesClient({
  messagesPage,
  initialError,
  initialSearch,
  initialStatus,
  initialFrom,
  initialTo,
}: {
  messagesPage: Paginated<MessageRow>;
  initialError: string | null;
  initialSearch: string;
  initialStatus: string;
  initialFrom: string;
  initialTo: string;
}) {
  const router = useRouter();

  // Controlled loading / optimistic state
  const [isLoading, setIsLoading] = useState(false);
  const [optimisticStatus, setOptimisticStatus] = useState(initialStatus || 'ALL');
  const [optimisticPage, setOptimisticPage] = useState(messagesPage.page);
  const activeStatus = isLoading ? optimisticStatus : (initialStatus || 'ALL');
  const activePage = isLoading ? optimisticPage : messagesPage.page;

  useEffect(() => { setOptimisticStatus(initialStatus || 'ALL'); }, [initialStatus]);
  useEffect(() => { setOptimisticPage(messagesPage.page); }, [messagesPage.page]);
  useEffect(() => { setIsLoading(false); }, [initialStatus, messagesPage.page, messagesPage.items]);

  const { items: messages, total } = messagesPage;
  const [error, setError] = useState<string | null>(initialError);

  // filters
  const [search, setSearch] = useState(initialSearch);
  const [fromDate, setFromDate] = useState(initialFrom);
  const [toDate, setToDate] = useState(initialTo);

  useEffect(() => { setSearch(initialSearch); }, [initialSearch]);
  useEffect(() => { setFromDate(initialFrom); }, [initialFrom]);
  useEffect(() => { setToDate(initialTo); }, [initialTo]);

  // compose modal
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<'single' | 'broadcast'>('single');
  const [composeBody, setComposeBody] = useState('');
  const [composeSending, setComposeSending] = useState(false);
  const [composeResult, setComposeResult] = useState<string | null>(null);

  // single mode
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState<{ id: string; fullName: string; phone: string | null }[]>([]);
  const [memberSearching, setMemberSearching] = useState(false);
  const [selectedMember, setSelectedMember] = useState<{ id: string; fullName: string; phone: string | null } | null>(null);

  // broadcast mode
  const [segmentStatus, setSegmentStatus] = useState('ACTIVE');
  const [segmentPlanId, setSegmentPlanId] = useState('');
  const [segmentCheckinFrom, setSegmentCheckinFrom] = useState('');
  const [segmentCheckinTo, setSegmentCheckinTo] = useState('');
  const [broadcastResult, setBroadcastResult] = useState<{ sent: number; skipped: number; total: number } | null>(null);

  const pageSize = messagesPage.pageSize || 50;

  function navigate(overrides: { status?: string; search?: string; from?: string; to?: string; page?: number }) {
    const s = overrides.search ?? search;
    const st = overrides.status ?? activeStatus;
    const f = overrides.from ?? fromDate;
    const t = overrides.to ?? toDate;
    const p = overrides.page ?? 1;
    if (overrides.status !== undefined) setOptimisticStatus(st);
    if (overrides.page !== undefined) setOptimisticPage(p);
    setIsLoading(true);
    router.push(buildUrl({ search: s.trim(), status: st, from: f, to: t, page: p }));
  }

  const applyFilters = () => {
    navigate({ page: 1 });
  };

  const handleSearchMembers = useCallback(async (q: string) => {
    setMemberSearch(q);
    if (q.length < 2) { setMemberResults([]); return; }
    setMemberSearching(true);
    try {
      const res = await apiFetch<any>(`/members?search=${encodeURIComponent(q)}&take=10`);
      //
      const data = await res.json();
      setMemberResults((data.items ?? data).slice(0, 10));
    } catch {
      // ignore
    } finally {
      setMemberSearching(false);
    }
  }, []);

  const handleSendSingle = async () => {
    if (!selectedMember?.phone || !composeBody.trim()) return;
    setComposeSending(true);
    setComposeResult(null);
    try {
      await apiFetch('/whatsapp/messages/send', {
        method: 'POST',
        body: JSON.stringify({ to: selectedMember.phone, body: composeBody.trim() }),
      });
      
      setComposeResult('Message sent successfully');
      setComposeBody('');
      setSelectedMember(null);
      setMemberSearch('');
      router.refresh();
    } catch (e) {
      setComposeResult(`Error: ${(e as { message?: string }).message ?? 'Send failed'}`);
    } finally {
      setComposeSending(false);
    }
  };

  const handleBroadcast = async () => {
    if (!composeBody.trim()) return;
    setComposeSending(true);
    setBroadcastResult(null);
    try {
      const segment: Record<string, string> = { membershipStatus: segmentStatus };
      if (segmentPlanId) segment.planId = segmentPlanId;
      if (segmentCheckinFrom) segment.lastCheckinFrom = segmentCheckinFrom;
      if (segmentCheckinTo) segment.lastCheckinTo = segmentCheckinTo;

      const result = await apiFetch<any>('/whatsapp/messages/broadcast', {
        method: 'POST',
        body: JSON.stringify({ body: composeBody.trim(), segment }),
      });
            setBroadcastResult(result);
      setComposeBody('');
      router.refresh();
    } catch (e) {
      setComposeResult(`Error: ${(e as { message?: string }).message ?? 'Broadcast failed'}`);
    } finally {
      setComposeSending(false);
    }
  };

  const handleResend = async (id: string) => {
    setError(null);
    try {
      await apiFetch(`/whatsapp/messages/${id}/resend`, { method: 'POST' });
      
      router.refresh();
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Resend failed');
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PageHeader
        title="Messages"
        description="Send manual WhatsApp messages and view outbound message history."
        actions={
          <button
            onClick={() => { setComposeOpen(true); setComposeResult(null); setBroadcastResult(null); }}
            className="px-4 py-2 bg-green text-white rounded-lg text-sm font-medium hover:brightness-110 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> New Message
          </button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={activeStatus}
          onChange={(e) => navigate({ status: e.target.value, page: 1 })}
          className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s === 'ALL' ? 'All statuses' : s.charAt(0) + s.slice(1).toLowerCase()}</option>
          ))}
        </select>
        <div className="relative">
          <Search className="w-4 h-4 text-text3 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            className="bg-surface border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text w-full sm:w-56 placeholder:text-text3"
            placeholder="Search phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applyFilters(); }}
          />
        </div>
        <input
          type="date"
          className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
        />
        <span className="text-text3 text-sm">to</span>
        <input
          type="date"
          className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
        />
        <button
          onClick={applyFilters}
          className="px-3 py-2 bg-surface2 border border-border rounded-lg text-sm text-text2 hover:text-text transition-colors"
        >
          Apply
        </button>
        <button
          onClick={() => router.refresh()}
          className="p-2 text-text3 hover:text-text transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-error/10 border border-error/30 rounded-lg px-4 py-3 text-sm text-error flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Messages Table */}
      <div
        className="bg-surface border border-border rounded-lg overflow-y-auto overflow-x-auto flex-1 min-h-0"
        role="region"
        aria-label="Messages list"
        aria-busy={isLoading}
      >
        {isLoading && messages.length === 0 ? (
          <TableSkeleton cols={7} rows={8} />
        ) : messages.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No messages found"
            description={activeStatus !== 'ALL' || search || fromDate || toDate ? 'Try adjusting the filters.' : 'Send your first message to get started.'}
          />
        ) : (
          <>
            <table className={`w-full text-sm transition-opacity duration-200 ${isLoading ? 'opacity-50' : ''}`}>
              <thead className="bg-surface2 sticky top-0 z-10 text-text3 text-[11px] font-medium uppercase tracking-wider border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3">To</th>
                  <th className="text-left px-4 py-3">Body</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Template</th>
                  <th className="text-left px-4 py-3">Sent</th>
                  <th className="text-left px-4 py-3">Created</th>
                  <th className="text-left px-4 py-3 w-16"> </th>
                </tr>
              </thead>
              <tbody>
                {messages.map((m) => (
                  <tr key={m.id} className="border-t border-border hover:bg-surface2/60 transition-colors">
                    <td className="px-4 py-3 text-text font-medium tabular-nums">{m.to}</td>
                    <td className="px-4 py-3 text-text2 max-w-xs truncate" title={m.body}>
                      {m.body}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={m.status} />
                      {m.errorMessage && (
                        <div className="text-[11px] text-error mt-0.5 max-w-[140px] truncate" title={m.errorMessage}>
                          {m.errorMessage}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text2 text-xs">{m.templateName ?? '—'}</td>
                    <td className="px-4 py-3 text-text2 tabular-nums text-xs">{fmt(m.sentAt)}</td>
                    <td className="px-4 py-3 text-text2 tabular-nums text-xs">{fmt(m.createdAt)}</td>
                    <td className="px-4 py-3">
                      {m.status === 'FAILED' && (
                        <button
                          onClick={() => handleResend(m.id)}
                          className="p-1.5 text-text3 hover:text-green transition-colors rounded hover:bg-surface2"
                          title="Resend"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!isLoading && (
              <div className="flex items-center justify-between px-4 py-3 text-xs text-text3 border-t border-border bg-surface2/40">
                <span>{total} total</span>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      disabled={activePage <= 1 || isLoading}
                      onClick={() => navigate({ page: activePage - 1 })}
                      className="px-2 py-1 rounded border border-border disabled:opacity-40 hover:bg-surface2 transition-colors"
                    >
                      Prev
                    </button>
                    <span>Page {activePage} of {totalPages}</span>
                    <button
                      disabled={activePage >= totalPages || isLoading}
                      onClick={() => navigate({ page: activePage + 1 })}
                      className="px-2 py-1 rounded border border-border disabled:opacity-40 hover:bg-surface2 transition-colors"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Compose Modal */}
      {composeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setComposeOpen(false)}>
          <div
            className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-text">New Message</h2>
              <button onClick={() => setComposeOpen(false)} className="p-1 text-text3 hover:text-text transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Mode Toggle */}
              <div className="flex bg-surface2 rounded-lg p-1">
                <button
                  onClick={() => { setComposeMode('single'); setBroadcastResult(null); setComposeResult(null); }}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${composeMode === 'single' ? 'bg-surface text-text shadow-sm' : 'text-text3'}`}
                >
                  <Send className="w-3.5 h-3.5 inline mr-1.5" />
                  Single Message
                </button>
                <button
                  onClick={() => { setComposeMode('broadcast'); setComposeResult(null); }}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${composeMode === 'broadcast' ? 'bg-surface text-text shadow-sm' : 'text-text3'}`}
                >
                  <Users className="w-3.5 h-3.5 inline mr-1.5" />
                  Broadcast
                </button>
              </div>

              {/* Single Mode */}
              {composeMode === 'single' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-text2 mb-1.5">Recipient</label>
                    {selectedMember ? (
                      <div className="flex items-center justify-between bg-surface2 border border-border rounded-lg px-3 py-2">
                        <div>
                          <div className="text-sm font-medium text-text">{selectedMember.fullName}</div>
                          <div className="text-xs text-text2">{selectedMember.phone}</div>
                        </div>
                        <button
                          onClick={() => { setSelectedMember(null); setMemberSearch(''); setMemberResults([]); }}
                          className="p-1 text-text3 hover:text-error transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <Search className="w-4 h-4 text-text3 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text placeholder:text-text3"
                          placeholder="Search member by name or phone..."
                          value={memberSearch}
                          onChange={(e) => handleSearchMembers(e.target.value)}
                        />
                        {memberSearching && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <Loader2 className="w-4 h-4 text-text3 animate-spin" />
                          </div>
                        )}
                        {memberResults.length > 0 && (
                          <div className="absolute top-full mt-1 w-full bg-surface border border-border rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                            {memberResults.map((m) => (
                              <button
                                key={m.id}
                                onClick={() => { setSelectedMember(m); setMemberResults([]); setMemberSearch(''); }}
                                className="w-full text-left px-3 py-2 hover:bg-surface2 transition-colors border-b border-border last:border-0"
                              >
                                <div className="text-sm font-medium text-text">{m.fullName}</div>
                                <div className="text-xs text-text2">{m.phone ?? 'No phone'}</div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {selectedMember && !selectedMember.phone && (
                      <p className="text-xs text-error mt-1">This member has no phone number on file.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Broadcast Mode */}
              {composeMode === 'broadcast' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-text2 mb-1.5">Membership Status</label>
                      <select
                        value={segmentStatus}
                        onChange={(e) => setSegmentStatus(e.target.value)}
                        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text"
                      >
                        {MEMBERSHIP_STATUSES.map((s) => (
                          <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-text2 mb-1.5">Last Check-in From</label>
                      <input
                        type="date"
                        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text"
                        value={segmentCheckinFrom}
                        onChange={(e) => setSegmentCheckinFrom(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-text2 mb-1.5">Plan (optional)</label>
                      <input
                        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text3"
                        placeholder="Plan ID"
                        value={segmentPlanId}
                        onChange={(e) => setSegmentPlanId(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-text2 mb-1.5">Last Check-in To</label>
                      <input
                        type="date"
                        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text"
                        value={segmentCheckinTo}
                        onChange={(e) => setSegmentCheckinTo(e.target.value)}
                      />
                    </div>
                  </div>
                  {broadcastResult && (
                    <div className="bg-green/10 border border-green/20 rounded-lg px-4 py-3 text-sm text-green flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Sent to {broadcastResult.sent} of {broadcastResult.total} matching members
                      {broadcastResult.skipped > 0 && ` (${broadcastResult.skipped} skipped)`}
                    </div>
                  )}
                </div>
              )}

              {/* Message Body */}
              <div>
                <label className="block text-xs font-medium text-text2 mb-1.5">Message</label>
                <textarea
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text3 resize-none"
                  rows={4}
                  placeholder="Type your message..."
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  maxLength={4096}
                />
                <div className="text-xs text-text3 mt-1">{composeBody.length}/4096</div>
              </div>

              {composeResult && (
                <div className={`rounded-lg px-4 py-3 text-sm flex items-center gap-2 ${
                  composeResult.startsWith('Error') ? 'bg-error/10 border border-error/30 text-error' : 'bg-green/10 border border-green/20 text-green'
                }`}>
                  {composeResult.startsWith('Error') ? <AlertCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                  {composeResult}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => {
                    if (composeMode === 'single') handleSendSingle();
                    else handleBroadcast();
                  }}
                  disabled={composeSending || !composeBody.trim() || (composeMode === 'single' && (!selectedMember || !selectedMember.phone))}
                  className="flex-1 px-4 py-2.5 bg-green text-white rounded-lg text-sm font-medium hover:brightness-110 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {composeSending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : composeMode === 'broadcast' ? (
                    <Users className="w-4 h-4" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {composeSending ? 'Sending...' : composeMode === 'broadcast' ? 'Send Broadcast' : 'Send Message'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
