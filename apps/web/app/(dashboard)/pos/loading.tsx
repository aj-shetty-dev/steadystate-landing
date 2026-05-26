import { Skeleton } from '../../../components/ui/skeleton';
import { PageHeaderSkeleton } from '../../../components/skeletons/page-header-skeleton';
import { TableSkeleton } from '../../../components/skeletons/table-skeleton';

export default function PosLoading() {
  return (
    <div>
      <PageHeaderSkeleton hint="Loading sales…" />
      <Skeleton className="h-3 w-48 mb-4" />
      <TableSkeleton cols={5} rows={8} />
    </div>
  );
}
