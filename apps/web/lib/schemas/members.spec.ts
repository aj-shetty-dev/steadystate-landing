import { describe, expect, it } from 'vitest';
import { phoneSchema, createMemberSchema } from './members';

// ---------------------------------------------------------------------------
// phoneSchema — E.164 with whitespace tolerance
// ---------------------------------------------------------------------------
describe('phoneSchema', () => {
  // ── Valid: standard E.164 ──────────────────────────────────────────────
  it.each([
    ['+971501234567', '+971501234567'],
    ['+14155238886', '+14155238886'],
    ['+447911123456', '+447911123456'],
  ])('accepts standard E.164: %s', (input, expected) => {
    const r = phoneSchema.safeParse(input);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(expected);
  });

  // ── Valid: whitespace / separators → auto-normalized ───────────────────
  it.each([
    // spaces
    ['+971 50 123 4567', '+971501234567'],
    ['+1 415 523 8886', '+14155238886'],
    // dashes
    ['+971-50-123-4567', '+971501234567'],
    ['+44-7911-123456', '+447911123456'],
    // parentheses + dots
    ['+1 (415) 523.8886', '+14155238886'],
    // mixed
    ['+971 (50) 123-4567', '+971501234567'],
  ])('normalizes separators: %s → %s', (input, expected) => {
    const r = phoneSchema.safeParse(input);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(expected);
  });

  // ── Valid: null / undefined ────────────────────────────────────────────
  it.each([null, undefined])('accepts %s', (val) => {
    const r = phoneSchema.safeParse(val);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe(val);
  });

  // ── Invalid: no + prefix ───────────────────────────────────────────────
  it.each([
    ['0501234567', 'local UAE number without +'],
    ['971501234567', 'missing + prefix'],
    ['+0501234567', 'country code starts with 0'],
    ['', 'empty string'],
    ['abc', 'letters'],
  ])('rejects invalid: %s (%s)', (input) => {
    const r = phoneSchema.safeParse(input);
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createMemberSchema — membershipStatus enum parity with Prisma
// ---------------------------------------------------------------------------
describe('createMemberSchema', () => {
  const base = { fullName: 'Ahmed Al Mansoori' };

  it('defaults membershipStatus to ACTIVE', () => {
    const r = createMemberSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.membershipStatus).toBe('ACTIVE');
  });

  it.each([
    'ACTIVE',
    'EXPIRED',
    'PAUSED',
    'FROZEN',
    'CANCELLED',
    'PENDING',
    'PENDING_PAYMENT',
  ] as const)('accepts membershipStatus: %s', (status) => {
    const r = createMemberSchema.safeParse({ ...base, membershipStatus: status });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.membershipStatus).toBe(status);
  });

  it('rejects unknown membershipStatus', () => {
    const r = createMemberSchema.safeParse({ ...base, membershipStatus: 'SUSPENDED' });
    expect(r.success).toBe(false);
  });

  // ── full payload with phone normalization ──────────────────────────────
  it('accepts a full create payload with phone containing spaces', () => {
    const r = createMemberSchema.safeParse({
      fullName: 'Fatima Al Sayed',
      phone: '+971 55 987 6543',
      email: 'fatima@example.com',
      membershipStatus: 'PENDING',
      joinedAt: '2025-01-15T00:00:00.000Z',
      preferredLocale: 'AR',
      gender: 'FEMALE',
      dateOfBirth: '1995-06-20T00:00:00.000Z',
      medicalNotes: 'No known allergies',
      emergencyContact: { name: 'Ali', phone: '+971501234567' },
      assignedTrainerId: 'trainer-uuid',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.phone).toBe('+971559876543'); // normalized
      expect(r.data.membershipStatus).toBe('PENDING');
      expect(r.data.preferredLocale).toBe('AR');
    }
  });
});
