import { apiFetch, type MessageRow, type Paginated } from '../../../lib/api';
import { MessagesClient } from './messages-client';

export default async function MessagesPage() {
  const settle = <T,>(p: Promise<T>): Promise<{ data: T | null; error: string | null }> =>
    p.then((data) => ({ data, error: null })).catch((e) => ({ data: null, error: (e as { message?: string }).message ?? 'Failed to load' }));

  const [msgsRes] = await Promise.all([
    settle(apiFetch<Paginated<MessageRow>>('/whatsapp/messages?page=1&pageSize=50')),
  ]);

  return (
    <MessagesClient
      initialMessages={msgsRes.data?.items ?? []}
      initialTotal={msgsRes.data?.total ?? 0}
      initialError={msgsRes.error}
    />
  );
}
