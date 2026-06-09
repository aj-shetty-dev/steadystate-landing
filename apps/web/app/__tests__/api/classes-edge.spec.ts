/**
 * Classes API — Edge Case & Validation Tests
 *
 * Covers: fieldErrors on all POST routes, status filter validation,
 *   falsy-0 dropInPriceAed, capacity/waitlist, frozen member booking,
 *   past/cancelled session booking, booking cancel promotion, check-in states.
 *
 * Fixed: dropInPriceAed falsy-0 bug, GET sessions status validation.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MOCK_USER, createReq, jsonBody, NOW } from './test-helpers';

const mockPrisma = {
  classType: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  classSession: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  classRecurrence: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  booking: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
  staff: { findFirst: vi.fn() },
  member: { findFirst: vi.fn() },
  membershipFreeze: { findFirst: vi.fn() },
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

const typesHandlers = await import('../../api/classes/types/route');
const sessionsHandlers = await import('../../api/classes/sessions/route');
const bookingsHandlers = await import('../../api/classes/bookings/route');
const cancelHandlers = await import('../../api/classes/bookings/[id]/cancel/route');
const checkinHandlers = await import('../../api/classes/bookings/[id]/check-in/route');

function params(id: string) { return { params: Promise.resolve({ id }) }; }

/* ─────────────────────────────────────────────────────────────────── */
/* Class Types — Validation                                            */
/* ─────────────────────────────────────────────────────────────────── */
describe('POST /api/classes/types — Validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 with fieldErrors when nameEn is missing', async () => {
    const req = createReq({ method: 'POST', body: { durationMin: 60, capacity: 20 } });
    const res = await typesHandlers.POST(req as any);
    const body = await jsonBody(res);
    expect(res.status).toBe(400);
    expect(body.fieldErrors).toBeDefined();
  });

  it('returns 400 when durationMin is not positive', async () => {
    const req = createReq({ method: 'POST', body: { nameEn: 'Yoga', durationMin: 0, capacity: 20 } });
    const res = await typesHandlers.POST(req as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when capacity is not positive', async () => {
    const req = createReq({ method: 'POST', body: { nameEn: 'Yoga', durationMin: 60, capacity: -1 } });
    const res = await typesHandlers.POST(req as any);
    expect(res.status).toBe(400);
  });

  it('accepts a valid class type', async () => {
    mockPrisma.classType.create.mockResolvedValue({
      id: 'ct-new', tenantId: MOCK_USER.tenantId, nameEn: 'Yoga',
      durationMin: 60, capacity: 20, color: '#22c55e', active: true,
    });
    const req = createReq({ method: 'POST', body: { nameEn: 'Yoga', durationMin: 60, capacity: 20 } });
    const res = await typesHandlers.POST(req as any);
    expect(res.status).toBe(201);
  });
});

/* ─────────────────────────────────────────────────────────────────── */
/* Sessions — Validation & Filters                                     */
/* ─────────────────────────────────────────────────────────────────── */
describe('GET /api/classes/sessions — Filters', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects invalid status filter', async () => {
    const req = createReq({ searchParams: { status: 'BOGUS' } });
    const res = await sessionsHandlers.GET(req as any);
    expect(res.status).toBe(400);
  });

  it('accepts valid statuses', async () => {
    mockPrisma.classSession.findMany.mockResolvedValue([]);
    for (const s of ['SCHEDULED', 'CANCELLED', 'COMPLETED']) {
      const req = createReq({ searchParams: { status: s } });
      const res = await sessionsHandlers.GET(req as any);
      expect(res.status).toBe(200);
    }
  });

  it('filters by classTypeId and instructorId', async () => {
    mockPrisma.classSession.findMany.mockResolvedValue([]);
    const req = createReq({ searchParams: { classTypeId: 'ct-1', instructorId: 'st-1' } });
    await sessionsHandlers.GET(req as any);
    const where = mockPrisma.classSession.findMany.mock.calls[0][0].where;
    expect(where.classTypeId).toBe('ct-1');
    expect(where.instructorId).toBe('st-1');
  });
});

