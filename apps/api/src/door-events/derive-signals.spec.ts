import { DoorEventDirection, DoorSignalKind } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { deriveSignals } from './derive-signals';

describe('deriveSignals', () => {
  it('flags after-hours entry (00:30 Dubai)', () => {
    // 00:30 Dubai = 20:30 UTC previous day
    const s = deriveSignals({
      direction: DoorEventDirection.IN,
      occurredAt: new Date('2026-05-15T20:30:00Z'),
      memberId: 'm1',
      externalRef: 'r',
      source: 'demo',
    });
    expect(s.map((x) => x.kind)).toContain(DoorSignalKind.AFTER_HOURS_ENTRY);
  });

  it('does not flag mid-day entry (12:00 Dubai)', () => {
    const s = deriveSignals({
      direction: DoorEventDirection.IN,
      occurredAt: new Date('2026-05-15T08:00:00Z'),
      memberId: 'm1',
      externalRef: 'r',
      source: 'demo',
    });
    expect(s).toEqual([]);
  });

  it('flags tailgate when no member match', () => {
    const s = deriveSignals({
      direction: DoorEventDirection.IN,
      occurredAt: new Date('2026-05-15T08:00:00Z'),
      memberId: null,
      externalRef: 'r',
      source: 'demo',
    });
    expect(s.map((x) => x.kind)).toContain(DoorSignalKind.TAILGATE_SUSPECTED);
  });

  it('does not flag OUT direction', () => {
    const s = deriveSignals({
      direction: DoorEventDirection.OUT,
      occurredAt: new Date('2026-05-15T20:30:00Z'),
      memberId: null,
      externalRef: 'r',
      source: 'demo',
    });
    expect(s).toEqual([]);
  });
});
