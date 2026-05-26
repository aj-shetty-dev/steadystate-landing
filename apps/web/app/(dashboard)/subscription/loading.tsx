import { PageHeaderSkeleton } from '../../../components/skeletons/page-header-skeleton';
import { SplitCardSkeleton } from '../../../components/skeletons/split-card-skeleton';

export default function SubscriptionLoading() {
  return (
    <div>
      <PageHeaderSkeleton hint="Loading subscription…" />
      <SplitCardSkeleton />
    </div>
  );
}
