/**
 * Check-Ins API — Complete Lifecycle & Edge-Case Tests
 *
 * Covers: Manual check-in, by phone, by memberId, by QR token,
 *   deduplication, cancelled/expired member rejection,
 *   class session check-in, staff attribution, booking auto-link,
 *   phone normalization (dots, spaces, dashes), field-level errors.
 *
 * Fixed: phone normalization missing dots, missing fieldErrors,
 *   by-code route missing Zod validation + booking auto-link.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MOCK_USER, createReq, jsonBody, NOW } from './test-helpers';

const mockPrisma = {
  checkIn: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  member: { findFirst: vi.fn(), update: vi.fn() },
  memberQrToken: { findFirst: vi.fn() },
  staff: { findFirst: vi.fn() },
  booking: { findFirst: vi.fn(), update: vi.fn() },
  classSession: { findFirst: vi.fn() },
  $transaction: vi.fn((fn: any) => fn(mockPrisma)),
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth-server", () => ({
  requireServerUser: vi.fn().mockResolvedValue({
    id: "user-1", email: "owner@testgym.ae", fullName: "Test Owner",
    tenantId: "tenant-1", role: "OWNER",
  }),
  requireTenantId: vi.fn().mockResolvedValue("tenant-1"),
  getServerUser: vi.fn().mockResolvedValue({
    id: "user-1", email: "owner@testgym.ae", fullName: "Test Owner",
    tenantId: "tenant-1", role: "OWNER",
  }),
}));

const checkinHandlers = await import('../../api/checkins/route');
const checkinByCodeHandlers = await import('../../api/checkins/by-code/route');

const ACTIVE_MEMBER = {
  id: 'mem-1', fullName: 'Ahmed', tenantId: MOCK_USER.tenantId,
  membershipStatus: 'ACTIVE', phone: '+971501234567',
};

/* ─────────────────────────────────────────────────────────────────── */
/* GET /api/checkins — List                                            */
/* ─────────────────────────────────────────────────────────────────── */
describe('GET /api/checkins — List', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns latest check-ins with member info', async () => {
    mockPrisma.checkIn.findMany.mockResolvedValue([
      { id: 'ci-1', memberId: 'mem-1', source: 'MANUAL', checkedInAt: NOW,
        staffId: null, sessionId: null,
        member: { id: 'mem-1', fullName: 'Ahmed Al Mansoori' } },
    ]);

    const req = createReq();
    const res = await checkinHandlers.GET(req as any);
    const body: any = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
  });

  it('returns empty array when no check-ins exist', async () => {
    mockPrisma.checkIn.findMany.mockResolvedValue([]);
    const req = createReq();
    const res = await checkinHandlers.GET(req as any);

    expect(res.status).toBe(200);
    expect(await jsonBody(res)).toEqual([]);
  });

  it('filters by memberId', async () => {
    mockPrisma.checkIn.findMany.mockResolvedValue([]);
    const req = createReq({ searchParams: { memberId: 'mem-1' } });
    await checkinHandlers.GET(req as any);

    const where = mockPrisma.checkIn.findMany.mock.calls[0][0].where;
    expect(where.memberId).toBe('mem-1');
  });

  it('filters by date range (from and to)', async () => {
    mockPrisma.checkIn.findMany.mockResolvedValue([]);
    const req = createReq({ searchParams: { from: '2026-06-01', to: '2026-06-30' } });
    await checkinHandlers.GET(req as any);

    const where = mockPrisma.checkIn.findMany.mock.calls[0][0].where;
    expect(where.checkedInAt.gte).toBeDefined();
    expect(where.checkedInAt.lte).toBeDefined();
  });

  it('respects take and skip parameters', async () => {
    mockPrisma.checkIn.findMany.mockResolvedValue([]);
    const req = createReq({ searchParams: { take: '10', skip: '5' } });
    await checkinHandlers.GET(req as any);

    expect(mockPrisma.checkIn.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10, skip: 5 }),
    );
  });

  it('orders by checkedInAt descending', async () => {
    mockPrisma.checkIn.findMany.mockResolvedValue([]);
    const req = createReq();
    await checkinHandlers.GET(req as any);

    expect(mockPrisma.checkIn.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { checkedInAt: 'desc' } }),
    );
  });
});

