import { PageHeaderSkeleton } from '../../../components/skeletons/page-header-skeleton';
import { TableSkeleton } from '../../../components/skeletons/table-skeleton';

export default function AdminLoading() {
  return (
    <div>
      <PageHeaderSkeleton hint="Loading tenants…" />
      <TableSkeleton cols={5} rows={8} />
    </div>
  );
}
