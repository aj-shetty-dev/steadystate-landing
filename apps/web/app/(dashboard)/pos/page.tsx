import { apiFetch, type MembershipPlanRow, type ProductRow, type SaleRow } from '../../../lib/api';
import { PosClient } from './pos-client';

interface DailyAgg {
  _sum: { subtotalAed: number | null; vatAed: number | null; totalAed: number | null };
  _count: { _all: number };
}

export default async function PosPage() {
  const settle = <T,>(p: Promise<T>): Promise<{ data: T | null; error: string | null }> =>
    p.then((data) => ({ data, error: null })).catch((e) => ({ data: null, error: (e as { message?: string }).message ?? 'Failed to load' }));

  const [products, sales, daily, plans] = await Promise.all([
    settle(apiFetch<ProductRow[]>('/shop/products?activeOnly=true')),
    settle(apiFetch<SaleRow[]>('/pos/sales?take=50')),
    settle(apiFetch<DailyAgg>('/pos/sales/reports/daily')),
    settle(apiFetch<MembershipPlanRow[]>('/memberships/plans?active=true')),
  ]);

  return (
    <PosClient
      products={products.data ?? []}
      recentSales={sales.data ?? []}
      dailyTotal={daily.data?._sum?.totalAed ?? 0}
      dailyCount={daily.data?._count?._all ?? 0}
      plans={plans.data ?? []}
      initialErrors={[products.error, sales.error, daily.error, plans.error].filter(Boolean) as string[]}
    />
  );
}