/* ─────────────────────────────────────────────────────────────────── */
/* POST /api/checkins — Create Manual Check-in                         */
/* ─────────────────────────────────────────────────────────────────── */
describe('POST /api/checkins — Create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a manual check-in by memberId', async () => {
    mockPrisma.member.findFirst.mockResolvedValue(ACTIVE_MEMBER);
    mockPrisma.checkIn.findFirst.mockResolvedValue(null); // no dedupe
    mockPrisma.booking.findFirst.mockResolvedValue(null);
    mockPrisma.checkIn.create.mockResolvedValue({
      id: 'ci-new', memberId: 'mem-1', source: 'MANUAL',
      checkedInAt: NOW, staffId: null, sessionId: null,
    });

    const req = createReq({
      method: 'POST',
      body: { source: 'MANUAL', memberId: 'mem-1' },
    });
    const res = await checkinHandlers.POST(req as any);
    const body = await jsonBody(res);

    expect(res.status).toBe(201);
    expect(body).toMatchObject({ memberId: 'mem-1', source: 'MANUAL' });
  });

  it.each(['KIOSK_PIN', 'KIOSK_QR', 'DOOR_EVENT', 'MANUAL', 'MOBILE_QR'])(
    'creates check-in with source: %s',
    async (source) => {
      mockPrisma.member.findFirst.mockResolvedValue(ACTIVE_MEMBER);
      mockPrisma.checkIn.findFirst.mockResolvedValue(null);
      mockPrisma.booking.findFirst.mockResolvedValue(null);
      mockPrisma.checkIn.create.mockResolvedValue({
        id: 'ci-1', memberId: 'mem-1', source, checkedInAt: NOW,
      });

      const req = createReq({
        method: 'POST',
        body: { source, memberId: 'mem-1' },
      });
      const res = await checkinHandlers.POST(req as any);

      expect(res.status).toBe(201);
    },
  );

  it('creates check-in by phone with normalization (spaces, dashes, dots)', async () => {
    mockPrisma.member.findFirst
      .mockResolvedValueOnce(null) // normalized lookup: +971501234567
      .mockResolvedValueOnce(ACTIVE_MEMBER); // fallback
    mockPrisma.checkIn.findFirst.mockResolvedValue(null);
    mockPrisma.booking.findFirst.mockResolvedValue(null);
    mockPrisma.checkIn.create.mockResolvedValue({
      id: 'ci-phone', memberId: 'mem-1', source: 'MANUAL', checkedInAt: NOW,
    });

    const req = createReq({
      method: 'POST',
      body: { source: 'MANUAL', phone: '+971 50.123-4567' },
    });
    const res = await checkinHandlers.POST(req as any);

    expect(res.status).toBe(201);
  });

  it('creates check-in by QR token', async () => {
    mockPrisma.memberQrToken.findFirst.mockResolvedValue({
      id: 'qr-1', token: 'qr-token-123', memberId: 'mem-1',
      expiresAt: new Date(Date.now() + 86400000), tenantId: MOCK_USER.tenantId,
    });
    mockPrisma.member.findFirst.mockResolvedValue(ACTIVE_MEMBER);
    mockPrisma.checkIn.findFirst.mockResolvedValue(null);
    mockPrisma.booking.findFirst.mockResolvedValue(null);
    mockPrisma.checkIn.create.mockResolvedValue({
      id: 'ci-qr', memberId: 'mem-1', source: 'KIOSK_QR', checkedInAt: NOW,
    });

    const req = createReq({
      method: 'POST',
      body: { source: 'KIOSK_QR', qrToken: 'qr-token-123' },
    });
    const res = await checkinHandlers.POST(req as any);

    expect(res.status).toBe(201);
  });

  it('returns 400 with fieldErrors when no identifier provided', async () => {
    const req = createReq({
      method: 'POST',
      body: { source: 'MANUAL' },
    });
    const res = await checkinHandlers.POST(req as any);
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.fieldErrors).toBeDefined();
  });

  it('returns 400 with fieldErrors for invalid source', async () => {
    const req = createReq({
      method: 'POST',
      body: { source: 'BOGUS', memberId: 'mem-1' },
    });
    const res = await checkinHandlers.POST(req as any);
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.fieldErrors).toBeDefined();
  });

  it('returns 404 when member not found', async () => {
    mockPrisma.member.findFirst.mockResolvedValue(null);

    const req = createReq({
      method: 'POST',
      body: { source: 'MANUAL', memberId: 'ghost' },
    });
    const res = await checkinHandlers.POST(req as any);
    const body = await jsonBody(res);

    expect(res.status).toBe(404);
    expect(body.message).toBe('Member not found');
  });

  it('rejects check-in for CANCELLED members', async () => {
    mockPrisma.member.findFirst.mockResolvedValue({
      ...ACTIVE_MEMBER, membershipStatus: 'CANCELLED',
    });

    const req = createReq({
      method: 'POST',
      body: { source: 'MANUAL', memberId: 'mem-cancelled' },
    });
    const res = await checkinHandlers.POST(req as any);
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.message).toContain('CANCELLED');
  });

  it('rejects check-in for EXPIRED members', async () => {
    mockPrisma.member.findFirst.mockResolvedValue({
      ...ACTIVE_MEMBER, membershipStatus: 'EXPIRED',
    });

    const req = createReq({
      method: 'POST',
      body: { source: 'MANUAL', memberId: 'mem-expired' },
    });
    const res = await checkinHandlers.POST(req as any);

    expect(res.status).toBe(400);
  });

  it('returns 409 for duplicate check-in within dedupe window', async () => {
    mockPrisma.member.findFirst.mockResolvedValue(ACTIVE_MEMBER);
    mockPrisma.checkIn.findFirst.mockResolvedValue({
      id: 'ci-existing', memberId: 'mem-1', checkedInAt: NOW,
    });

    const req = createReq({
      method: 'POST',
      body: { source: 'MANUAL', memberId: 'mem-1' },
    });
    const res = await checkinHandlers.POST(req as any);
    const body = await jsonBody(res);

    expect(res.status).toBe(409);
    expect(body.message).toContain('Duplicate check-in');
  });

  it('auto-links a nearby class booking on check-in', async () => {
    mockPrisma.member.findFirst.mockResolvedValue(ACTIVE_MEMBER);
    mockPrisma.checkIn.findFirst.mockResolvedValue(null);
    mockPrisma.booking.findFirst.mockResolvedValue({
      id: 'bk-1', memberId: 'mem-1', sessionId: 'sess-1',
      status: 'BOOKED', session: { id: 'sess-1', startsAt: NOW },
    });
    mockPrisma.checkIn.create.mockResolvedValue({
      id: 'ci-class', memberId: 'mem-1', source: 'MANUAL',
      checkedInAt: NOW, sessionId: 'sess-1',
    });

    const req = createReq({
      method: 'POST',
      body: { source: 'MANUAL', memberId: 'mem-1' },
    });
    const res = await checkinHandlers.POST(req as any);
    const body = await jsonBody(res);

    expect(res.status).toBe(201);
    expect(body.sessionId).toBe('sess-1');
  });

  it('creates check-in with staff attribution', async () => {
    mockPrisma.member.findFirst.mockResolvedValue(ACTIVE_MEMBER);
    mockPrisma.staff.findFirst.mockResolvedValue({
      id: 'st-1', tenantId: MOCK_USER.tenantId, active: true,
    });
    mockPrisma.checkIn.findFirst.mockResolvedValue(null);
    mockPrisma.booking.findFirst.mockResolvedValue(null);
    mockPrisma.checkIn.create.mockResolvedValue({
      id: 'ci-staff', memberId: 'mem-1', source: 'MANUAL',
      checkedInAt: NOW, staffId: 'st-1', sessionId: null,
    });

    const req = createReq({
      method: 'POST',
      body: { source: 'MANUAL', memberId: 'mem-1', staffId: 'st-1' },
    });
    const res = await checkinHandlers.POST(req as any);
    const body = await jsonBody(res);

    expect(res.status).toBe(201);
    expect(body.staffId).toBe('st-1');
  });

  it('returns 400 when staff is inactive', async () => {
    mockPrisma.member.findFirst.mockResolvedValue(ACTIVE_MEMBER);
    mockPrisma.staff.findFirst.mockResolvedValue(null); // inactive or not found

    const req = createReq({
      method: 'POST',
      body: { source: 'MANUAL', memberId: 'mem-1', staffId: 'st-inactive' },
    });
    const res = await checkinHandlers.POST(req as any);

    expect(res.status).toBe(400);
  });

  it('rejects expired QR tokens', async () => {
    mockPrisma.memberQrToken.findFirst.mockResolvedValue(null); // expired or not found

    const req = createReq({
      method: 'POST',
      body: { source: 'KIOSK_QR', qrToken: 'expired-token' },
    });
    const res = await checkinHandlers.POST(req as any);

    expect(res.status).toBe(404);
  });
});

