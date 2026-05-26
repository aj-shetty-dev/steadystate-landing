import { PageHeaderSkeleton } from '../../../components/skeletons/page-header-skeleton';
import { TableSkeleton } from '../../../components/skeletons/table-skeleton';

export default function CheckinsLoading() {
  return (
    <div>
      <PageHeaderSkeleton hint="Loading check-ins…" />
      <TableSkeleton cols={4} rows={8} />
    </div>
  );
}
