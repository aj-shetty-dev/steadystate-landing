import { Skeleton } from '../ui/skeleton';

interface Props {
  hint?: string;
}

export function PageHeaderSkeleton({ hint }: Props) {
  return (
    <div className="mb-8">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-80 mt-2" />
      {hint && <p className="mt-1 text-xs text-text3">{hint}</p>}
    </div>
  );
}
