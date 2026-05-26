import { Skeleton } from '../../../components/ui/skeleton';
import { PageHeaderSkeleton } from '../../../components/skeletons/page-header-skeleton';

export default function AutomationLoading() {
  return (
    <div>
      <PageHeaderSkeleton hint="Loading automations…" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-surface border border-border rounded p-4 flex items-center gap-4">
            <Skeleton className="h-4 w-4 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-1/2" style={{ opacity: 0.6 }} />
            </div>
            <Skeleton className="h-5 w-16 rounded-full flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
