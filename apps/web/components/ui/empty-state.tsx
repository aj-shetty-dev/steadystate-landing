import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12">
      <div className="w-12 h-12 rounded-full bg-surface2 flex items-center justify-center mb-4 ring-1 ring-inset ring-border">
        <Icon className="w-5 h-5 text-text3" strokeWidth={1.75} />
      </div>
      <h3 className="text-sm font-medium text-text">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-text2 max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
