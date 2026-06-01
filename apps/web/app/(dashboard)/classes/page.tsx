import { Alert } from '../../../components/ui/alert';
import { PageHeader } from '../../../components/ui/page-header';
import { apiFetch, type ClassRecurrenceRow, type ClassSessionRow, type ClassTypeRow, type StaffRow } from '../../../lib/api';
import { ClassesClient } from './classes-client';

function defaultRange() {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + 7 * 86400_000);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const str = (key: string) => (typeof sp[key] === 'string' ? (sp[key] as string) : '');

  const defaults = defaultRange();
  const fromParam = str('from') || defaults.from;
  const toParam = str('to') || defaults.to;
  const statusParam = str('status');
  const typeIdParam = str('typeId');

  const fromISO = new Date(fromParam + 'T00:00:00').toISOString();
  const toISO = new Date(toParam + 'T23:59:59').toISOString();

  const sessionsQs = new URLSearchParams({ from: fromISO, to: toISO });
  if (statusParam) sessionsQs.set('status', statusParam);
  if (typeIdParam) sessionsQs.set('classTypeId', typeIdParam);

  const results = await Promise.allSettled([
    apiFetch<ClassSessionRow[]>(`/classes/sessions?${sessionsQs.toString()}`),
    apiFetch<ClassTypeRow[]>('/classes/types?includeArchived=true'),
    apiFetch<ClassRecurrenceRow[]>('/classes/recurrences'),
    apiFetch<StaffRow[]>('/staff'),
  ]);

  const sessions = results[0].status === 'fulfilled' ? results[0].value : [];
  const types = results[1].status === 'fulfilled' ? results[1].value : [];
  const recurrences = results[2].status === 'fulfilled' ? results[2].value : [];
  const staff = results[3].status === 'fulfilled' ? results[3].value : [];

  const failed = results.filter((r) => r.status === 'rejected').length;
  const error = failed > 0 ? 'Some data could not be loaded. Refresh to retry.' : null;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PageHeader title="Classes" description="Schedule sessions, manage class types, and set up recurring schedules." />
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <ClassesClient
        sessions={sessions}
        types={types}
        recurrences={recurrences}
        staff={staff}
        initialStatus={statusParam}
        initialTypeId={typeIdParam}
        initialFrom={fromParam}
        initialTo={toParam}
      />
    </div>
  );
}
