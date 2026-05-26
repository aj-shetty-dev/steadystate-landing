import { describe, expect, it } from 'vitest';
import { nextSalaryWindow, scheduledInstantFor, timezoneOffsetHours, windowForMonth } from './salary-scheduler';

const dubai = { startDay: 25, endDay: 28, timezone: 'Asia/Dubai', jitterMinutes: 120 };

describe('salary-scheduler', () => {
  it('returns current window when now is before its end', () => {
    const now = new Date('2026-05-26T10:00:00Z');
    const span = nextSalaryWindow(now, dubai);
    expect(span.from.toISOString()).toBe('2026-05-24T20:00:00.000Z');
    expect(span.to.toISOString()).toBe('2026-05-28T19:59:00.000Z');
  });

  it('rolls to next month when now is past the window', () => {
    const now = new Date('2026-05-29T00:00:00Z');
    const span = nextSalaryWindow(now, dubai);
    expect(span.from.getUTCMonth()).toBe(5); // June (0-indexed)
    expect(span.to.getUTCMonth()).toBe(5);
  });

  it('clamps day to month length (Feb non-leap)', () => {
    const w = { ...dubai, startDay: 25, endDay: 28 };
    const span = windowForMonth(2027, 1, w);
    expect(span.from.toISOString()).toBe('2027-02-24T20:00:00.000Z');
    expect(span.to.toISOString()).toBe('2027-02-28T19:59:00.000Z');
  });

  it('clamps day to month length (Feb leap year)', () => {
    const span = windowForMonth(2028, 1, { ...dubai, startDay: 25, endDay: 30 });
    expect(span.to.getUTCDate()).toBeLessThanOrEqual(29);
  });

  it('rolls year-end correctly', () => {
    const now = new Date('2026-12-29T00:00:00Z');
    const span = nextSalaryWindow(now, dubai);
    expect(span.from.getUTCFullYear()).toBe(2027);
    expect(span.from.getUTCMonth()).toBe(0);
  });

  it('produces deterministic jittered instants within the window', () => {
    const span = nextSalaryWindow(new Date('2026-05-20T00:00:00Z'), dubai);
    const a = scheduledInstantFor('invoice-a', span, dubai);
    const b = scheduledInstantFor('invoice-b', span, dubai);
    const aAgain = scheduledInstantFor('invoice-a', span, dubai);
    expect(a.getTime()).toBe(aAgain.getTime());
    expect(a.getTime()).not.toBe(b.getTime());
    expect(a.getTime()).toBeGreaterThanOrEqual(span.from.getTime());
    expect(a.getTime()).toBeLessThanOrEqual(span.to.getTime());
  });

  it('exposes timezone offsets for GCC and UTC', () => {
    expect(timezoneOffsetHours('Asia/Dubai')).toBe(4);
    expect(timezoneOffsetHours('Asia/Riyadh')).toBe(3);
    expect(timezoneOffsetHours('UTC')).toBe(0);
  });

  it('throws for unsupported timezones', () => {
    expect(() => timezoneOffsetHours('Europe/London')).toThrow();
  });
});
