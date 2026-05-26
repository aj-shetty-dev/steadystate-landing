import { apiFetch, type StaffRow } from '../../../lib/api';
import { StaffClient } from './staff-client';

export default async function StaffPage() {
  const settle = <T,>(p: Promise<T>): Promise<{ data: T | null; error: string | null }> =>
    p.then((data) => ({ data, error: null })).catch((e) => ({ data: null, error: (e as { message?: string }).message ?? 'Failed to load' }));

  const [staffRes] = await Promise.all([
    settle(apiFetch<StaffRow[]>('/staff?includeInactive=true')),
  ]);

  return (
    <StaffClient
      staff={staffRes.data ?? []}
      initialError={staffRes.error}
    />
  );
}
