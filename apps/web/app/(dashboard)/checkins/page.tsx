import { ScanLine } from 'lucide-react';
import { Alert } from '../../../components/ui/alert';
import { Badge } from '../../../components/ui/badge';
import { EmptyState } from '../../../components/ui/empty-state';
import { PageHeader } from '../../../components/ui/page-header';
import { apiFetch, type CheckinRow } from '../../../lib/api';

function fmtDateTime(d: string): string {
  return new Date(d).toISOString().replace('T', ' ').slice(0, 16);
}

export default async function CheckinsPage() {
  let items: CheckinRow[] = [];
  let error: string | null = null;
  try {
    items = await apiFetch<CheckinRow[]>('/checkins');
  } catch (e) {
    error = (e as { message?: string }).message ?? 'Failed to load check-ins';
  }

  return (
    <div>
      <PageHeader title="Check-ins" description="Latest 200 check-ins via kiosk, QR, or manual entry." />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        {items.length === 0 ? (
          <EmptyState
            icon={ScanLine}
            title="No check-ins yet"
            description="Activate a kiosk or share the member QR app to start tracking visits."
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface2 text-text3 text-[11px] font-medium uppercase tracking-wider border-b border-border">
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
