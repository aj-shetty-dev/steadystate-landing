import { Alert } from '../../../components/ui/alert';
import { PageHeader } from '../../../components/ui/page-header';
import { apiFetch, type OverviewStats } from '../../../lib/api';

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-lg p-5 hover:border-text3/40 transition-colors">
      <div className="text-xs font-medium uppercase tracking-wider text-text3">{label}</div>
      <div className="text-3xl font-semibold tracking-tight text-text mt-3 tabular-nums">{value}</div>
      {hint && <div className="text-xs text-text2 mt-2">{hint}</div>}
    </div>
  );
}

function aed(fils: number): string {
  return `AED ${(fils / 100).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function OverviewPage() {
  let stats: OverviewStats | null = null;
  let error: string | null = null;
  try {
    stats = await apiFetch<OverviewStats>('/stats/overview', {}, 60);
  } catch (e) {
    error = (e as { message?: string }).message ?? 'Failed to load stats';
  }

  return (
    <div>
      <PageHeader title="Overview" description="A snapshot of your gym's performance today." />
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label="Members" value={stats.members.total} hint={`${stats.members.active} active`} />
          <StatCard label="Revenue MTD" value={aed(stats.revenueMtdAed)} hint="paid sales this month" />
          <StatCard label="Classes today" value={stats.classesToday} hint="scheduled" />
          <StatCard label="Open leads" value={stats.leadsOpen} hint="not converted or lost" />
          <StatCard
            label="Churn signals (30d)"
            value={
              stats.signals30d.pending +
              stats.signals30d.nudged +
              stats.signals30d.dismissed +
              stats.signals30d.failed
            }
            hint={`${stats.signals30d.pending} pending · ${stats.signals30d.nudged} nudged · ${stats.signals30d.failed} failed`}
          />
          <StatCard
            label="WhatsApp (30d)"
            value={stats.messages30d.total}
            hint={`${stats.messages30d.sent} sent · ${stats.messages30d.failed} failed`}
          />
        </div>
      )}
    </div>
  );
}
