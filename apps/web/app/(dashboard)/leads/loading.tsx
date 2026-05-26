import { KanbanSkeleton } from '../../../components/skeletons/kanban-skeleton';
import { PageHeaderSkeleton } from '../../../components/skeletons/page-header-skeleton';

export default function LeadsLoading() {
  return (
    <div>
      <PageHeaderSkeleton hint="Loading pipeline…" />
      <KanbanSkeleton />
    </div>
  );
}
