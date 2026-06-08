/**
 * Phase 8 — Classes Remaining API Tests
 *
 * Bookings, check-in, cancel booking, cancel session, recurrences
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MOCK_USER, createReq, jsonBody } from './test-helpers';

const mockPrisma: Record<string, any> = {
  classSession: { findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  classRecurrence: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  classType: { findFirst: vi.fn() },
  member: { findFirst: vi.fn() },
  booking: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  membershipFreeze: { findFirst: vi.fn() },
  staff: { findMany: vi.fn() },
  $transaction: vi.fn((arg: any) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    return arg(mockPrisma);
  }),
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/auth-server', () => ({
  requireServerUser: vi.fn().mockResolvedValue(MOCK_USER),
  requireTenantId: vi.fn().mockResolvedValue(MOCK_USER.tenantId),
}));

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

const bookingsHandlers = await import('../../api/classes/bookings/route');
const cancelBookingHandlers = await import('../../api/classes/bookings/[id]/cancel/route');
const checkInHandlers = await import('../../api/classes/bookings/[id]/check-in/route');
const cancelSessionHandlers = await import('../../api/classes/sessions/[id]/cancel/route');
const recurrencesHandlers = await import('../../api/classes/recurrences/route');

const FUTURE = new Date(Date.now() + 86400000); // tomorrow

// ═══════════════════════════════════════════════════════════════════════════
// BOOKINGS — Create
// ═══════════════════════════════════════════════════════════════════════════
describe('POST /api/classes/bookings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a booking for a scheduled session', async () => {
    mockPrisma.classSession.findFirst.mockResolvedValue({
      id: 'sess-1', tenantId: MOCK_USER.tenantId, status: 'SCHEDULED',
      startsAt: FUTURE, capacityOverride: null,
      classType: { capacity: 20, dropInPriceAed: 5000 },
      _count: { bookings: 5 },
    });
    mockPrisma.member.findFirst.mockResolvedValue({ id: 'mem-1', membershipStatus: 'ACTIVE' });
    mockPrisma.booking.findFirst.mockResolvedValue(null); // no existing booking
    mockPrisma.booking.count.mockResolvedValue(5);
    mockPrisma.booking.create.mockResolvedValue({
      id: 'bk-1', sessionId: 'sess-1', memberId: 'mem-1', status: 'BOOKED', position: null,
      member: { id: 'mem-1', fullName: 'Ahmed', phone: '+971501234567', membershipStatus: 'ACTIVE' },
    });

    const req = createReq({
      method: 'POST',
      body: { sessionId: 'sess-1', memberId: 'mem-1' },
    });
    const res = await bookingsHandlers.POST(req as any);

    expect(res.status).toBe(201);
  });

  it('returns 404 when session not found', async () => {
    mockPrisma.classSession.findFirst.mockResolvedValue(null);
    mockPrisma.member.findFirst.mockResolvedValue({ id: 'mem-1', membershipStatus: 'ACTIVE' });
    mockPrisma.booking.findFirst.mockResolvedValue(null);

    const req = createReq({
      method: 'POST',
      body: { sessionId: 'ghost', memberId: 'mem-1' },
    });
    const res = await bookingsHandlers.POST(req as any);
    expect(res.status).toBe(404);
  });

  it('returns 400 when session already started', async () => {
    mockPrisma.classSession.findFirst.mockResolvedValue({
      id: 'sess-old', tenantId: MOCK_USER.tenantId, status: 'SCHEDULED',
      startsAt: new Date(Date.now() - 3600000), // 1 hour ago
    });
    mockPrisma.member.findFirst.mockResolvedValue({ id: 'mem-1', membershipStatus: 'ACTIVE' });
    mockPrisma.booking.findFirst.mockResolvedValue(null);

    const req = createReq({
      method: 'POST',
      body: { sessionId: 'sess-old', memberId: 'mem-1' },
    });
    const res = await bookingsHandlers.POST(req as any);
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BOOKINGS — Cancel
// ═══════════════════════════════════════════════════════════════════════════
describe('POST /api/classes/bookings/[id]/cancel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cancels a booking and promotes waitlisted', async () => {
    mockPrisma.booking.findFirst
      .mockResolvedValueOnce({ id: 'bk-1', sessionId: 'sess-1', tenantId: MOCK_USER.tenantId, status: 'BOOKED' }) // initial
      .mockResolvedValueOnce({ id: 'bk-2', status: 'WAITLISTED', position: 1 }); // first waitlisted
    mockPrisma.booking.update.mockResolvedValue({ id: 'bk-1', status: 'CANCELLED' });

    const req = createReq({ method: 'POST' });
    const res = await cancelBookingHandlers.POST(req as any, params('bk-1'));

    expect(res.status).toBe(200);
  });

  it('returns 404 when booking not found', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(null);
    const req = createReq({ method: 'POST' });
    const res = await cancelBookingHandlers.POST(req as any, params('ghost'));
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BOOKINGS — Check In
// ═══════════════════════════════════════════════════════════════════════════
describe('POST /api/classes/bookings/[id]/check-in', () => {
  beforeEach(() => vi.clearAllMocks());

  it('checks in a booked member', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue({
      id: 'bk-1', tenantId: MOCK_USER.tenantId, status: 'BOOKED', sessionId: 'sess-1',
    });
    mockPrisma.booking.update.mockResolvedValue({ id: 'bk-1', status: 'CHECKED_IN' });

    const req = createReq({ method: 'POST' });
    const res = await checkInHandlers.POST(req as any, params('bk-1'));

    expect(res.status).toBe(200);
  });

  it('returns 400 when booking is not BOOKED', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue({
      id: 'bk-1', tenantId: MOCK_USER.tenantId, status: 'WAITLISTED', sessionId: 'sess-1',
    });
    const req = createReq({ method: 'POST' });
    const res = await checkInHandlers.POST(req as any, params('bk-1'));
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SESSIONS — Cancel
// ═══════════════════════════════════════════════════════════════════════════
describe('POST /api/classes/sessions/[id]/cancel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cancels a session and all its bookings', async () => {
    mockPrisma.classSession.findFirst.mockResolvedValue({
      id: 'sess-1', tenantId: MOCK_USER.tenantId, status: 'SCHEDULED',
      classType: { id: 'ct-1', nameEn: 'Yoga', nameAr: null },
    });
    mockPrisma.booking.updateMany.mockResolvedValue({ count: 5 });
    mockPrisma.classSession.update.mockResolvedValue({ id: 'sess-1', status: 'CANCELLED' });

    const req = createReq({ method: 'POST' });
    const res = await cancelSessionHandlers.POST(req as any, params('sess-1'));

    expect(res.status).toBe(200);
  });

  it('returns 404 when session not found', async () => {
    mockPrisma.classSession.findFirst.mockResolvedValue(null);
    const req = createReq({ method: 'POST' });
    const res = await cancelSessionHandlers.POST(req as any, params('ghost'));
    expect(res.status).toBe(404);
  });

  it('returns session as-is if already cancelled', async () => {
    mockPrisma.classSession.findFirst.mockResolvedValue({
      id: 'sess-1', tenantId: MOCK_USER.tenantId, status: 'CANCELLED',
    });
    const req = createReq({ method: 'POST' });
    const res = await cancelSessionHandlers.POST(req as any, params('sess-1'));
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RECURRENCES — List & Create
// ═══════════════════════════════════════════════════════════════════════════
describe('GET/POST /api/classes/recurrences', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists active recurrences with class type info', async () => {
    mockPrisma.classRecurrence.findMany.mockResolvedValue([
      { id: 'rec-1', classTypeId: 'ct-1', daysOfWeek: [1, 3, 5], startTime: '09:00', durationMin: 60, instructorId: null, active: true, classType: { id: 'ct-1', nameEn: 'Yoga' } },
    ]);
    const req = createReq();
    const res = await recurrencesHandlers.GET(req as any);
    const body: any = await jsonBody(res);
    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
  });

  it('creates a recurrence pattern', async () => {
    mockPrisma.classRecurrence.create.mockResolvedValue({
      id: 'rec-new', classTypeId: 'ct-1', daysOfWeek: [1, 3, 5], startTime: '08:00', durationMin: 60,
    });

    const req = createReq({
      method: 'POST',
      body: {
        classTypeId: 'ct-1', daysOfWeek: [1, 3, 5], startTime: '08:00',
        durationMin: 60, validFrom: '2026-06-07T00:00:00.000Z',
      },
    });
    const res = await recurrencesHandlers.POST(req as any);
    expect(res.status).toBe(201);
  });

  it('returns 400 for invalid recurrence input', async () => {
    const req = createReq({
      method: 'POST',
      body: { classTypeId: 'ct-1', daysOfWeek: [], startTime: '08:00', durationMin: 60, validFrom: '2026-06-07T00:00:00.000Z' },
    });
    const res = await recurrencesHandlers.POST(req as any);
    expect(res.status).toBe(400);
  });
});
