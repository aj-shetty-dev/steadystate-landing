import { Badge, type BadgeTone } from './badge';

const STATUS_TONES: Record<string, BadgeTone> = {
  // Members / leads
  ACTIVE: 'green',
  TRIAL: 'green',
  AT_RISK: 'warning',
  PAUSED: 'warning',
  EXPIRED: 'error',
  CANCELLED: 'error',
  CONVERTED: 'green',
  LOST: 'error',
  TRIAL_BOOKED: 'warning',
  TRIAL_COMPLETED: 'green',
  CONTACTED: 'warning',
  NEW: 'neutral',

  // Messages
  QUEUED: 'muted',
  SENT: 'green',
  DELIVERED: 'green',
  READ: 'green',
  FAILED: 'error',
  UNDELIVERED: 'error',

  // Automation signals
  PENDING: 'warning',
  NUDGED: 'green',
  DISMISSED: 'muted',

  // Billing
  PAID: 'green',
  RETRY_SCHEDULED: 'warning',
  WRITTEN_OFF: 'muted',
  REFUNDED: 'muted',
  VOID: 'muted',
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONES[status] ?? 'neutral';
  return <Badge tone={tone}>{status.replace(/_/g, ' ')}</Badge>;
}
