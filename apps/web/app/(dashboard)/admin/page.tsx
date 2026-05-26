import { redirect } from 'next/navigation';
import { Alert } from '../../../components/ui/alert';
import { PageHeader } from '../../../components/ui/page-header';
import { apiFetch } from '../../../lib/api';
import { getSessionUser } from '../../../lib/session';

interface AdminTenantRow {
  id: string;
  name: string;
  slug: string;
  city: string;
  createdAt: string;
  userCount: number;
  memberCount: number;
  subscription: { status: string; plan: string } | null;
}

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user || user.role !== 'SUPER_ADMIN') {
    redirect('/overview');
  }

  let tenants: AdminTenantRow[] = [];
  let err: string | null = null;
  try {
    tenants = await apiFetch<AdminTenantRow[]>('/admin/tenants');
  } catch (e) {
    err = (e as { message?: string }).message ?? 'failed to load';
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Admin · Tenants" description="All tenants on the platform (super-admin only)." />
      {err && <Alert>{err}</Alert>}
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface2 text-text3 text-[11px] font-medium uppercase tracking-wider border-b border-border">
            <tr>
              <th className="text-left px-4 py-3">Tenant</th>
              <th className="text-left px-4 py-3">City</th>
              <th className="text-left px-4 py-3">Users</th>
              <th className="text-left px-4 py-3">Members</th>
              <th className="text-left px-4 py-3">Subscription</th>
              <th className="text-left px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {tenants.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text3">No tenants.</td>
              </tr>
            )}
            {tenants.map((t) => (
              <tr key={t.id} className="border-t border-border hover:bg-surface2/60 transition-colors">
                <td className="px-4 py-3">
                  <div className="text-text font-medium">{t.name}</div>
                  <div className="text-xs text-text3">{t.slug}</div>
                </td>
                <td className="px-4 py-3 text-text2">{t.city}</td>
                <td className="px-4 py-3 text-text2 tabular-nums">{t.userCount}</td>
                <td className="px-4 py-3 text-text2 tabular-nums">{t.memberCount}</td>
                <td className="px-4 py-3 text-text2">
                  {t.subscription ? `${t.subscription.plan} · ${t.subscription.status}` : '—'}
                </td>
                <td className="px-4 py-3 text-text2 tabular-nums">{new Date(t.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
