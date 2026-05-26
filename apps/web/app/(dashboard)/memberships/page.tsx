import { Alert } from '../../../components/ui/alert';
import { PageHeader } from '../../../components/ui/page-header';
import { apiFetch, type MembershipPlanRow, type MembershipRow, type Paginated, type UpcomingRenewalRow } from '../../../lib/api';
import { MembershipsClient } from './memberships-client';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

interface SearchParams {
  page?: string;
  search?: string;
  status?: string;
}

export default async function MembershipsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const page = Math.max(parseInt(sp.page ?? '1', 10) || 1, 1);
  const search = sp.search ?? '';
  const status = sp.status ?? '';

  const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (search) qs.set('search', search);
  if (status) qs.set('status', status);

  const [membershipsResult, plansResult, renewalsResult] = await Promise.allSettled([
    apiFetch<Paginated<MembershipRow>>(`/memberships?${qs.toString()}`),
    apiFetch<MembershipPlanRow[]>('/memberships/plans'),
    apiFetch<UpcomingRenewalRow[]>('/memberships/renewals'),
  ]);

  const membershipsPage =
    membershipsResult.status === 'fulfilled'
      ? membershipsResult.value
      : { items: [], total: 0, page: 1, pageSize: PAGE_SIZE };
  const plans = plansResult.status === 'fulfilled' ? plansResult.value : [];
  const upcomingRenewals = renewalsResult.status === 'fulfilled' ? renewalsResult.value : [];
  const error =
    membershipsResult.status === 'rejected' || plansResult.status === 'rejected'
      ? 'Some data could not be loaded. Refresh to retry.'
      : null;

  return (
    <div>
      <PageHeader
        title="Memberships"
        description="Manage membership plans and track active assignments."
      />
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <MembershipsClient
        membershipsPage={membershipsPage}
        plans={plans}
        upcomingRenewals={upcomingRenewals}
        initialSearch={search}
        initialStatus={status}
      />
    </div>
  );
}

