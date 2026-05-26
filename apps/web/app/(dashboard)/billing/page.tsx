import { apiFetch, type InvoiceRow, type Paginated } from '../../../lib/api';
import { BillingClient } from './billing-client';

export default async function BillingPage() {
  const settle = <T,>(p: Promise<T>): Promise<{ data: T | null; error: string | null }> =>
    p.then((data) => ({ data, error: null })).catch((e) => ({ data: null, error: (e as { message?: string }).message ?? 'Failed to load' }));

  const [invoicesRes] = await Promise.all([
    settle(apiFetch<Paginated<InvoiceRow>>('/billing/invoices?page=1&pageSize=50')),
  ]);

  return (
    <BillingClient
      initialInvoices={invoicesRes.data?.items ?? []}
      initialTotal={invoicesRes.data?.total ?? 0}
      initialError={invoicesRes.error}
    />
  );
}
