'use client';

import { CheckCircle, Loader2, RefreshCw, ScanLine, Search, UserPlus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { EmptyState } from '../../../components/ui/empty-state';
import { PageHeader } from '../../../components/ui/page-header';
import { TableSkeleton } from '../../../components/skeletons/table-skeleton';
import type { CheckinRow, Paginated } from '../../../lib/api';
import { apiFetch } from '../../../lib/api';

function fmtDateTime(d: string): string {
  return new Date(d).toISOString().replace('T', ' ').slice(0, 16);
}

interface Props {
  items: CheckinRow[];
}

export function CheckinsClient({ items }: Props) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setIsLoading(false); }, [items]);

  // ── Manual check-in modal ──
  const [showCheckin, setShowCheckin] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState<{ id: string; fullName: string; phone: string | null; membershipStatus: string }[]>([]);
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [checkinResult, setCheckinResult] = useState<{ ok: boolean; message: string } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleMemberSearch(q: string) {
    setMemberSearch(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) { setMemberResults([]); return; }
    setSearchingMembers(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await apiFetch<Paginated<any>>(`/members?search=${encodeURIComponent(q)}&take=10`);
        const rows = data.items ?? (Array.isArray(data) ? data : []);
        setMemberResults(rows.slice(0, 10));
      } catch {
        setMemberResults([]);
      } finally {
        setSearchingMembers(false);
      }
    }, 300);
  }

  async function handleCheckin(memberId: string) {
    setCheckingIn(memberId);
    setCheckinResult(null);
    try {
      await apiFetch('/checkins', {
        method: 'POST',
        body: JSON.stringify({ source: 'MANUAL', memberId }),
      });
      setCheckinResult({ ok: true, message: 'Check-in recorded' });
      setMemberResults((prev) => prev.filter((m) => m.id !== memberId));
      router.refresh();
    } catch (err) {
      setCheckinResult({ ok: false, message: (err as Error).message });
    } finally {
      setCheckingIn(null);
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PageHeader
        title="Check-ins"
        description="Latest 200 check-ins via kiosk, QR, or manual entry."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setShowCheckin(true);
                setMemberSearch('');
                setMemberResults([]);
                setCheckinResult(null);
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green text-white text-sm font-medium hover:bg-green/90 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Check In
            </button>
            <button
              onClick={() => { setIsLoading(true); router.refresh(); }}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-text2 hover:bg-surface2 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        }
      />

      {error && (
        <div className="mb-4 rounded-md bg-error/10 text-error text-sm px-4 py-3 ring-1 ring-error/20">
          {error}
        </div>
      )}

      <div
        className="bg-surface border border-border rounded-lg overflow-y-auto overflow-x-auto flex-1 min-h-0"
        role="region"
        aria-label="Check-ins list"
        aria-busy={isLoading}
      >
        {isLoading && items.length === 0 ? (
          <TableSkeleton cols={4} rows={8} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={ScanLine}
            title="No check-ins yet"
            description="Use the Check In button above to check in a member, or activate a kiosk for self-service."
          />
        ) : (
          <table className={`w-full text-sm transition-opacity duration-200 ${isLoading ? 'opacity-50' : ''}`}>
            <thead className="bg-surface2 sticky top-0 z-10 text-text3 text-[11px] font-medium uppercase tracking-wider border-b border-border">
              <tr>
                <th className="text-left px-4 py-3">When</th>
                <th className="text-left px-4 py-3">Member</th>
                <th className="text-left px-4 py-3">Source</th>
                <th className="text-left px-4 py-3">Session</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-surface2/60 transition-colors">
                  <td className="px-4 py-3 text-text2 tabular-nums">{fmtDateTime(c.checkedInAt)}</td>
                  <td className="px-4 py-3">
                    {c.member ? (
                      <span className="text-text font-medium">{c.member.fullName}</span>
                    ) : (
                      <span className="text-text3 font-mono text-xs">{c.memberId.slice(0, 8)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3"><Badge tone="neutral">{c.source}</Badge></td>
                  <td className="px-4 py-3 text-text2 font-mono text-xs">{c.sessionId ? c.sessionId.slice(0, 8) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Manual Check-in Modal ── */}
      {showCheckin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCheckin(false)}>
          <div
            className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-text">Manual Check-in</h2>
              <button onClick={() => setShowCheckin(false)} className="p-1 text-text3 hover:text-text transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="relative">
                <Search className="w-4 h-4 text-text3 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-text placeholder:text-text3 focus:outline-none focus:ring-2 focus:ring-green/40"
                  placeholder="Search member by name or phone…"
                  value={memberSearch}
                  onChange={(e) => handleMemberSearch(e.target.value)}
                  autoFocus
                />
                {searchingMembers && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="w-4 h-4 text-text3 animate-spin" />
                  </div>
                )}
              </div>

              {checkinResult && (
                <div className={`rounded-lg px-4 py-3 text-sm flex items-center gap-2 ${
                  checkinResult.ok ? 'bg-green/10 border border-green/20 text-green' : 'bg-error/10 border border-error/30 text-error'
                }`}>
                  {checkinResult.ok ? <CheckCircle className="w-4 h-4" /> : <X className="w-4 h-4" />}
                  {checkinResult.message}
                </div>
              )}

              {memberResults.length > 0 && (
                <div className="border border-border rounded-lg divide-y divide-border max-h-64 overflow-y-auto">
                  {memberResults.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between px-4 py-3 hover:bg-surface2 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-text truncate">{m.fullName}</div>
                        <div className="text-xs text-text3">
                          {m.phone ?? 'No phone'} · <span className={m.membershipStatus === 'ACTIVE' ? 'text-green' : 'text-warning'}>{m.membershipStatus}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleCheckin(m.id)}
                        disabled={checkingIn === m.id}
                        className="ml-3 px-3 py-1.5 rounded-lg bg-green text-white text-xs font-medium hover:bg-green/90 disabled:opacity-50 transition-colors flex items-center gap-1.5 flex-shrink-0"
                      >
                        {checkingIn === m.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle className="w-3.5 h-3.5" />
                        )}
                        Check In
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {!searchingMembers && memberSearch.length >= 2 && memberResults.length === 0 && (
                <p className="text-sm text-text3 text-center py-4">No members match &ldquo;{memberSearch}&rdquo;</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
