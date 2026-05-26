import { describe, expect, it } from 'vitest';
import { toE164 } from './crm.mapping';

describe('toE164', () => {
  it('keeps valid E.164 numbers as-is', () => {
    expect(toE164('+971501234567')).toBe('+971501234567');
  });

  it('strips formatting characters', () => {
    expect(toE164('+971 (50) 123-4567')).toBe('+971501234567');
  });

  it('prepends UAE country code to local numbers', () => {
    expect(toE164('0501234567')).toBe('+971501234567');
  });

  it('uses a custom default country when provided', () => {
    expect(toE164('5551234567', '1')).toBe('+15551234567');
  });

  it('returns null for empty input', () => {
    expect(toE164(null)).toBeNull();
    expect(toE164(undefined)).toBeNull();
    expect(toE164('')).toBeNull();
  });

  it('returns null when the result is not valid E.164', () => {
    expect(toE164('+0')).toBeNull();
    expect(toE164('++++')).toBeNull();
  });
});
