import { Alert } from '../../../components/ui/alert';
import { apiFetch, type MemberRow, type Paginated } from '../../../lib/api';
import { MembersClient } from './members-client';

const PAGE_SIZE = 25;

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? '1', 10));
  const search = sp.search?.trim() ?? '';
  const status = sp.status ?? '';

  const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (search) qs.set('search', search);
  if (status && status !== 'ALL') qs.set('status', status);

  let data: Paginated<MemberRow> | null = null;
  let error: string | null = null;
  try {
    data = await apiFetch<Paginated<MemberRow>>(`/members?${qs.toString()}`);
  } catch (e) {
    error = (e as { message?: string }).message ?? 'Failed to load members';
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {error && (
        <div className="mb-4 flex-shrink-0">
          <Alert>{error}</Alert>
        </div>
      )}
      {data && <MembersClient data={data} initialSearch={search} initialStatus={status} />}
    </div>
  );
}
