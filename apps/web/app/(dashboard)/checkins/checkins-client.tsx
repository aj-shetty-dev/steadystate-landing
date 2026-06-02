'use client';

import { RefreshCw, ScanLine } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { EmptyState } from '../../../components/ui/empty-state';
import { PageHeader } from '../../../components/ui/page-header';
import { TableSkeleton } from '../../../components/skeletons/table-skeleton';
import type { CheckinRow } from '../../../lib/api';

function fmtDateTime(d: string): string {
  return new Date(d).toISOString().replace('T', ' ').slice(0, 16);
}

interface Props {
  items: CheckinRow[];
}

export function CheckinsClient({ items }: Props) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => { setIsLoading(false); }, [items]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PageHeader
        title="Check-ins"
        description="Latest 200 check-ins via kiosk, QR, or manual entry."
        actions={
          <button
            onClick={() => { setIsLoading(true); router.refresh(); }}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-text2 hover:bg-surface2 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />
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
            description="Activate a kiosk or share the member QR app to start tracking visits."
          />
        ) : (
          <table className={`w-full text-sm transition-opacity duration-200 ${isLoading ? 'opacity-50' : ''}`}>
            <thead className="bg-surface2 sticky top-0 z-10 text-text3 text-[11px] font-medium uppercase tracking-wider border-b border-border">
              <tr>
                <th className="text-left px-4 py-3">When</th>
                <th className="text-left px-4 py-3">Member ID</th>
                <th className="text-left px-4 py-3">Source</th>
                <th className="text-left px-4 py-3">Session</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-surface2/60 transition-colors">
                  <td className="px-4 py-3 text-text2 tabular-nums">{fmtDateTime(c.checkedInAt)}</td>
                  <td className="px-4 py-3 text-text2 font-mono text-xs">{c.memberId.slice(0, 8)}</td>
                  <td className="px-4 py-3"><Badge tone="neutral">{c.source}</Badge></td>
                  <td className="px-4 py-3 text-text2 font-mono text-xs">{c.sessionId ? c.sessionId.slice(0, 8) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
