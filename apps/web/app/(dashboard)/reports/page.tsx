import { Alert } from '../../../components/ui/alert';
import { PageHeader } from '../../../components/ui/page-header';
import {
  apiFetch,
  type ClassUtilizationReport,
  type MemberGrowthReport,
  type RevenueReport,
  type StaffCommissionReport,
} from '../../../lib/api';

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-5 hover:border-text3/40 transition-colors">
      <div className="text-xs font-medium uppercase tracking-wider text-text3">{label}</div>
      <div className="text-2xl font-semibold tracking-tight text-text mt-3 tabular-nums">{value}</div>
      {hint && <div className="text-xs text-text2 mt-2">{hint}</div>}
    </div>
  );
}

function aed(fils: number): string {
  return `AED ${(fils / 100).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

export default async function ReportsPage() {
  let revenue: RevenueReport | null = null;
  let growth: MemberGrowthReport | null = null;
  let utilization: ClassUtilizationReport | null = null;
  let commission: StaffCommissionReport | null = null;
  let error: string | null = null;
  try {
    [revenue, growth, utilization, commission] = await Promise.all([
      apiFetch<RevenueReport>('/reports/revenue'),
      apiFetch<MemberGrowthReport>('/reports/member-growth'),
      apiFetch<ClassUtilizationReport>('/reports/class-utilization'),
      apiFetch<StaffCommissionReport>('/reports/staff-commission'),
    ]);
  } catch (e) {
    error = (e as { message?: string }).message ?? 'Failed to load reports';
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Reports" description="Trailing 30 days across revenue, growth, classes, and staff." />
      {error && <Alert>{error}</Alert>}

      {revenue && (
        <section>
          <h2 className="text-base font-semibold tracking-tight text-text mb-3">Revenue</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard label="Grand total" value={aed(revenue.grandTotalAed)} />
            <StatCard label="POS sales" value={aed(revenue.sales.totalAed)} hint={`${revenue.sales.count} sales`} />
            <StatCard label="POS VAT" value={aed(revenue.sales.vatAed)} />
            <StatCard label="Invoices" value={aed(revenue.invoices.totalAed)} hint={`${revenue.invoices.count} paid`} />
          </div>
        </section>
      )}

      {growth && (
        <section>
          <h2 className="text-base font-semibold tracking-tight text-text mb-3">Member growth</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard label="New members" value={growth.newMembers} />
            <StatCard label="Churned" value={growth.churnedMembers} />
            <StatCard label="Net growth" value={growth.netGrowth} />
            <StatCard label="Active now" value={growth.currentActive} />
          </div>
        </section>
      )}

      {utilization && (
        <section>
          <h2 className="text-base font-semibold tracking-tight text-text mb-3">Class utilization</h2>
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface2 text-text3 text-[11px] font-medium uppercase tracking-wider border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3">Class</th>
                  <th className="text-left px-4 py-3">Sessions</th>
                  <th className="text-left px-4 py-3">Booked</th>
                  <th className="text-left px-4 py-3">Capacity</th>
                  <th className="text-left px-4 py-3">Fill rate</th>
                  <th className="text-left px-4 py-3">Attended</th>
                </tr>
              </thead>
              <tbody>
                {utilization.classes.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-text3">
                      No sessions in range.
                    </td>
                  </tr>
                )}
                {utilization.classes.map((c) => (
                  <tr key={c.classTypeId} className="border-t border-border hover:bg-surface2/60 transition-colors">
                    <td className="px-4 py-3 text-text font-medium">{c.nameEn}</td>
                    <td className="px-4 py-3 text-text2 tabular-nums">{c.sessions}</td>
                    <td className="px-4 py-3 text-text2 tabular-nums">{c.booked}</td>
                    <td className="px-4 py-3 text-text2 tabular-nums">{c.capacity}</td>
                    <td className="px-4 py-3 text-text2 tabular-nums">{pct(c.fillRate)}</td>
                    <td className="px-4 py-3 text-text2 tabular-nums">{pct(c.attendanceRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {commission && (
        <section>
          <h2 className="text-base font-semibold tracking-tight text-text mb-3">Staff sales</h2>
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface2 text-text3 text-[11px] font-medium uppercase tracking-wider border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Role</th>
                  <th className="text-left px-4 py-3">Sales</th>
                  <th className="text-left px-4 py-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {commission.staff.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-text3">
                      No staff with sales in range.
                    </td>
                  </tr>
                )}
                {commission.staff.map((s) => (
                  <tr key={s.id} className="border-t border-border hover:bg-surface2/60 transition-colors">
                    <td className="px-4 py-3 text-text font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-text2">{s.role}</td>
                    <td className="px-4 py-3 text-text2 tabular-nums">{s.salesCount}</td>
                    <td className="px-4 py-3 text-text font-medium tabular-nums">{aed(s.totalAed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
