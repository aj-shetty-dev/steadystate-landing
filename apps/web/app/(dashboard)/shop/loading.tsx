import { Skeleton } from '../../../components/ui/skeleton';
import { PageHeaderSkeleton } from '../../../components/skeletons/page-header-skeleton';

function ProductCardSkeleton() {
  return (
    <div className="bg-surface border border-border rounded p-4">
      <Skeleton className="h-3 w-16 mb-3" />
      <Skeleton className="h-5 w-3/4 mb-2" />
      <Skeleton className="h-3 w-1/2 mb-4" />
      <Skeleton className="h-7 w-24 rounded" />
    </div>
  );
}

export default function ShopLoading() {
  return (
    <div>
      <PageHeaderSkeleton hint="Loading products…" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)}
      </div>
    </div>
  );
}
