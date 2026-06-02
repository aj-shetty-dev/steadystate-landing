import type { ReactNode } from 'react';

interface Props {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: Props) {
  return (
    <div className="mb-4 sm:mb-6 lg:mb-8 flex flex-wrap items-end justify-between gap-4 pl-10 md:pl-0">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-text">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-text2 max-w-2xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
