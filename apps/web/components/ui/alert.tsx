import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import type { ReactNode } from 'react';

type AlertTone = 'error' | 'warning' | 'info';

const TONES: Record<AlertTone, { wrap: string; icon: typeof AlertTriangle }> = {
  error:   { wrap: 'border-error/30 bg-error/5 text-error',     icon: AlertCircle   },
  warning: { wrap: 'border-warning/30 bg-warning/5 text-warning', icon: AlertTriangle },
  info:    { wrap: 'border-border bg-surface2 text-text2',      icon: Info          },
};

export function Alert({
  tone = 'error',
  children,
}: {
  tone?: AlertTone;
  children: ReactNode;
}) {
  const { wrap, icon: Icon } = TONES[tone];
  return (
    <div className={`flex items-start gap-3 rounded-md border px-4 py-3 text-sm ${wrap}`}>
      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" strokeWidth={2} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
