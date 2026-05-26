import type { ReactNode } from 'react';

export type BadgeTone = 'green' | 'warning' | 'error' | 'neutral' | 'muted';

const TONES: Record<BadgeTone, string> = {
  green:   'bg-green/10 text-green ring-green/20',
  warning: 'bg-warning/10 text-warning ring-warning/20',
  error:   'bg-error/10 text-error ring-error/20',
  neutral: 'bg-surface2 text-text ring-border',
  muted:   'bg-surface2 text-text3 ring-border',
};

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium tracking-wide rounded-full ring-1 ring-inset ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
