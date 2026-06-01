import { Alert } from '../../../components/ui/alert';
import { apiFetch, type CheckinRow } from '../../../lib/api';
import { CheckinsClient } from './checkins-client';

export const dynamic = 'force-dynamic';

export default async function CheckinsPage() {
  let items: CheckinRow[] = [];
  let error: string | null = null;
  try {
    items = await apiFetch<CheckinRow[]>('/checkins');
  } catch (e) {
    error = (e as { message?: string }).message ?? 'Failed to load check-ins';
  }

  if (error) {
    return (
      <div>
        <div className="mb-4"><Alert>{error}</Alert></div>
      </div>
    );
  }

  return <div className="flex flex-col flex-1 min-h-0"><CheckinsClient items={items} /></div>;
}