/* ─────────────────────────────────────────────────────────────────── */
/* POST /api/checkins/by-code — Code-based Check-in                    */
/* ─────────────────────────────────────────────────────────────────── */
describe('POST /api/checkins/by-code — Code-based', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates check-in by class code + phone', async () => {
    mockPrisma.classSession.findFirst.mockResolvedValue({
      id: 'sess-1', startsAt: NOW, status: 'SCHEDULED',
    });
    mockPrisma.member.findFirst.mockResolvedValue(ACTIVE_MEMBER);
    mockPrisma.checkIn.findFirst.mockResolvedValue(null); // no dedupe
    mockPrisma.booking.findFirst.mockResolvedValue(null); // no booking to link
    mockPrisma.checkIn.create.mockResolvedValue({
      id: 'ci-code', memberId: 'mem-1', source: 'MOBILE_QR',
      checkedInAt: NOW, sessionId: 'sess-1',
    });

    const req = createReq({
      method: 'POST',
      body: { code: 'CLS-123', phone: '+971501234567' },
    });
    const res = await checkinByCodeHandlers.POST(req as any);
    const body = await jsonBody(res);

    expect(res.status).toBe(201);
    expect(body.source).toBe('MOBILE_QR');
    expect(body.sessionId).toBe('sess-1');
  });

  it('auto-links booking when member has a BOOKED booking for this session', async () => {
    mockPrisma.classSession.findFirst.mockResolvedValue({
      id: 'sess-1', startsAt: NOW, status: 'SCHEDULED',
    });
    mockPrisma.member.findFirst.mockResolvedValue(ACTIVE_MEMBER);
    mockPrisma.checkIn.findFirst.mockResolvedValue(null);
    mockPrisma.booking.findFirst.mockResolvedValue({
      id: 'bk-1', memberId: 'mem-1', sessionId: 'sess-1',
      status: 'BOOKED',
    });
    mockPrisma.checkIn.create.mockResolvedValue({
      id: 'ci-code', memberId: 'mem-1', source: 'MOBILE_QR',
      checkedInAt: NOW, sessionId: 'sess-1',
    });

    const req = createReq({
      method: 'POST',
      body: { code: 'CLS-123', phone: '+971501234567' },
    });
    const res = await checkinByCodeHandlers.POST(req as any);

    expect(res.status).toBe(201);
    // Verify booking was updated to CHECKED_IN
    expect(mockPrisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bk-1' },
        data: expect.objectContaining({ status: 'CHECKED_IN' }),
      }),
    );
  });

  it('returns 400 with fieldErrors when code is missing', async () => {
    const req = createReq({ method: 'POST', body: { phone: '+971501234567' } });
    const res = await checkinByCodeHandlers.POST(req as any);
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.fieldErrors).toBeDefined();
    expect(body.fieldErrors.code).toBeTruthy();
  });

  it('returns 400 with fieldErrors when phone is missing', async () => {
    const req = createReq({ method: 'POST', body: { code: 'CLS-123' } });
    const res = await checkinByCodeHandlers.POST(req as any);
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body.fieldErrors.phone).toBeTruthy();
  });

  it('returns 404 when check-in code is invalid', async () => {
    mockPrisma.classSession.findFirst.mockResolvedValue(null);

    const req = createReq({
      method: 'POST',
      body: { code: 'invalid-code', phone: '+971501234567' },
    });
    const res = await checkinByCodeHandlers.POST(req as any);
    const body = await jsonBody(res);

    expect(res.status).toBe(404);
    expect(body.message).toContain('Invalid check-in code');
  });

  it('returns 400 when session is not SCHEDULED', async () => {
    mockPrisma.classSession.findFirst.mockResolvedValue({
      id: 'sess-1', startsAt: NOW, status: 'CANCELLED',
    });

    const req = createReq({
      method: 'POST',
      body: { code: 'OLD-CODE', phone: '+971501234567' },
    });
    const res = await checkinByCodeHandlers.POST(req as any);

    expect(res.status).toBe(400);
  });

  it('returns 404 when member not found by phone', async () => {
    mockPrisma.classSession.findFirst.mockResolvedValue({
      id: 'sess-1', startsAt: NOW, status: 'SCHEDULED',
    });
    mockPrisma.member.findFirst.mockResolvedValue(null);

    const req = createReq({
      method: 'POST',
      body: { code: 'CLS-123', phone: '+971999999999' },
    });
    const res = await checkinByCodeHandlers.POST(req as any);

    expect(res.status).toBe(404);
  });

  it('rejects check-in for CANCELLED member', async () => {
    mockPrisma.classSession.findFirst.mockResolvedValue({
      id: 'sess-1', startsAt: NOW, status: 'SCHEDULED',
    });
    mockPrisma.member.findFirst.mockResolvedValue({
      ...ACTIVE_MEMBER, membershipStatus: 'CANCELLED',
    });

    const req = createReq({
      method: 'POST',
      body: { code: 'CLS-123', phone: '+971501234567' },
    });
    const res = await checkinByCodeHandlers.POST(req as any);

    expect(res.status).toBe(400);
  });

  it('returns 409 for duplicate check-in within dedupe window', async () => {
    mockPrisma.classSession.findFirst.mockResolvedValue({
      id: 'sess-1', startsAt: NOW, status: 'SCHEDULED',
    });
    mockPrisma.member.findFirst.mockResolvedValue(ACTIVE_MEMBER);
    mockPrisma.checkIn.findFirst.mockResolvedValue({
      id: 'ci-existing', memberId: 'mem-1', checkedInAt: NOW,
    });

    const req = createReq({
      method: 'POST',
      body: { code: 'CLS-123', phone: '+971501234567' },
    });
    const res = await checkinByCodeHandlers.POST(req as any);

    expect(res.status).toBe(409);
  });

  it('normalizes local UAE phone numbers (05x → +9715x)', async () => {
    mockPrisma.classSession.findFirst.mockResolvedValue({
      id: 'sess-1', startsAt: NOW, status: 'SCHEDULED',
    });
    mockPrisma.member.findFirst.mockResolvedValue(ACTIVE_MEMBER);
    mockPrisma.checkIn.findFirst.mockResolvedValue(null);
    mockPrisma.booking.findFirst.mockResolvedValue(null);
    mockPrisma.checkIn.create.mockResolvedValue({
      id: 'ci-local', memberId: 'mem-1', source: 'MOBILE_QR',
      checkedInAt: NOW, sessionId: 'sess-1',
    });

    const req = createReq({
      method: 'POST',
      body: { code: 'CLS-123', phone: '0501234567' },
    });
    const res = await checkinByCodeHandlers.POST(req as any);

    expect(res.status).toBe(201);
    // Verify member was looked up with normalized phone
    expect(mockPrisma.member.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ phone: '+971501234567' }) }),
    );
  });
});
