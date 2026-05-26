import { Skeleton } from '../../../components/ui/skeleton';
import { PageHeaderSkeleton } from '../../../components/skeletons/page-header-skeleton';
import { StatCardSkeleton } from '../../../components/skeletons/stat-card-skeleton';
import { TableSkeleton } from '../../../components/skeletons/table-skeleton';

function SectionHeader() {
  return <Skeleton className="h-5 w-32 mb-3" />;
}

export default function ReportsLoading() {
  return (
    <div>
      <PageHeaderSkeleton hint="Trailing 30 days…" />

      <SectionHeader />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
      </div>

      <SectionHeader />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
      </div>

      <SectionHeader />
      <div className="mb-6">
        <TableSkeleton cols={5} rows={4} />
      </div>

      <SectionHeader />
      <TableSkeleton cols={4} rows={4} />
    </div>
  );
}
