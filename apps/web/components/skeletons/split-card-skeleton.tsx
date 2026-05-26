import { Skeleton } from '../ui/skeleton';

export function SplitCardSkeleton() {
  return (
    <div className="bg-surface border border-border rounded p-6 max-w-lg">
      <Skeleton className="h-3 w-20 mb-4" />
      <Skeleton className="h-10 w-36 mb-2" />
      <Skeleton className="h-3 w-48 mb-6" />
      <Skeleton className="h-px w-full mb-6" />
      <div className="space-y-3">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-4/6" />
      </div>
      <Skeleton className="h-9 w-32 mt-8 rounded" />
    </div>
  );
}
