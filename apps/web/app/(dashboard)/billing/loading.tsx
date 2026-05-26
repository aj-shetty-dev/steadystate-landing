import { PageHeaderSkeleton } from '../../../components/skeletons/page-header-skeleton';
import { TableSkeleton } from '../../../components/skeletons/table-skeleton';

export default function BillingLoading() {
  return (
    <div>
      <PageHeaderSkeleton hint="Loading billing…" />
      <TableSkeleton cols={4} rows={6} />
    </div>
  );
}
