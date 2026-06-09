import { describe, expect, it } from 'vitest';
import { phoneSchema, createMemberSchema, updateMemberSchema } from './members';

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
// createMemberSchema — comprehensive validation tests
// ---------------------------------------------------------------------------
describe('createMemberSchema', () => {
  const base = { fullName: 'Ahmed Al Mansoori' };

  // ── Defaults ─────────────────────────────────────────────────────────
  it('defaults membershipStatus to ACTIVE', () => {
    const r = createMemberSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.membershipStatus).toBe('ACTIVE');
  });

  it('defaults preferredLocale to EN', () => {
    const r = createMemberSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.preferredLocale).toBe('EN');
  });

  // ── fullName validation ──────────────────────────────────────────────
  it('rejects empty fullName', () => {
    const r = createMemberSchema.safeParse({ fullName: '' });
    expect(r.success).toBe(false);
  });

  it('rejects whitespace-only fullName', () => {
    const r = createMemberSchema.safeParse({ fullName: '   ' });
    expect(r.success).toBe(false);
  });

  it('rejects fullName exceeding 200 characters', () => {
    const r = createMemberSchema.safeParse({ fullName: 'A'.repeat(201) });
    expect(r.success).toBe(false);
  });

  it('accepts fullName at exactly 200 characters', () => {
    const r = createMemberSchema.safeParse({ fullName: 'A'.repeat(200) });
    expect(r.success).toBe(true);
  });

  // ── Membership status enum parity with Prisma ────────────────────────
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

  // ── Gender enum parity with Prisma ───────────────────────────────────
  // Prisma Gender enum: MALE | FEMALE | OTHER | UNSPECIFIED
  it.each(['MALE', 'FEMALE', 'OTHER'])('accepts gender: %s', (gender) => {
    const r = createMemberSchema.safeParse({ ...base, gender });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.gender).toBe(gender);
  });

  // BUG REPRO: UNSPECIFIED is a valid Prisma Gender enum value but
  // the Zod schema may not include it. This test WILL FAIL until fixed.
  it('accepts gender UNSPECIFIED (Prisma parity)', () => {
    const r = createMemberSchema.safeParse({ ...base, gender: 'UNSPECIFIED' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.gender).toBe('UNSPECIFIED');
  });

  it('rejects invalid gender', () => {
    const r = createMemberSchema.safeParse({ ...base, gender: 'NONBINARY' });
    expect(r.success).toBe(false);
  });

  it('accepts null gender', () => {
    const r = createMemberSchema.safeParse({ ...base, gender: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.gender).toBeNull();
  });

  it('accepts undefined gender (not provided)', () => {
    const r = createMemberSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.gender).toBeUndefined();
  });

  // ── Locale validation ────────────────────────────────────────────────
  it.each(['EN', 'AR'])('accepts preferredLocale: %s', (locale) => {
    const r = createMemberSchema.safeParse({ ...base, preferredLocale: locale });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.preferredLocale).toBe(locale);
  });

  it('rejects invalid preferredLocale', () => {
    const r = createMemberSchema.safeParse({ ...base, preferredLocale: 'FR' });
    expect(r.success).toBe(false);
  });

  // ── Date handling — joinedAt ─────────────────────────────────────────
  // CRITICAL BUG: CalendarPopover sends dates as "YYYY-MM-DD" (date-only),
  // but the Zod schema uses z.string().datetime() which requires ISO 8601.
  // This means ANY member created with a joinedAt date WILL FAIL validation.

  it('accepts joinedAt as ISO datetime string (current behavior)', () => {
    const r = createMemberSchema.safeParse({
      ...base,
      joinedAt: '2025-06-09T00:00:00.000Z',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.joinedAt).toBe('2025-06-09T00:00:00.000Z');
  });

  // BUG REPRO: This test WILL FAIL until the Zod schema is fixed to accept
  // date-only strings from the CalendarPopover component.
  it('accepts joinedAt as date-only string YYYY-MM-DD (from CalendarPopover)', () => {
    const r = createMemberSchema.safeParse({
      ...base,
      joinedAt: '2025-06-09',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.joinedAt).toBe('2025-06-09');
  });

  it('accepts joinedAt as ISO datetime with timezone offset', () => {
    const r = createMemberSchema.safeParse({
      ...base,
      joinedAt: '2025-06-09T14:30:00+04:00',
    });
    expect(r.success).toBe(true);
  });

  it('rejects invalid joinedAt string', () => {
    const r = createMemberSchema.safeParse({
      ...base,
      joinedAt: 'not-a-date',
    });
    expect(r.success).toBe(false);
  });

  it('accepts undefined joinedAt (not provided)', () => {
    const r = createMemberSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.joinedAt).toBeUndefined();
  });

  // ── Date handling — dateOfBirth ──────────────────────────────────────
  // SAME BUG: CalendarPopover sends "YYYY-MM-DD" but Zod expects datetime.

  it('accepts dateOfBirth as ISO datetime string', () => {
    const r = createMemberSchema.safeParse({
      ...base,
      dateOfBirth: '1995-06-20T00:00:00.000Z',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.dateOfBirth).toBe('1995-06-20T00:00:00.000Z');
  });

  // BUG REPRO: This test WILL FAIL until the Zod schema is fixed.
  it('accepts dateOfBirth as date-only string YYYY-MM-DD (from CalendarPopover)', () => {
    const r = createMemberSchema.safeParse({
      ...base,
      dateOfBirth: '1995-06-20',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.dateOfBirth).toBe('1995-06-20');
  });

  it('accepts null dateOfBirth', () => {
    const r = createMemberSchema.safeParse({ ...base, dateOfBirth: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.dateOfBirth).toBeNull();
  });

  it('accepts undefined dateOfBirth (not provided)', () => {
    const r = createMemberSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.dateOfBirth).toBeUndefined();
  });

  it('rejects invalid dateOfBirth string', () => {
    const r = createMemberSchema.safeParse({
      ...base,
      dateOfBirth: 'garbage',
    });
    expect(r.success).toBe(false);
  });

  // ── Email validation ─────────────────────────────────────────────────
  it('accepts valid email', () => {
    const r = createMemberSchema.safeParse({ ...base, email: 'test@example.com' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('test@example.com');
  });

  it('rejects invalid email', () => {
    const r = createMemberSchema.safeParse({ ...base, email: 'not-an-email' });
    expect(r.success).toBe(false);
  });

  it('accepts null email', () => {
    const r = createMemberSchema.safeParse({ ...base, email: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBeNull();
  });

  it('accepts undefined email', () => {
    const r = createMemberSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBeUndefined();
  });

  // ── Medical notes ────────────────────────────────────────────────────
  it('accepts medicalNotes up to 1000 characters', () => {
    const notes = 'A'.repeat(1000);
    const r = createMemberSchema.safeParse({ ...base, medicalNotes: notes });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.medicalNotes).toBe(notes);
  });

  it('rejects medicalNotes exceeding 1000 characters', () => {
    const r = createMemberSchema.safeParse({ ...base, medicalNotes: 'A'.repeat(1001) });
    expect(r.success).toBe(false);
  });

  it('accepts null medicalNotes', () => {
    const r = createMemberSchema.safeParse({ ...base, medicalNotes: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.medicalNotes).toBeNull();
  });

  // ── Emergency contact ────────────────────────────────────────────────
  it('accepts emergencyContact as object', () => {
    const r = createMemberSchema.safeParse({
      ...base,
      emergencyContact: { name: 'Ali', phone: '+971501234567' },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.emergencyContact).toEqual({
      name: 'Ali',
      phone: '+971501234567',
    });
  });

  it('accepts null emergencyContact', () => {
    const r = createMemberSchema.safeParse({ ...base, emergencyContact: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.emergencyContact).toBeNull();
  });

  // ── Assigned trainer ─────────────────────────────────────────────────
  it('accepts assignedTrainerId as string', () => {
    const r = createMemberSchema.safeParse({
      ...base,
      assignedTrainerId: 'trainer-uuid',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.assignedTrainerId).toBe('trainer-uuid');
  });

  it('accepts null assignedTrainerId', () => {
    const r = createMemberSchema.safeParse({ ...base, assignedTrainerId: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.assignedTrainerId).toBeNull();
  });

  // ── Full payload with normalization ──────────────────────────────────
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

  // BUG REPRO: Full payload with date-only strings (as sent by frontend)
  // This test WILL FAIL until date handling is fixed.
  it('accepts full payload with date-only strings (real frontend payload)', () => {
    const r = createMemberSchema.safeParse({
      fullName: 'Ahmed Al Mansoori',
      phone: '+971 50 123 4567',
      email: 'ahmed@example.com',
      membershipStatus: 'ACTIVE',
      joinedAt: '2025-06-09',
      preferredLocale: 'EN',
      gender: 'MALE',
      dateOfBirth: '1990-01-15',
      medicalNotes: '',
      emergencyContact: null,
      assignedTrainerId: null,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.phone).toBe('+971501234567');
      expect(r.data.joinedAt).toBe('2025-06-09');
      expect(r.data.dateOfBirth).toBe('1990-01-15');
    }
  });

  // ── Minimal payload (only fullName) ──────────────────────────────────
  it('accepts minimal payload with only fullName', () => {
    const r = createMemberSchema.safeParse({ fullName: 'John Doe' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.fullName).toBe('John Doe');
      expect(r.data.membershipStatus).toBe('ACTIVE');
      expect(r.data.preferredLocale).toBe('EN');
      expect(r.data.phone).toBeUndefined();
      expect(r.data.email).toBeUndefined();
      expect(r.data.joinedAt).toBeUndefined();
      expect(r.data.gender).toBeUndefined();
      expect(r.data.dateOfBirth).toBeUndefined();
    }
  });

  // ── Edge cases: fullName ────────────────────────────────────────────
  it('accepts unicode characters in fullName', () => {
    const r = createMemberSchema.safeParse({ fullName: 'أحمد المنصوري' });
    expect(r.success).toBe(true);
  });

  it('accepts emoji in fullName (not recommended but should not crash)', () => {
    const r = createMemberSchema.safeParse({ fullName: 'John 💪 Smith' });
    expect(r.success).toBe(true);
  });

  it('accepts fullName with hyphens and apostrophes', () => {
    const r = createMemberSchema.safeParse({ fullName: "O'Connor-Smith" });
    expect(r.success).toBe(true);
  });

  it('accepts fullName at exactly 1 character', () => {
    const r = createMemberSchema.safeParse({ fullName: 'A' });
    expect(r.success).toBe(true);
  });

  // ── Edge cases: phone boundary lengths ──────────────────────────────
  it('accepts phone at minimum length (+1 followed by 6 digits)', () => {
    const r = createMemberSchema.safeParse({ ...base, phone: '+1234567' });
    expect(r.success).toBe(true);
  });

  it('accepts phone near maximum length (+ followed by 15 digits)', () => {
    // +[1-9]\d{6,14} means 1 country digit + 6-14 more = 7-15 digits after +
    const r = createMemberSchema.safeParse({ ...base, phone: '+123456789012345' }); // 15 digits after +
    expect(r.success).toBe(true);
  });

  it('rejects phone too short (only +1 and 5 digits = 6 total)', () => {
    const r = createMemberSchema.safeParse({ ...base, phone: '+123456' });
    expect(r.success).toBe(false);
  });

  it('rejects phone too long (16 digits after +)', () => {
    const r = createMemberSchema.safeParse({ ...base, phone: '+1234567890123456' });
    expect(r.success).toBe(false);
  });

  it('rejects phone that is just a + sign', () => {
    const r = createMemberSchema.safeParse({ ...base, phone: '+' });
    expect(r.success).toBe(false);
  });

  // ── Edge cases: email variants ──────────────────────────────────────
  it('accepts email with +alias', () => {
    const r = createMemberSchema.safeParse({ ...base, email: 'test+alias@example.com' });
    expect(r.success).toBe(true);
  });

  it('accepts email with subdomain', () => {
    const r = createMemberSchema.safeParse({ ...base, email: 'test@sub.example.com' });
    expect(r.success).toBe(true);
  });

  it('accepts email with numeric TLD', () => {
    // Some internal emails use .local or .internal — but Zod's email() is lenient
    const r = createMemberSchema.safeParse({ ...base, email: 'test@example.co.uk' });
    expect(r.success).toBe(true);
  });

  // ── Edge cases: date boundaries ─────────────────────────────────────
  it('accepts joinedAt on Feb 29 in a leap year', () => {
    const r = createMemberSchema.safeParse({ ...base, joinedAt: '2024-02-29' });
    expect(r.success).toBe(true);
  });

  it('accepts joinedAt on Feb 29 in a non-leap year (JS Date overflows to Mar 1)', () => {
    // JavaScript Date constructor overflows: 2025-02-29 → 2025-03-01
    // This is acceptable since the CalendarPopover prevents users from picking
    // invalid dates; only programmatic API calls could produce this.
    const r = createMemberSchema.safeParse({ ...base, joinedAt: '2025-02-29' });
    expect(r.success).toBe(true);
  });

  it('accepts dateOfBirth at year 1900 boundary', () => {
    const r = createMemberSchema.safeParse({ ...base, dateOfBirth: '1900-01-01' });
    expect(r.success).toBe(true);
  });

  it('accepts joinedAt on Dec 31', () => {
    const r = createMemberSchema.safeParse({ ...base, joinedAt: '2025-12-31' });
    expect(r.success).toBe(true);
  });

  it('rejects joinedAt with month 13', () => {
    const r = createMemberSchema.safeParse({ ...base, joinedAt: '2025-13-01' });
    expect(r.success).toBe(false);
  });

  it('rejects joinedAt with day 32', () => {
    const r = createMemberSchema.safeParse({ ...base, joinedAt: '2025-01-32' });
    expect(r.success).toBe(false);
  });

  it('rejects joinedAt with month 00', () => {
    const r = createMemberSchema.safeParse({ ...base, joinedAt: '2025-00-01' });
    expect(r.success).toBe(false);
  });

  it('rejects partial date (just year)', () => {
    const r = createMemberSchema.safeParse({ ...base, joinedAt: '2025' });
    expect(r.success).toBe(false);
  });

  it('rejects joinedAt that is not a date string at all', () => {
    const r = createMemberSchema.safeParse({ ...base, joinedAt: 'next Tuesday' });
    expect(r.success).toBe(false);
  });

  // ── Edge cases: emergencyContact types ───────────────────────────────
  it('accepts emergencyContact with extra unknown properties', () => {
    const r = createMemberSchema.safeParse({
      ...base,
      emergencyContact: { name: 'Ali', phone: '+971501234567', relation: 'Brother' },
    });
    expect(r.success).toBe(true);
  });

  it('accepts emergencyContact as empty object', () => {
    const r = createMemberSchema.safeParse({ ...base, emergencyContact: {} });
    expect(r.success).toBe(true);
  });

  it('accepts emergencyContact as a string (z.any() allows it)', () => {
    const r = createMemberSchema.safeParse({ ...base, emergencyContact: 'call Ali' });
    expect(r.success).toBe(true);
  });

  // ── Edge cases: empty strings for optional fields ────────────────────
  it('rejects empty string for phone (not the same as null)', () => {
    const r = createMemberSchema.safeParse({ ...base, phone: '' });
    expect(r.success).toBe(false);
  });

  it('rejects empty string for email (not the same as null)', () => {
    const r = createMemberSchema.safeParse({ ...base, email: '' });
    expect(r.success).toBe(false);
  });

  // ── Edge cases: extra unknown keys ───────────────────────────────────
  it('strips extra unknown properties from payload', () => {
    const r = createMemberSchema.safeParse({
      ...base,
      fullName: 'Test',
      unknownField: 'should be stripped',
      anotherUnexpected: 123,
    });
    // Zod's .object() strips unknown keys by default
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data as any).unknownField).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// updateMemberSchema — partial updates
// ---------------------------------------------------------------------------
describe('updateMemberSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    const r = updateMemberSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it('accepts partial update with only fullName', () => {
    const r = updateMemberSchema.safeParse({ fullName: 'Updated Name' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.fullName).toBe('Updated Name');
  });

  // BUG REPRO: dateOfBirth and membershipExpiresAt as date-only strings
  it('accepts dateOfBirth as date-only string YYYY-MM-DD', () => {
    const r = updateMemberSchema.safeParse({ dateOfBirth: '1995-06-20' });
    expect(r.success).toBe(true);
  });

  it('accepts membershipExpiresAt as date-only string YYYY-MM-DD', () => {
    const r = updateMemberSchema.safeParse({
      membershipExpiresAt: '2026-12-31',
    });
    expect(r.success).toBe(true);
  });

  it('accepts null membershipExpiresAt (clearing the field)', () => {
    const r = updateMemberSchema.safeParse({ membershipExpiresAt: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.membershipExpiresAt).toBeNull();
  });

  it('accepts joinedAt as date-only string for update', () => {
    const r = updateMemberSchema.safeParse({ joinedAt: '2025-01-01' });
    expect(r.success).toBe(true);
  });

  it('rejects invalid joinedAt in update', () => {
    const r = updateMemberSchema.safeParse({ joinedAt: 'not-valid' });
    expect(r.success).toBe(false);
  });

  // ── Edge cases: setting fields to null ──────────────────────────────
  it('accepts setting gender to null', () => {
    const r = updateMemberSchema.safeParse({ gender: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.gender).toBeNull();
  });

  it('accepts setting phone to null', () => {
    const r = updateMemberSchema.safeParse({ phone: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.phone).toBeNull();
  });

  it('accepts setting email to null', () => {
    const r = updateMemberSchema.safeParse({ email: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBeNull();
  });

  it('accepts setting dateOfBirth to null', () => {
    const r = updateMemberSchema.safeParse({ dateOfBirth: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.dateOfBirth).toBeNull();
  });

  it('rejects setting fullName to empty string in update', () => {
    const r = updateMemberSchema.safeParse({ fullName: '' });
    expect(r.success).toBe(false);
  });
});
