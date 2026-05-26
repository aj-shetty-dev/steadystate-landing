import { PageHeaderSkeleton } from '../../../components/skeletons/page-header-skeleton';
import { TableSkeleton } from '../../../components/skeletons/table-skeleton';

export default function MessagesLoading() {
  return (
    <div>
      <PageHeaderSkeleton hint="Fetching messages…" />
      <TableSkeleton cols={5} rows={8} />
    </div>
  );
}
