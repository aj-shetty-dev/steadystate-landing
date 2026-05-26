import { Sparkles } from 'lucide-react';
import { Alert } from '../../../components/ui/alert';
import { EmptyState } from '../../../components/ui/empty-state';
import { PageHeader } from '../../../components/ui/page-header';
import { StatusBadge } from '../../../components/ui/status-badge';
import { apiFetch, type Paginated, type SignalRow } from '../../../lib/api';
import { RunChurnButton } from './run-churn-button';

function fmt(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}

export default async function AutomationPage() {
  let data: Paginated<SignalRow> | null = null;
  let error: string | null = null;
  try {
    data = await apiFetch<Paginated<SignalRow>>('/automation/churn/signals?page=1&pageSize=50');
  } catch (e) {
    error = (e as { message?: string }).message ?? 'Failed to load signals';
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Automation" description="Churn-trigger engine and signals it has produced." />
      <RunChurnButton />

      {error && <Alert>{error}</Alert>}
      {data && (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border text-sm font-medium text-text">
            Recent churn signals
          </div>
          {data.items.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No churn signals yet"
              description="Run the engine above or wait for the scheduled cron to detect idle members."
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface2 text-text3 text-[11px] font-medium uppercase tracking-wider border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3">Member</th>
                  <th className="text-left px-4 py-3">Phone</th>
                  <th className="text-left px-4 py-3">Days idle</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Detected</th>
                  <th className="text-left px-4 py-3">Nudged</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => (
                  <tr key={s.id} className="border-t border-border hover:bg-surface2/60 transition-colors">
                    <td className="px-4 py-3 text-text font-medium">{s.member.fullName}</td>
                    <td className="px-4 py-3 text-text2 tabular-nums">{s.member.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-text2 tabular-nums">{s.daysSinceLastCheckin}</td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-3 text-text2 tabular-nums">{fmt(s.detectedAt)}</td>
                    <td className="px-4 py-3 text-text2 tabular-nums">{fmt(s.nudgedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data.items.length > 0 && (
            <div className="px-4 py-3 text-xs text-text3 border-t border-border bg-surface2/40">
              {data.total} total
            </div>
          )}
        </div>
      )}
    </div>
  );
}
