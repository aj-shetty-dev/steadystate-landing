import { PageHeaderSkeleton } from '../../../components/skeletons/page-header-skeleton';
import { TableSkeleton } from '../../../components/skeletons/table-skeleton';

export default function DoorLoading() {
  return (
    <div>
      <PageHeaderSkeleton hint="Loading door events…" />
      <TableSkeleton cols={4} rows={8} />
    </div>
  );
}
