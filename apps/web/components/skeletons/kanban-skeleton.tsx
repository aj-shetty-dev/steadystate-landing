import { Skeleton } from '../ui/skeleton';

const STAGES = ['NEW', 'CONTACTED', 'TRIAL BOOKED', 'TRIAL DONE', 'CONVERTED', 'LOST'];

function KanbanCard() {
  return (
    <div className="bg-surface border border-border rounded p-3 mb-2">
      <Skeleton className="h-3 w-3/4 mb-2" />
      <Skeleton className="h-3 w-1/2 mb-2" />
      <Skeleton className="h-2 w-2/3" />
    </div>
  );
}

export function KanbanSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {STAGES.map((stage) => (
        <div key={stage} className="bg-surface border border-border rounded p-3">
          <div className="flex items-center justify-between mb-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-5 rounded-full" />
          </div>
          <KanbanCard />
          <KanbanCard />
          <KanbanCard />
        </div>
      ))}
    </div>
  );
}
