import type { ReactNode } from 'react';

/**
 * Wrapper for data-heavy pages. Makes the header sticky and only the
 * data area scrolls when content overflows.
 */
export function ScrollableData({
  header,
  children,
}: {
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-shrink-0">{header}</div>
      <div className="flex-1 min-h-0 mt-4 overflow-y-auto">{children}</div>
    </div>
  );
}
