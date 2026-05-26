import { PageHeaderSkeleton } from '../../../components/skeletons/page-header-skeleton';
import { TableSkeleton } from '../../../components/skeletons/table-skeleton';

export default function ClassesLoading() {
  return (
    <div>
      <PageHeaderSkeleton hint="Loading class schedule…" />
      <TableSkeleton cols={5} rows={6} />
    </div>
  );
}
