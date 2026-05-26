import { PageHeaderSkeleton } from '../../../components/skeletons/page-header-skeleton';
import { TableSkeleton } from '../../../components/skeletons/table-skeleton';

export default function MembershipsLoading() {
  return (
    <div>
      <PageHeaderSkeleton hint="Loading memberships…" />
      <TableSkeleton cols={5} rows={6} />
    </div>
  );
}