describe('POST /api/classes/sessions — Validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 with fieldErrors when classTypeId is missing', async () => {
    const req = createReq({ method: 'POST', body: { startsAt: '2026-06-15T09:00:00.000Z' } });
    const res = await sessionsHandlers.POST(req as any);
    const body = await jsonBody(res);
    expect(res.status).toBe(400);
    expect(body.fieldErrors).toBeDefined();
  });

  it('returns 404 when class type not found', async () => {
    mockPrisma.classType.findFirst.mockResolvedValue(null);
    const req = createReq({
      method: 'POST',
      body: { classTypeId: 'bad-ct', startsAt: '2026-06-15T09:00:00.000Z' },
    });
    const res = await sessionsHandlers.POST(req as any);
    expect(res.status).toBe(404);
  });

  it('returns 400 when instructor not found or inactive', async () => {
    mockPrisma.classType.findFirst.mockResolvedValue({
      id: 'ct-1', tenantId: MOCK_USER.tenantId, active: true, durationMin: 60,
    });
    mockPrisma.staff.findFirst.mockResolvedValue(null);
    const req = createReq({
      method: 'POST',
      body: { classTypeId: 'ct-1', instructorId: 'bad-instructor', startsAt: '2026-06-15T09:00:00.000Z' },
    });
    const res = await sessionsHandlers.POST(req as any);
    expect(res.status).toBe(400);
  });

  it('accepts a valid session', async () => {
    mockPrisma.classType.findFirst.mockResolvedValue({
      id: 'ct-1', tenantId: MOCK_USER.tenantId, active: true, durationMin: 60,
    });
    mockPrisma.classSession.findUnique.mockResolvedValue(null); // unique code
    mockPrisma.classSession.create.mockResolvedValue({
      id: 'sess-new', tenantId: MOCK_USER.tenantId, classTypeId: 'ct-1',
      startsAt: new Date('2026-06-15T09:00:00Z'), endsAt: new Date('2026-06-15T10:00:00Z'),
      checkinCode: 'ABC123', status: 'SCHEDULED',
    });
    const req = createReq({
      method: 'POST',
      body: { classTypeId: 'ct-1', startsAt: '2026-06-15T09:00:00.000Z' },
    });
    const res = await sessionsHandlers.POST(req as any);
    expect(res.status).toBe(201);
  });
});

