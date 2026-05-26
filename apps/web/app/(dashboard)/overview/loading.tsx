import { PageHeaderSkeleton } from '../../../components/skeletons/page-header-skeleton';
import { StatCardSkeleton } from '../../../components/skeletons/stat-card-skeleton';

export default function OverviewLoading() {
  return (
    <div>
      <PageHeaderSkeleton />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
