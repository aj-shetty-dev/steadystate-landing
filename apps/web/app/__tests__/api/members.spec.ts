/**
 * Members API — End-to-End Flow Tests
 *
 * Covers: Create member → Read member → List members → Update member →
 *         Deactivate member → Edge cases (duplicate phone, not found, validation)
 *
 * COMPREHENSIVE CREATE TESTS: Every field combination, every validation path,
 * every error condition. Covers the date-only string bug (CalendarPopover sends
 * YYYY-MM-DD but Zod expected ISO datetime), the UNSPECIFIED gender gap, and
 * all enum parity issues identified during audit.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MOCK_USER, createReq, jsonBody, NOW } from './test-helpers';

/* ------------------------------------------------------------------ */
/* Mock prisma                                                        */
/* ------------------------------------------------------------------ */
const mockPrisma = {
  member: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  membership: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  booking: {
    updateMany: vi.fn(),
  },
  $transaction: vi.fn((fn: any) => fn(mockPrisma)),
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

vi.mock("@/lib/auth-server", () => ({
  requireServerUser: vi.fn().mockResolvedValue({ id: "user-1", email: "owner@testgym.ae", fullName: "Test Owner", tenantId: "tenant-1", role: "OWNER" }),
  requireTenantId: vi.fn().mockResolvedValue("tenant-1"),
  getServerUser: vi.fn().mockResolvedValue({ id: "user-1", email: "owner@testgym.ae", fullName: "Test Owner", tenantId: "tenant-1", role: "OWNER" }),
}));

/* Import handlers AFTER mocks are set up */
const handlers = await import('../../api/members/route');
const idHandlers = await import('../../api/members/[id]/route');
const deactivateHandlers = await import('../../api/members/[id]/deactivate/route');

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */
describe('Members API — Full Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /* ─────────────────────────────────────────────────────────────── */
  /* CREATE Member — Comprehensive                                   */
  /* ─────────────────────────────────────────────────────────────── */
  describe('POST /api/members — Create', () => {
    /* ─── Success: happy paths ─────────────────────────────────── */

    it('creates a member with required fields and returns 201', async () => {
      const createdMember = {
        id: 'mem-1',
        tenantId: MOCK_USER.tenantId,
        externalId: 'ext-uuid',
        provider: 'NATIVE',
        source: 'MANUAL',
        fullName: 'Ahmed Al Mansoori',
        phone: '+971501234567',
        email: 'ahmed@example.com',
        membershipStatus: 'ACTIVE',
        joinedAt: NOW,
        preferredLocale: 'EN',
        gender: null,
        dateOfBirth: null,
        medicalNotes: null,
        emergencyContact: null,
        assignedTrainerId: null,
        raw: {},
      };

      mockPrisma.member.findFirst.mockResolvedValue(null);
      mockPrisma.member.create.mockResolvedValue(createdMember);

      const req = createReq({
        method: 'POST',
        body: {
          fullName: 'Ahmed Al Mansoori',
          phone: '+971501234567',
          email: 'ahmed@example.com',
          membershipStatus: 'ACTIVE',
        },
      });

      const res = await handlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(201);
      expect(body).toMatchObject({ fullName: 'Ahmed Al Mansoori', phone: '+971501234567' });
      expect(mockPrisma.member.create).toHaveBeenCalledTimes(1);
    });

    it('creates a minimal member with only fullName (all defaults applied)', async () => {
      mockPrisma.member.findFirst.mockResolvedValue(null);
      mockPrisma.member.create.mockResolvedValue({
        id: 'mem-min',
        fullName: 'John Doe',
        phone: null,
        email: null,
        membershipStatus: 'ACTIVE',
        preferredLocale: 'EN',
        gender: null,
        dateOfBirth: null,
        medicalNotes: null,
        emergencyContact: null,
        assignedTrainerId: null,
      });

      const req = createReq({
        method: 'POST',
        body: { fullName: 'John Doe' },
      });
      const res = await handlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(201);
      expect(body).toMatchObject({
        fullName: 'John Doe',
        membershipStatus: 'ACTIVE',
        preferredLocale: 'EN',
      });
    });

    it('creates a member without phone (no duplicate check needed)', async () => {
      mockPrisma.member.create.mockResolvedValue({
        id: 'mem-2',
        fullName: 'Sara No Phone',
        phone: null,
        email: 'sara@example.com',
        membershipStatus: 'ACTIVE',
      });

      const req = createReq({
        method: 'POST',
        body: { fullName: 'Sara No Phone', membershipStatus: 'ACTIVE' },
      });

      const res = await handlers.POST(req as any);
      expect(res.status).toBe(201);
    });

    /* ─── Success: Phone normalization ─────────────────────────── */

    it('normalizes phone with spaces, dashes, and parentheses', async () => {
      mockPrisma.member.findFirst.mockResolvedValue(null);
      mockPrisma.member.create.mockResolvedValue({
        id: 'mem-phone', fullName: 'Test', phone: '+971501234567',
      });

      const req = createReq({
        method: 'POST',
        body: {
          fullName: 'Test User',
          phone: '+971 50-123 (4567)',
          membershipStatus: 'ACTIVE',
        },
      });
      const res = await handlers.POST(req as any);

      expect(res.status).toBe(201);
      expect(mockPrisma.member.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ phone: '+971501234567' }),
        }),
      );
    });

    /* ─── Success: Date handling (CRITICAL — was broken) ───────── */

    it('accepts joinedAt as date-only string YYYY-MM-DD (from CalendarPopover)', async () => {
      mockPrisma.member.findFirst.mockResolvedValue(null);
      mockPrisma.member.create.mockResolvedValue({
        id: 'mem-date', fullName: 'Date Test', joinedAt: new Date('2025-06-09'),
      });

      const req = createReq({
        method: 'POST',
        body: {
          fullName: 'Date Test',
          joinedAt: '2025-06-09', // date-only: what CalendarPopover sends
        },
      });
      const res = await handlers.POST(req as any);

      expect(res.status).toBe(201);
      expect(mockPrisma.member.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ joinedAt: expect.any(Date) }),
        }),
      );
    });

    it('accepts joinedAt as ISO datetime string', async () => {
      mockPrisma.member.findFirst.mockResolvedValue(null);
      mockPrisma.member.create.mockResolvedValue({
        id: 'mem-iso', fullName: 'Iso Test', joinedAt: new Date('2025-06-09T00:00:00.000Z'),
      });

      const req = createReq({
        method: 'POST',
        body: {
          fullName: 'Iso Test',
          joinedAt: '2025-06-09T00:00:00.000Z',
        },
      });
      const res = await handlers.POST(req as any);

      expect(res.status).toBe(201);
    });

    it('accepts dateOfBirth as date-only string (from CalendarPopover)', async () => {
      mockPrisma.member.findFirst.mockResolvedValue(null);
      mockPrisma.member.create.mockResolvedValue({
        id: 'mem-dob', fullName: 'DOB Test', dateOfBirth: new Date('1995-06-20'),
      });

      const req = createReq({
        method: 'POST',
        body: {
          fullName: 'DOB Test',
          dateOfBirth: '1995-06-20', // date-only
        },
      });
      const res = await handlers.POST(req as any);

      expect(res.status).toBe(201);
      expect(mockPrisma.member.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ dateOfBirth: expect.any(Date) }),
        }),
      );
    });

    it('accepts dateOfBirth as null', async () => {
      mockPrisma.member.findFirst.mockResolvedValue(null);
      mockPrisma.member.create.mockResolvedValue({
        id: 'mem-null-dob', fullName: 'Null DOB', dateOfBirth: null,
      });

      const req = createReq({
        method: 'POST',
        body: { fullName: 'Null DOB', dateOfBirth: null },
      });
      const res = await handlers.POST(req as any);

      expect(res.status).toBe(201);
    });

    it('defaults joinedAt to now when not provided', async () => {
      mockPrisma.member.findFirst.mockResolvedValue(null);
      mockPrisma.member.create.mockResolvedValue({ id: 'mem-now', fullName: 'Now Test' });

      const req = createReq({
        method: 'POST',
        body: { fullName: 'Now Test' },
      });
      await handlers.POST(req as any);

      expect(mockPrisma.member.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ joinedAt: expect.any(Date) }),
        }),
      );
    });

    /* ─── Success: All membership statuses ─────────────────────── */

    it.each([
      'ACTIVE', 'EXPIRED', 'PAUSED', 'FROZEN', 'CANCELLED', 'PENDING', 'PENDING_PAYMENT',
    ])('creates member with membershipStatus: %s', async (status) => {
      mockPrisma.member.findFirst.mockResolvedValue(null);
      mockPrisma.member.create.mockResolvedValue({
        id: `mem-${status.toLowerCase()}`,
        fullName: 'Status Test',
        membershipStatus: status,
      });

      const req = createReq({
        method: 'POST',
        body: { fullName: 'Status Test', membershipStatus: status },
      });
      const res = await handlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(201);
      expect(body.membershipStatus).toBe(status);
    });

    /* ─── Success: All gender values (including UNSPECIFIED) ───── */

    it.each(['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED'])(
      'creates member with gender: %s',
      async (gender) => {
        mockPrisma.member.findFirst.mockResolvedValue(null);
        mockPrisma.member.create.mockResolvedValue({
          id: `mem-${gender.toLowerCase()}`,
          fullName: 'Gender Test',
          gender,
        });

        const req = createReq({
          method: 'POST',
          body: { fullName: 'Gender Test', gender },
        });
        const res = await handlers.POST(req as any);
        const body = await jsonBody(res);

        expect(res.status).toBe(201);
        expect(body.gender).toBe(gender);
      },
    );

    it('creates member with gender null', async () => {
      mockPrisma.member.findFirst.mockResolvedValue(null);
      mockPrisma.member.create.mockResolvedValue({
        id: 'mem-null-gender', fullName: 'Null Gender', gender: null,
      });

      const req = createReq({
        method: 'POST',
        body: { fullName: 'Null Gender', gender: null },
      });
      const res = await handlers.POST(req as any);

      expect(res.status).toBe(201);
    });

    /* ─── Success: Locale ──────────────────────────────────────── */

    it.each(['EN', 'AR'])('creates member with preferredLocale: %s', async (locale) => {
      mockPrisma.member.findFirst.mockResolvedValue(null);
      mockPrisma.member.create.mockResolvedValue({
        id: `mem-${locale.toLowerCase()}`,
        fullName: 'Locale Test',
        preferredLocale: locale,
      });

      const req = createReq({
        method: 'POST',
        body: { fullName: 'Locale Test', preferredLocale: locale },
      });
      const res = await handlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(201);
      expect(body.preferredLocale).toBe(locale);
    });

    /* ─── Success: Emergency contact ───────────────────────────── */

    it('creates member with emergency contact', async () => {
      mockPrisma.member.findFirst.mockResolvedValue(null);
      mockPrisma.member.create.mockResolvedValue({
        id: 'mem-emerg',
        fullName: 'Emergency Test',
        emergencyContact: { name: 'Ali', phone: '+971509998877' },
      });

      const req = createReq({
        method: 'POST',
        body: {
          fullName: 'Emergency Test',
          emergencyContact: { name: 'Ali', phone: '+971509998877' },
        },
      });
      const res = await handlers.POST(req as any);

      expect(res.status).toBe(201);
      expect(mockPrisma.member.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            emergencyContact: { name: 'Ali', phone: '+971509998877' },
          }),
        }),
      );
    });

    /* ─── Success: Assigned trainer ────────────────────────────── */

    it('creates member with assigned trainer', async () => {
      mockPrisma.member.findFirst.mockResolvedValue(null);
      mockPrisma.member.create.mockResolvedValue({
        id: 'mem-trainer',
        fullName: 'Trainer Test',
        assignedTrainerId: 'trainer-uuid',
      });

      const req = createReq({
        method: 'POST',
        body: { fullName: 'Trainer Test', assignedTrainerId: 'trainer-uuid' },
      });
      const res = await handlers.POST(req as any);

      expect(res.status).toBe(201);
    });

    /* ─── Success: Medical notes ───────────────────────────────── */

    it('creates member with medical notes at character limit (1000)', async () => {
      mockPrisma.member.findFirst.mockResolvedValue(null);
      const notes = 'A'.repeat(1000);
      mockPrisma.member.create.mockResolvedValue({
        id: 'mem-med', fullName: 'Medical Test', medicalNotes: notes,
      });

      const req = createReq({
        method: 'POST',
        body: { fullName: 'Medical Test', medicalNotes: notes },
      });
      const res = await handlers.POST(req as any);

      expect(res.status).toBe(201);
    });

    /* ─── Success: Full payload ────────────────────────────────── */

    it('creates member with all fields populated', async () => {
      mockPrisma.member.findFirst.mockResolvedValue(null);
      const fullMember = {
        id: 'mem-full',
        fullName: 'Full Person',
        phone: '+971501234567',
        email: 'full@example.com',
        membershipStatus: 'PENDING',
        joinedAt: new Date('2025-06-09'),
        preferredLocale: 'AR',
        gender: 'MALE',
        dateOfBirth: new Date('1990-01-15'),
        medicalNotes: 'No allergies',
        emergencyContact: { name: 'Wife', phone: '+971509998877' },
        assignedTrainerId: 'trainer-1',
      };
      mockPrisma.member.create.mockResolvedValue(fullMember);

      const req = createReq({
        method: 'POST',
        body: {
          fullName: 'Full Person',
          phone: '+971 50 123 4567',
          email: 'full@example.com',
          membershipStatus: 'PENDING',
          joinedAt: '2025-06-09',
          preferredLocale: 'AR',
          gender: 'MALE',
          dateOfBirth: '1990-01-15',
          medicalNotes: 'No allergies',
          emergencyContact: { name: 'Wife', phone: '+971 50 999 8877' },
          assignedTrainerId: 'trainer-1',
        },
      });
      const res = await handlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(201);
      expect(body.fullName).toBe('Full Person');
      expect(body.gender).toBe('MALE');
    });

    /* ─── Success: Unicode and special characters ──────────────── */

    it('creates member with unicode/arabic fullName', async () => {
      mockPrisma.member.findFirst.mockResolvedValue(null);
      mockPrisma.member.create.mockResolvedValue({
        id: 'mem-arabic', fullName: 'أحمد المنصوري',
      });

      const req = createReq({
        method: 'POST',
        body: { fullName: 'أحمد المنصوري' },
      });
      const res = await handlers.POST(req as any);

      expect(res.status).toBe(201);
    });

    it('creates member with email containing +alias', async () => {
      mockPrisma.member.findFirst.mockResolvedValue(null);
      mockPrisma.member.create.mockResolvedValue({
        id: 'mem-alias', fullName: 'Alias Test', email: 'test+alias@example.com',
      });

      const req = createReq({
        method: 'POST',
        body: { fullName: 'Alias Test', email: 'test+alias@example.com' },
      });
      const res = await handlers.POST(req as any);

      expect(res.status).toBe(201);
    });

    /* ─── Success: Date edge cases ─────────────────────────────── */

    it('creates member with dateOfBirth at year 1900 boundary', async () => {
      mockPrisma.member.findFirst.mockResolvedValue(null);
      mockPrisma.member.create.mockResolvedValue({
        id: 'mem-old', fullName: 'Old DOB', dateOfBirth: new Date('1900-01-01'),
      });

      const req = createReq({
        method: 'POST',
        body: { fullName: 'Old DOB', dateOfBirth: '1900-01-01' },
      });
      const res = await handlers.POST(req as any);

      expect(res.status).toBe(201);
    });

    it('creates member with joinedAt on Feb 29 leap year', async () => {
      mockPrisma.member.findFirst.mockResolvedValue(null);
      mockPrisma.member.create.mockResolvedValue({
        id: 'mem-leap', fullName: 'Leap Year', joinedAt: new Date('2024-02-29'),
      });

      const req = createReq({
        method: 'POST',
        body: { fullName: 'Leap Year', joinedAt: '2024-02-29' },
      });
      const res = await handlers.POST(req as any);

      expect(res.status).toBe(201);
    });

    /* ─── Success: Extra properties stripped ───────────────────── */

    it('ignores extra unknown properties in payload', async () => {
      mockPrisma.member.findFirst.mockResolvedValue(null);
      mockPrisma.member.create.mockResolvedValue({
        id: 'mem-extra', fullName: 'Extra Test',
      });

      const req = createReq({
        method: 'POST',
        body: {
          fullName: 'Extra Test',
          unknownField: 'should be ignored',
          anotherField: 123,
        },
      });
      const res = await handlers.POST(req as any);

      expect(res.status).toBe(201);
      // Verify create was called without the extra fields
      expect(mockPrisma.member.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ unknownField: expect.anything() }),
        }),
      );
    });

    /* ─── Duplicate phone ──────────────────────────────────────── */

    it('returns 409 when a member with the same phone already exists', async () => {
      mockPrisma.member.findFirst.mockResolvedValue({ id: 'existing-id' });

      const req = createReq({
        method: 'POST',
        body: { fullName: 'Duplicate', phone: '+971501234567', membershipStatus: 'ACTIVE' },
      });

      const res = await handlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(409);
      expect(body).toMatchObject({ message: 'A member with this phone number already exists' });
    });

    /* ─── Validation: fullName ─────────────────────────────────── */

    it('returns 400 when fullName is empty', async () => {
      const req = createReq({
        method: 'POST',
        body: { fullName: '' },
      });
      const res = await handlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(400);
      expect(body.message).toBeTruthy();
      // Should have field-level errors
      expect(body.fieldErrors).toBeDefined();
    });

    it('returns 400 when fullName is whitespace only', async () => {
      const req = createReq({
        method: 'POST',
        body: { fullName: '   ' },
      });
      const res = await handlers.POST(req as any);

      expect(res.status).toBe(400);
    });

    it('returns 400 when fullName exceeds 200 characters', async () => {
      const req = createReq({
        method: 'POST',
        body: { fullName: 'A'.repeat(201) },
      });
      const res = await handlers.POST(req as any);

      expect(res.status).toBe(400);
    });

    /* ─── Validation: phone ────────────────────────────────────── */

    it('returns 400 when phone format is invalid (no + prefix)', async () => {
      mockPrisma.member.findFirst.mockResolvedValue(null);

      const req = createReq({
        method: 'POST',
        body: { fullName: 'Bad Phone', phone: '0501234567' },
      });
      const res = await handlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(400);
      expect(body.message).toMatch(/phone/i);
      expect(body.fieldErrors).toBeDefined();
    });

    it('returns 400 when phone is empty string (sent as null is fine, empty string blocked)', async () => {
      mockPrisma.member.findFirst.mockResolvedValue(null);

      // Empty string is NOT the same as null. The frontend sends null,
      // but if someone sends '' it should be rejected by the phone regex.
      const req = createReq({
        method: 'POST',
        body: { fullName: 'Empty Phone', phone: '' },
      });
      const res = await handlers.POST(req as any);

      // Empty string is caught by phoneSchema as invalid
      expect(res.status).toBe(400);
    });

    /* ─── Validation: email ────────────────────────────────────── */

    it('returns 400 when email is invalid', async () => {
      const req = createReq({
        method: 'POST',
        body: { fullName: 'Bad Email', email: 'not-an-email' },
      });
      const res = await handlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(400);
      expect(body.message).toMatch(/email/i);
    });

    /* ─── Validation: membershipStatus ─────────────────────────── */

    it('returns 400 when membershipStatus is invalid', async () => {
      const req = createReq({
        method: 'POST',
        body: { fullName: 'Bad Status', membershipStatus: 'INVALID_STATUS' },
      });
      const res = await handlers.POST(req as any);

      expect(res.status).toBe(400);
    });

    /* ─── Validation: gender ───────────────────────────────────── */

    it('returns 400 when gender is invalid', async () => {
      const req = createReq({
        method: 'POST',
        body: { fullName: 'Bad Gender', gender: 'NONBINARY' },
      });
      const res = await handlers.POST(req as any);

      expect(res.status).toBe(400);
    });

    /* ─── Validation: preferredLocale ──────────────────────────── */

    it('returns 400 when preferredLocale is invalid', async () => {
      const req = createReq({
        method: 'POST',
        body: { fullName: 'Bad Locale', preferredLocale: 'FR' },
      });
      const res = await handlers.POST(req as any);

      expect(res.status).toBe(400);
    });

    /* ─── Validation: dates ────────────────────────────────────── */

    it('returns 400 when joinedAt is not a valid date', async () => {
      const req = createReq({
        method: 'POST',
        body: { fullName: 'Bad Date', joinedAt: 'not-a-date-at-all' },
      });
      const res = await handlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(400);
      expect(body.message).toMatch(/date/i);
    });

    it('returns 400 when dateOfBirth is not a valid date', async () => {
      const req = createReq({
        method: 'POST',
        body: { fullName: 'Bad DOB', dateOfBirth: 'garbage' },
      });
      const res = await handlers.POST(req as any);

      expect(res.status).toBe(400);
    });

    /* ─── Validation: medicalNotes too long ────────────────────── */

    it('returns 400 when medicalNotes exceeds 1000 characters', async () => {
      const req = createReq({
        method: 'POST',
        body: { fullName: 'Long Notes', medicalNotes: 'A'.repeat(1001) },
      });
      const res = await handlers.POST(req as any);

      expect(res.status).toBe(400);
    });

    /* ─── Validation: field-level errors structure ─────────────── */

    it('returns fieldErrors object with per-field messages on validation failure', async () => {
      const req = createReq({
        method: 'POST',
        body: {
          fullName: '',
          phone: 'bad-phone',
          email: 'bad-email',
          gender: 'INVALID',
        },
      });
      const res = await handlers.POST(req as any);
      const body = await jsonBody(res);

      expect(res.status).toBe(400);
      expect(body.fieldErrors).toBeDefined();
      expect(typeof body.fieldErrors).toBe('object');
      // Each field with an error should have an entry
      expect(body.fieldErrors.fullName || body.fieldErrors.form).toBeTruthy();
    });
  });

  /* ─────────────────────────────────────────────────────────────── */
  /* READ / LIST Members                                             */
  /* ─────────────────────────────────────────────────────────────── */
  describe('GET /api/members — List', () => {
    it('returns paginated member list with active plan names', async () => {
      const members = [
        { id: 'm1', fullName: 'Alice', email: 'alice@test.com', phone: '+971500000001', membershipStatus: 'ACTIVE', provider: 'NATIVE', lastCheckinAt: NOW, joinedAt: NOW },
        { id: 'm2', fullName: 'Bob', email: 'bob@test.com', phone: '+971500000002', membershipStatus: 'ACTIVE', provider: 'NATIVE', lastCheckinAt: null, joinedAt: NOW },
      ];

      mockPrisma.member.findMany.mockResolvedValue(members);
      mockPrisma.member.count.mockResolvedValue(2);
      mockPrisma.membership.findMany.mockResolvedValue([
        { memberId: 'm1', plan: { nameEn: 'Gold Plan' } },
      ]);

      const req = createReq({ searchParams: { page: '1', pageSize: '25' } });
      const res = await handlers.GET(req as any);
      const body = (await jsonBody(res)) as any;

      expect(res.status).toBe(200);
      expect(body.items).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.items[0].activePlanNames).toEqual(['Gold Plan']);
      expect(body.items[1].activePlanNames).toEqual([]);
    });

    it('filters by status when status param is provided', async () => {
      mockPrisma.member.findMany.mockResolvedValue([]);
      mockPrisma.member.count.mockResolvedValue(0);
      mockPrisma.membership.findMany.mockResolvedValue([]);

      const req = createReq({ searchParams: { status: 'FROZEN' } });
      await handlers.GET(req as any);

      const whereArg = mockPrisma.member.findMany.mock.calls[0][0].where;
      expect(whereArg.membershipStatus).toBe('FROZEN');
    });

    it('filters by search term across name, email, and phone', async () => {
      mockPrisma.member.findMany.mockResolvedValue([]);
      mockPrisma.member.count.mockResolvedValue(0);
      mockPrisma.membership.findMany.mockResolvedValue([]);

      const req = createReq({ searchParams: { search: 'ahmed' } });
      await handlers.GET(req as any);

      const whereArg = mockPrisma.member.findMany.mock.calls[0][0].where;
      expect(whereArg.OR).toBeDefined();
    });
  });

  /* ─────────────────────────────────────────────────────────────── */
  /* GET single member                                               */
  /* ─────────────────────────────────────────────────────────────── */
  describe('GET /api/members/[id] — Read single', () => {
    it('returns member detail with active plan names', async () => {
      const member = {
        id: 'm1', fullName: 'Alice', email: 'alice@test.com', phone: '+971500000001',
        membershipStatus: 'ACTIVE', membershipExpiresAt: null, provider: 'NATIVE',
        lastCheckinAt: NOW, joinedAt: NOW, externalId: 'ext-1', preferredLocale: 'EN',
        medicalNotes: null, dateOfBirth: null, gender: null, source: 'MANUAL',
        emergencyContact: null, assignedTrainerId: null,
      };

      mockPrisma.member.findFirst.mockResolvedValue(member);
      mockPrisma.membership.findMany.mockResolvedValue([
        { plan: { nameEn: 'Gold Plan' } },
        { plan: { nameEn: 'Silver Plan' } },
      ]);

      const req = createReq();
      const res = await idHandlers.GET(req as any, { params: Promise.resolve({ id: 'm1' }) });
      const body = (await jsonBody(res)) as any;

      expect(res.status).toBe(200);
      expect(body.fullName).toBe('Alice');
      expect(body.activePlanNames).toEqual(['Gold Plan', 'Silver Plan']);
    });

    it('returns 404 when member not found', async () => {
      mockPrisma.member.findFirst.mockResolvedValue(null);

      const req = createReq();
      const res = await idHandlers.GET(req as any, { params: Promise.resolve({ id: 'not-exists' }) });
      const body = await jsonBody(res);

      expect(res.status).toBe(404);
      expect(body).toMatchObject({ message: 'Member not found' });
    });
  });

  /* ─────────────────────────────────────────────────────────────── */
  /* UPDATE Member                                                   */
  /* ─────────────────────────────────────────────────────────────── */
  describe('PATCH /api/members/[id] — Update', () => {
    it('updates member fields and returns updated member', async () => {
      const existing = { id: 'm1', tenantId: MOCK_USER.tenantId, phone: '+971500000001' };
      const updated = { ...existing, fullName: 'Alice Updated', email: 'new@test.com', phone: '+971500000002' };

      mockPrisma.member.findFirst.mockResolvedValue(existing);
      mockPrisma.member.update.mockResolvedValue(updated);

      const req = createReq({
        method: 'PATCH',
        body: { fullName: 'Alice Updated', email: 'new@test.com' },
      });
      const res = await idHandlers.PATCH(req as any, { params: Promise.resolve({ id: 'm1' }) });
      const body = await jsonBody(res);

      expect(res.status).toBe(200);
      expect(body).toMatchObject({ fullName: 'Alice Updated', email: 'new@test.com' });
    });

    it('accepts dateOfBirth as date-only string in update', async () => {
      const existing = { id: 'm1', tenantId: MOCK_USER.tenantId, phone: null };
      mockPrisma.member.findFirst.mockResolvedValue(existing);
      mockPrisma.member.update.mockResolvedValue({
        ...existing, fullName: 'Updated', dateOfBirth: new Date('1995-06-20'),
      });

      const req = createReq({
        method: 'PATCH',
        body: { dateOfBirth: '1995-06-20' },
      });
      const res = await idHandlers.PATCH(req as any, { params: Promise.resolve({ id: 'm1' }) });

      expect(res.status).toBe(200);
    });

    it('accepts membershipExpiresAt as date-only string in update', async () => {
      const existing = { id: 'm1', tenantId: MOCK_USER.tenantId, phone: null };
      mockPrisma.member.findFirst.mockResolvedValue(existing);
      mockPrisma.member.update.mockResolvedValue({
        ...existing, membershipExpiresAt: new Date('2026-12-31'),
      });

      const req = createReq({
        method: 'PATCH',
        body: { membershipExpiresAt: '2026-12-31' },
      });
      const res = await idHandlers.PATCH(req as any, { params: Promise.resolve({ id: 'm1' }) });

      expect(res.status).toBe(200);
    });

    it('accepts null membershipExpiresAt to clear it', async () => {
      const existing = { id: 'm1', tenantId: MOCK_USER.tenantId, phone: null, membershipExpiresAt: new Date() };
      mockPrisma.member.findFirst.mockResolvedValue(existing);
      mockPrisma.member.update.mockResolvedValue({
        ...existing, membershipExpiresAt: null,
      });

      const req = createReq({
        method: 'PATCH',
        body: { membershipExpiresAt: null },
      });
      const res = await idHandlers.PATCH(req as any, { params: Promise.resolve({ id: 'm1' }) });

      expect(res.status).toBe(200);
    });

    it('returns 404 when updating non-existent member', async () => {
      mockPrisma.member.findFirst.mockResolvedValue(null);

      const req = createReq({ method: 'PATCH', body: { fullName: 'Ghost' } });
      const res = await idHandlers.PATCH(req as any, { params: Promise.resolve({ id: 'not-exists' }) });
      const body = await jsonBody(res);

      expect(res.status).toBe(404);
      expect(body).toMatchObject({ message: 'Member not found' });
    });

    it('returns 409 when updating phone to one already in use', async () => {
      mockPrisma.member.findFirst
        .mockResolvedValueOnce({ id: 'm1', tenantId: MOCK_USER.tenantId, phone: 'old' })
        .mockResolvedValueOnce({ id: 'm2' });

      const req = createReq({ method: 'PATCH', body: { phone: '+971501234567' } });
      const res = await idHandlers.PATCH(req as any, { params: Promise.resolve({ id: 'm1' }) });
      const body = await jsonBody(res);

      expect(res.status).toBe(409);
      expect(body).toMatchObject({ message: 'A member with this phone number already exists' });
    });

    it('returns fieldErrors on invalid update payload', async () => {
      const existing = { id: 'm1', tenantId: MOCK_USER.tenantId, phone: null };
      mockPrisma.member.findFirst.mockResolvedValue(existing);

      const req = createReq({
        method: 'PATCH',
        body: { email: 'bad-email', phone: 'bad-phone' },
      });
      const res = await idHandlers.PATCH(req as any, { params: Promise.resolve({ id: 'm1' }) });
      const body = await jsonBody(res);

      expect(res.status).toBe(400);
      expect(body.fieldErrors).toBeDefined();
    });
  });

  /* ─────────────────────────────────────────────────────────────── */
  /* DEACTIVATE Member                                               */
  /* ─────────────────────────────────────────────────────────────── */
  describe('POST/PATCH /api/members/[id]/deactivate — Deactivate', () => {
    it('deactivates an active member via POST', async () => {
      mockPrisma.member.findFirst.mockResolvedValue({
        id: 'm1', tenantId: MOCK_USER.tenantId, membershipStatus: 'ACTIVE',
      });
      mockPrisma.member.update.mockResolvedValue({
        id: 'm1', membershipStatus: 'CANCELLED',
      });

      const req = createReq({ method: 'POST' });
      const res = await deactivateHandlers.POST(req as any, { params: Promise.resolve({ id: 'm1' }) });

      expect(res.status).toBe(200);
      expect(mockPrisma.member.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'm1' },
          data: expect.objectContaining({ membershipStatus: 'CANCELLED' }),
        }),
      );
    });

    it('deactivates an active member via PATCH (what the frontend sends)', async () => {
      mockPrisma.member.findFirst.mockResolvedValue({
        id: 'm1', tenantId: MOCK_USER.tenantId, membershipStatus: 'ACTIVE',
      });
      mockPrisma.member.update.mockResolvedValue({
        id: 'm1', membershipStatus: 'CANCELLED',
      });

      const req = createReq({ method: 'PATCH' });
      const res = await deactivateHandlers.PATCH(req as any, { params: Promise.resolve({ id: 'm1' }) });

      expect(res.status).toBe(200);
    });

    it('returns 404 when member not found', async () => {
      mockPrisma.member.findFirst.mockResolvedValue(null);

      const req = createReq({ method: 'POST' });
      const res = await deactivateHandlers.POST(req as any, { params: Promise.resolve({ id: 'ghost' }) });
      const body = await jsonBody(res);

      expect(res.status).toBe(404);
      expect(body).toMatchObject({ message: 'Member not found' });
    });
  });
});
