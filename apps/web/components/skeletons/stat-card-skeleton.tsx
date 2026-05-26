import { Skeleton } from '../ui/skeleton';

export function StatCardSkeleton() {
  return (
    <div className="bg-surface border border-border rounded p-5">
      <Skeleton className="h-3 w-20 mb-3" />
      <Skeleton className="h-8 w-28 mb-2" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}
