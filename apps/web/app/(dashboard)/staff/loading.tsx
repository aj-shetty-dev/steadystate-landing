import { PageHeaderSkeleton } from '../../../components/skeletons/page-header-skeleton';
import { TableSkeleton } from '../../../components/skeletons/table-skeleton';

export default function StaffLoading() {
  return (
    <div>
      <PageHeaderSkeleton hint="Loading staff…" />
      <TableSkeleton cols={5} rows={5} />
    </div>
  );
}
