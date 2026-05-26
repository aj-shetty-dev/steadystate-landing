import { Skeleton } from '../ui/skeleton';

interface Props {
  cols: number;
  rows?: number;
}

export function TableSkeleton({ cols, rows = 8 }: Props) {
  return (
    <div className="bg-surface border border-border rounded overflow-hidden">
      {/* header row */}
      <div className="bg-surface2 px-4 py-3 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3" style={{ flex: i === 0 ? 2 : 1 }} />
        ))}
      </div>
      {/* data rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="border-t border-border px-4 py-3 flex gap-4 items-center">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-3"
              style={{ flex: i === 0 ? 2 : 1, opacity: i === 0 ? 1 : 0.6 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