/* ─────────────────────────────────────────────────────────────────── */
/* Bookings — Edge Cases                                               */
/* ─────────────────────────────────────────────────────────────────── */
describe('POST /api/classes/bookings — Edge Cases', () => {
  beforeEach(() => vi.clearAllMocks());

  const SESSION = {
    id: 'sess-1', tenantId: MOCK_USER.tenantId, startsAt: new Date(Date.now() + 3600000),
    status: 'SCHEDULED', classType: { capacity: 20, dropInPriceAed: 5000 },
    _count: { bookings: 5 },
  };
  const ACTIVE_MEMBER = { id: 'mem-1', membershipStatus: 'ACTIVE' };

  it('returns 400 when session has already started', async () => {
    mockPrisma.classSession.findFirst.mockResolvedValue({
      ...SESSION, startsAt: new Date(Date.now() - 3600000),
    });
    mockPrisma.member.findFirst.mockResolvedValue(ACTIVE_MEMBER);
    mockPrisma.booking.findFirst.mockResolvedValue(null);

    const req = createReq({ method: 'POST', body: { sessionId: 'sess-1', memberId: 'mem-1' } });
    const res = await bookingsHandlers.POST(req as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when session is CANCELLED', async () => {
    mockPrisma.classSession.findFirst.mockResolvedValue({ ...SESSION, status: 'CANCELLED' });
    mockPrisma.member.findFirst.mockResolvedValue(ACTIVE_MEMBER);
    mockPrisma.booking.findFirst.mockResolvedValue(null);

    const req = createReq({ method: 'POST', body: { sessionId: 'sess-1', memberId: 'mem-1' } });
    const res = await bookingsHandlers.POST(req as any);
    expect(res.status).toBe(400);
  });

  it('returns 409 when already booked', async () => {
    mockPrisma.classSession.findFirst.mockResolvedValue(SESSION);
    mockPrisma.member.findFirst.mockResolvedValue(ACTIVE_MEMBER);
    mockPrisma.booking.findFirst.mockResolvedValue({ id: 'bk-existing', status: 'BOOKED' });

    const req = createReq({ method: 'POST', body: { sessionId: 'sess-1', memberId: 'mem-1' } });
    const res = await bookingsHandlers.POST(req as any);
    expect(res.status).toBe(409);
  });

  // FALSY-0 BUG FIX: dropInPriceAed=0 means free drop-in, not "no drop-in"
  it('allows non-member booking when dropInPriceAed is 0 (free drop-in)', async () => {
    mockPrisma.classSession.findFirst.mockResolvedValue({
      ...SESSION, classType: { capacity: 20, dropInPriceAed: 0 },
    });
    mockPrisma.member.findFirst.mockResolvedValue({ id: 'mem-1', membershipStatus: 'EXPIRED' });
    mockPrisma.booking.findFirst.mockResolvedValue(null);
    mockPrisma.booking.create.mockResolvedValue({ id: 'bk-new', status: 'BOOKED' });

    const req = createReq({ method: 'POST', body: { sessionId: 'sess-1', memberId: 'mem-1' } });
    const res = await bookingsHandlers.POST(req as any);
    expect(res.status).toBe(201);
  });

  it('returns 400 for frozen member during conflicting freeze', async () => {
    mockPrisma.classSession.findFirst.mockResolvedValue(SESSION);
    mockPrisma.member.findFirst.mockResolvedValue({ id: 'mem-1', membershipStatus: 'FROZEN' });
    mockPrisma.booking.findFirst.mockResolvedValue(null);
    mockPrisma.membershipFreeze.findFirst.mockResolvedValue({ id: 'frz-1' });

    const req = createReq({ method: 'POST', body: { sessionId: 'sess-1', memberId: 'mem-1' } });
    const res = await bookingsHandlers.POST(req as any);
    expect(res.status).toBe(400);
  });

  it('allows frozen member without conflicting freeze', async () => {
    mockPrisma.classSession.findFirst.mockResolvedValue(SESSION);
    mockPrisma.member.findFirst.mockResolvedValue({ id: 'mem-1', membershipStatus: 'FROZEN' });
    mockPrisma.booking.findFirst.mockResolvedValue(null);
    mockPrisma.membershipFreeze.findFirst.mockResolvedValue(null); // no conflict
    mockPrisma.booking.create.mockResolvedValue({ id: 'bk-new', status: 'BOOKED' });

    const req = createReq({ method: 'POST', body: { sessionId: 'sess-1', memberId: 'mem-1' } });
    const res = await bookingsHandlers.POST(req as any);
    expect(res.status).toBe(201);
  });

  it('waitlists when over capacity', async () => {
    mockPrisma.classSession.findFirst.mockResolvedValue({ ...SESSION, classType: { capacity: 5, dropInPriceAed: 5000 }, _count: { bookings: 5 } });
    mockPrisma.member.findFirst.mockResolvedValue(ACTIVE_MEMBER);
    mockPrisma.booking.findFirst.mockResolvedValue(null);
    mockPrisma.booking.count.mockResolvedValue(5); // at capacity
    mockPrisma.booking.create.mockResolvedValue({ id: 'bk-wl', status: 'WAITLISTED', position: 1,
      member: { id: 'mem-1', fullName: 'Ahmed', phone: null, membershipStatus: 'ACTIVE' } });

    const req = createReq({ method: 'POST', body: { sessionId: 'sess-1', memberId: 'mem-1' } });
    const res = await bookingsHandlers.POST(req as any);
    const body = await jsonBody(res);
    expect(res.status).toBe(201);
    expect(body.status).toBe('WAITLISTED');
  });

  it('returns 404 when session not found', async () => {
    mockPrisma.classSession.findFirst.mockResolvedValue(null);
    mockPrisma.member.findFirst.mockResolvedValue(ACTIVE_MEMBER);
    mockPrisma.booking.findFirst.mockResolvedValue(null);

    const req = createReq({ method: 'POST', body: { sessionId: 'bad-sess', memberId: 'mem-1' } });
    const res = await bookingsHandlers.POST(req as any);
    expect(res.status).toBe(404);
  });

  it('returns 404 when member not found', async () => {
    mockPrisma.classSession.findFirst.mockResolvedValue(SESSION);
    mockPrisma.member.findFirst.mockResolvedValue(null);
    mockPrisma.booking.findFirst.mockResolvedValue(null);

    const req = createReq({ method: 'POST', body: { sessionId: 'sess-1', memberId: 'bad-mem' } });
    const res = await bookingsHandlers.POST(req as any);
    expect(res.status).toBe(404);
  });
});

/* ─────────────────────────────────────────────────────────────────── */
/* Booking Cancel — Edge Cases                                         */
/* ─────────────────────────────────────────────────────────────────── */
describe('POST /api/classes/bookings/[id]/cancel — Edge Cases', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cancels a booking and promotes waitlisted', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue({ id: 'bk-1', sessionId: 'sess-1', tenantId: MOCK_USER.tenantId, status: 'BOOKED' });
    mockPrisma.booking.update.mockResolvedValue({ id: 'bk-1', status: 'CANCELLED', cancelledAt: new Date() });
    // Waitlisted booking to promote
    mockPrisma.booking.findFirst.mockResolvedValueOnce({ id: 'bk-1', ...({} as any) }) // initial lookup
      .mockResolvedValueOnce({ id: 'bk-2', status: 'WAITLISTED', position: 1 }); // waitlist lookup
    mockPrisma.booking.update.mockResolvedValue({ id: 'bk-2', status: 'BOOKED', position: null });

    const req = createReq({ method: 'POST' });
    const res = await cancelHandlers.POST(req as any, params('bk-1'));
    expect(res.status).toBe(200);
  });

  it('returns 404 when booking not found', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(null);
    const req = createReq({ method: 'POST' });
    const res = await cancelHandlers.POST(req as any, params('ghost'));
    expect(res.status).toBe(404);
  });

  it('returns booking as-is when already cancelled', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue({ id: 'bk-1', status: 'CANCELLED' });
    const req = createReq({ method: 'POST' });
    const res = await cancelHandlers.POST(req as any, params('bk-1'));
    expect(res.status).toBe(200);
  });
});

