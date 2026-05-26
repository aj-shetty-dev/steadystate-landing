import { Alert } from '../../../components/ui/alert';
import { Badge } from '../../../components/ui/badge';
import { PageHeader } from '../../../components/ui/page-header';
import { apiFetch, type DoorEventRow, type DoorSignalRow, type Paginated } from '../../../lib/api';

export const dynamic = 'force-dynamic';

export default async function DoorPage() {
  let events: Paginated<DoorEventRow> = { items: [], total: 0, page: 1, pageSize: 20 };
  let signals: Paginated<DoorSignalRow> = { items: [], total: 0, page: 1, pageSize: 20 };
  let err: string | null = null;
  try {
    [events, signals] = await Promise.all([
      apiFetch<Paginated<DoorEventRow>>('/door-events/events?limit=20'),
      apiFetch<Paginated<DoorSignalRow>>('/door-events/signals?limit=20'),
    ]);
  } catch (e) {
    err = (e as { message?: string }).message ?? 'failed to load';
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Door events" description="Live access logs and behavioural signals from biometric/door hardware." />
      {err && <Alert>{err}</Alert>}

      <section>
        <h2 className="text-base font-semibold tracking-tight text-text mb-3">Recent signals</h2>
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface2 text-text3 text-[11px] font-medium uppercase tracking-wider border-b border-border">
              <tr>
                <th className="text-left px-4 py-3">Kind</th>
                <th className="text-left px-4 py-3">Member</th>
                <th className="text-left px-4 py-3">Detail</th>
                <th className="text-left px-4 py-3">Detected</th>
              </tr>
            </thead>
            <tbody>
              {signals.items.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-text3">No signals yet.</td>
                </tr>
              )}
              {signals.items.map((s) => (
                <tr key={s.id} className="border-t border-border hover:bg-surface2/60 transition-colors">
                  <td className="px-4 py-3"><Badge tone="green">{s.kind}</Badge></td>
                  <td className="px-4 py-3 text-text font-medium">{s.member?.fullName ?? '—'}</td>
                  <td className="px-4 py-3 text-text2">{s.detail ?? ''}</td>
                  <td className="px-4 py-3 text-text2 tabular-nums">{new Date(s.detectedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold tracking-tight text-text mb-3">Recent events</h2>
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface2 text-text3 text-[11px] font-medium uppercase tracking-wider border-b border-border">
              <tr>
                <th className="text-left px-4 py-3">Direction</th>
                <th className="text-left px-4 py-3">Source</th>
                <th className="text-left px-4 py-3">Member</th>
                <th className="text-left px-4 py-3">When</th>
              </tr>
            </thead>
            <tbody>
              {events.items.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-text3">No events yet.</td>
                </tr>
              )}
              {events.items.map((e) => (
                <tr key={e.id} className="border-t border-border hover:bg-surface2/60 transition-colors">
                  <td className="px-4 py-3"><Badge tone="neutral">{e.direction}</Badge></td>
                  <td className="px-4 py-3 text-text2">{e.source}</td>
                  <td className="px-4 py-3 text-text font-medium">{e.member?.fullName ?? '—'}</td>
                  <td className="px-4 py-3 text-text2 tabular-nums">{new Date(e.occurredAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
