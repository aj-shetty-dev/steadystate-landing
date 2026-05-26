import { apiFetch, type InvoiceRow, type Paginated } from '../../../lib/api';
import { BillingClient } from './billing-client';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

interface SearchParams {
  page?: string;
  search?: string;
  status?: string;
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const page = Math.max(parseInt(sp.page ?? '1', 10) || 1, 1);
  const search = sp.search ?? '';
  const status = sp.status ?? '';

  const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (search) qs.set('search', search);
  if (status && status !== 'ALL') qs.set('status', status);

  const settle = <T,>(p: Promise<T>): Promise<{ data: T | null; error: string | null }> =>
    p.then((data) => ({ data, error: null })).catch((e) => ({ data: null, error: (e as { message?: string }).message ?? 'Failed to load' }));

  const [invoicesRes] = await Promise.all([
    settle(apiFetch<Paginated<InvoiceRow>>(`/billing/invoices?${qs.toString()}`)),
  ]);

  return (
    <BillingClient
      invoicesPage={invoicesRes.data ?? { items: [], total: 0, page: 1, pageSize: PAGE_SIZE }}
      initialError={invoicesRes.error}
      initialSearch={search}
      initialStatus={status}
    />
  );
}
