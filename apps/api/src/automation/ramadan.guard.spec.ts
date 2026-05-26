import { describe, expect, it } from 'vitest';
import { RamadanGuard } from './ramadan.guard';

describe('RamadanGuard', () => {
  const guard = new RamadanGuard();

  it('does not suppress outside Ramadan', () => {
    // 2026-05-15 12:00 Dubai = 08:00 UTC
    expect(guard.shouldSuppressNow(new Date('2026-05-15T08:00:00Z'))).toBe(false);
  });

  it('suppresses during Fajr-Iftar window in Ramadan', () => {
    // 2026-03-01 (within 2026-02-18..2026-03-19), 12:00 Dubai = 08:00 UTC
    expect(guard.shouldSuppressNow(new Date('2026-03-01T08:00:00Z'))).toBe(true);
  });

  it('allows sends after Iftar during Ramadan', () => {
    // 2026-03-01 19:00 Dubai = 15:00 UTC
    expect(guard.shouldSuppressNow(new Date('2026-03-01T15:00:00Z'))).toBe(false);
  });

  it('allows sends before Fajr during Ramadan', () => {
    // 2026-03-01 04:00 Dubai = 2026-03-01T00:00Z
    expect(guard.shouldSuppressNow(new Date('2026-03-01T00:00:00Z'))).toBe(false);
  });
});
