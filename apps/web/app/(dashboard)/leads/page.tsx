import { apiFetch, type LeadRow } from '../../../lib/api';
import { LeadsClient } from './leads-client';

export default async function LeadsPage() {
  const settle = <T,>(p: Promise<T>): Promise<{ data: T | null; error: string | null }> =>
    p.then((data) => ({ data, error: null })).catch((e) => ({ data: null, error: (e as { message?: string }).message ?? 'Failed to load' }));

  const [leadsRes] = await Promise.all([
    settle(apiFetch<LeadRow[]>('/leads?take=500')),
  ]);

  return (
    <LeadsClient
      leads={leadsRes.data ?? []}
      initialError={leadsRes.error}
    />
  );
}
