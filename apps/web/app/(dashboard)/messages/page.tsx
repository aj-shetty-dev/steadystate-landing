import { apiFetch, type MessageRow, type Paginated } from '../../../lib/api';
import { MessagesClient } from './messages-client';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

interface SearchParams {
  page?: string;
  search?: string;
  status?: string;
  from?: string;
  to?: string;
}

export default async function MessagesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const page = Math.max(parseInt(sp.page ?? '1', 10) || 1, 1);
  const search = sp.search ?? '';
  const status = sp.status ?? '';
  const from = sp.from ?? '';
  const to = sp.to ?? '';

  const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (search) qs.set('search', search);
  if (status && status !== 'ALL') qs.set('status', status);
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);

  const settle = <T,>(p: Promise<T>): Promise<{ data: T | null; error: string | null }> =>
    p.then((data) => ({ data, error: null })).catch((e) => ({ data: null, error: (e as { message?: string }).message ?? 'Failed to load' }));

  const [msgsRes] = await Promise.all([
    settle(apiFetch<Paginated<MessageRow>>(`/whatsapp/messages?${qs.toString()}`)),
  ]);

  return (
    <MessagesClient
      messagesPage={msgsRes.data ?? { items: [], total: 0, page: 1, pageSize: PAGE_SIZE }}
      initialError={msgsRes.error}
      initialSearch={search}
      initialStatus={status}
      initialFrom={from}
      initialTo={to}
    />
  );
}