/* ─────────────────────────────────────────────────────────────────── */
/* Booking Check-in — Edge Cases                                       */
/* ─────────────────────────────────────────────────────────────────── */
describe('POST /api/classes/bookings/[id]/check-in — Edge Cases', () => {
  beforeEach(() => vi.clearAllMocks());

  it('checks in a BOOKED booking', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue({ id: 'bk-1', tenantId: MOCK_USER.tenantId, status: 'BOOKED' });
    mockPrisma.booking.update.mockResolvedValue({ id: 'bk-1', status: 'CHECKED_IN', checkedInAt: new Date() });

    const req = createReq({ method: 'POST' });
    const res = await checkinHandlers.POST(req as any, params('bk-1'));
    expect(res.status).toBe(200);
  });

  it('returns booking as-is when already CHECKED_IN', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue({ id: 'bk-1', status: 'CHECKED_IN' });
    const req = createReq({ method: 'POST' });
    const res = await checkinHandlers.POST(req as any, params('bk-1'));
    expect(res.status).toBe(200);
  });

  it('returns 400 when booking is not BOOKED or CHECKED_IN', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue({ id: 'bk-1', status: 'CANCELLED' });
    const req = createReq({ method: 'POST' });
    const res = await checkinHandlers.POST(req as any, params('bk-1'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when booking not found', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(null);
    const req = createReq({ method: 'POST' });
    const res = await checkinHandlers.POST(req as any, params('ghost'));
    expect(res.status).toBe(404);
  });
});
