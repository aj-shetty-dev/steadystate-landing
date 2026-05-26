import { DoorEventDirection, DoorSignalKind } from '@prisma/client';

export interface DoorEventInput {
  direction: DoorEventDirection;
  occurredAt: Date;
  memberId: string | null;
  externalRef: string | null;
  source: string;
}

export interface DerivedSignal {
  kind: DoorSignalKind;
  detail: string;
}

// Dubai-local thresholds for "after hours"
const AFTER_HOURS_END = 6;   // before 06:00 local
const AFTER_HOURS_START = 23; // 23:00 local onwards
const DUBAI_OFFSET_HOURS = 4;

export function deriveSignals(event: DoorEventInput): DerivedSignal[] {
  const signals: DerivedSignal[] = [];
  const localHour = new Date(event.occurredAt.getTime() + DUBAI_OFFSET_HOURS * 3_600_000).getUTCHours();
  const afterHours = localHour < AFTER_HOURS_END || localHour >= AFTER_HOURS_START;

  if (event.direction === DoorEventDirection.IN) {
    if (afterHours) {
      signals.push({
        kind: DoorSignalKind.AFTER_HOURS_ENTRY,
        detail: `Entry at ${localHour.toString().padStart(2, '0')}:00 Dubai local`,
      });
    }
    if (!event.memberId) {
      signals.push({
        kind: DoorSignalKind.TAILGATE_SUSPECTED,
        detail: `Door read with unmatched member ref=${event.externalRef ?? 'n/a'}`,
      });
    }
  }
  return signals;
}
