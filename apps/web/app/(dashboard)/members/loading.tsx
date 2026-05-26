import { PageHeaderSkeleton } from '../../../components/skeletons/page-header-skeleton';
import { TableSkeleton } from '../../../components/skeletons/table-skeleton';

export default function MembersLoading() {
  return (
    <div>
      <PageHeaderSkeleton hint="Fetching members…" />
      <TableSkeleton cols={6} rows={8} />
    </div>
  );
}
