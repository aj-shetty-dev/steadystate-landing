/**
 * Classes API — End-to-End Flow Tests
 *
 * Covers: Class Types CRUD → Sessions CRUD → Book member into class →
 *         Booking check-in → Booking cancel → Edge cases (capacity, frozen member, past session)
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MOCK_USER, createReq, jsonBody, NOW } from './test-helpers';

/* ------------------------------------------------------------------ */
/* Mock prisma                                                        */
/* ------------------------------------------------------------------ */
const mockPrisma = {
  classType: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  classSession: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
  classRecurrence: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  booking: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
  member: { findFirst: vi.fn() },
  membershipFreeze: { findFirst: vi.fn() },
  $transaction: vi.fn((fn: any) => fn(mockPrisma)),
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth-server", () => ({
  requireServerUser: vi.fn().mockResolvedValue({ id: "user-1", email: "owner@testgym.ae", fullName: "Test Owner", tenantId: "tenant-1", role: "OWNER" }),
  requireTenantId: vi.fn().mockResolvedValue("tenant-1"),
  getServerUser: vi.fn().mockResolvedValue({ id: "user-1", email: "owner@testgym.ae", fullName: "Test Owner", tenantId: "tenant-1", role: "OWNER" }),
}));

const typeHandlers = await import('../../api/classes/types/route');
const typeIdHandlers = await import('../../api/classes/types/[id]/route');
const sessionHandlers = await import('../../api/classes/sessions/route');
const sessionIdHandlers = await import('../../api/classes/sessions/[id]/route');
const cancelSessionHandlers = await import('../../api/classes/sessions/[id]/cancel/route');
const recurHandlers = await import('../../api/classes/recurrences/route');
const recurIdHandlers = await import('../../api/classes/recurrences/[id]/route');
const bookingHandlers = await import('../../api/classes/bookings/route');
const bookingCancelHandlers = await import('../../api/classes/bookings/[id]/cancel/route');
const bookingCheckInHandlers = await import('../../api/classes/bookings/[id]/check-in/route');

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */
describe('Class Types CRUD', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /api/classes/types — creates a class type', async () => {
    mockPrisma.classType.create.mockResolvedValue({
      id: 'ct-1', tenantId: MOCK_USER.tenantId, nameEn: 'Yoga Flow',
      durationMin: 60, capacity: 25, color: '#22c55e', active: true,
    });
    const req = createReq({ method: 'POST', body: { nameEn: 'Yoga Flow', durationMin: 60, capacity: 25 } });
    const res = await typeHandlers.POST(req as any);
    expect(res.status).toBe(201);
  });

  it('GET /api/classes/types — lists active class types', async () => {
    mockPrisma.classType.findMany.mockResolvedValue([
      { id: 'ct-1', nameEn: 'Yoga Flow', durationMin: 60, capacity: 25, active: true },
      { id: 'ct-2', nameEn: 'HIIT', durationMin: 45, capacity: 20, active: true },
    ]);
    const req = createReq();
    const res = await typeHandlers.GET(req as any);
    const body = (await jsonBody(res)) as any[];
    expect(res.status).toBe(200);
    expect(body).toHaveLength(2);
  });

  it('PATCH /api/classes/types/[id] — updates a class type', async () => {
    mockPrisma.classType.findFirst.mockResolvedValue({ id: 'ct-1' });
    mockPrisma.classType.update.mockResolvedValue({ id: 'ct-1', nameEn: 'Advanced Yoga' });
    const req = createReq({ method: 'PATCH', body: { nameEn: 'Advanced Yoga' } });
    const res = await typeIdHandlers.PATCH(req as any, { params: Promise.resolve({ id: 'ct-1' }) });
    expect(res.status).toBe(200);
  });
});

describe('Class Recurrences (Scheduling Rules)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /api/classes/recurrences — creates a recurrence rule', async () => {
    mockPrisma.classType.findFirst.mockResolvedValue({ id: 'ct-1', nameEn: 'Yoga' });
    mockPrisma.classRecurrence.create.mockResolvedValue({
      id: 'rec-1', classTypeId: 'ct-1', daysOfWeek: [1, 3, 5], startTime: '07:00',
      durationMin: 60, active: true,
    });
    const req = createReq({
      method: 'POST',
      body: { classTypeId: 'ct-1', daysOfWeek: [1, 3, 5], startTime: '07:00', durationMin: 60, validFrom: '2026-06-01T00:00:00Z' },
    });
    const res = await recurHandlers.POST(req as any);
    expect(res.status).toBe(201);
  });
});

describe('Class Sessions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /api/classes/sessions — lists sessions with filters', async () => {
    mockPrisma.classSession.findMany.mockResolvedValue([
      {
        id: 'sess-1', classTypeId: 'ct-1', startsAt: new Date('2026-06-04T07:00:00Z'),
        endsAt: new Date('2026-06-04T08:00:00Z'), status: 'SCHEDULED', room: 'Studio A',
        classType: { id: 'ct-1', nameEn: 'Yoga', color: '#22c55e' },
        instructor: { id: 'st-1', fullName: 'Coach Ahmed' },
        _count: { bookings: 15 },
      },
    ]);
    const req = createReq({ searchParams: { from: '2026-06-01', to: '2026-06-07' } });
    const res = await sessionHandlers.GET(req as any);
    const body = (await jsonBody(res)) as any[];
    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].classType.nameEn).toBe('Yoga');
  });

  it('POST /api/classes/sessions — creates a session', async () => {
    mockPrisma.classType.findFirst.mockResolvedValue({ id: 'ct-1', nameEn: 'Yoga' });
    mockPrisma.classSession.create.mockResolvedValue({
      id: 'sess-1', classTypeId: 'ct-1', startsAt: new Date('2026-06-04T07:00:00Z'),
      endsAt: new Date('2026-06-04T08:00:00Z'), status: 'SCHEDULED',
    });
    const req = createReq({
      method: 'POST',
      body: { classTypeId: 'ct-1', startsAt: '2026-06-04T07:00:00Z', endsAt: '2026-06-04T08:00:00Z' },
    });
    const res = await sessionHandlers.POST(req as any);
    expect(res.status).toBe(201);
  });

  it('POST /api/classes/sessions/[id]/cancel — cancels a session', async () => {
    mockPrisma.classSession.findFirst.mockResolvedValue({
      id: 'sess-1', tenantId: MOCK_USER.tenantId, status: 'SCHEDULED',
    });
    mockPrisma.classSession.update.mockResolvedValue({ id: 'sess-1', status: 'CANCELLED' });
    const req = createReq({ method: 'POST' });
    const res = await cancelSessionHandlers.POST(req as any, { params: Promise.resolve({ id: 'sess-1' }) });
    expect(res.status).toBe(200);
  });
});

describe('Bookings — Full Lifecycle', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /api/classes/bookings — books a member into a class', async () => {
    const futureDate = new Date(Date.now() + 86400000); // tomorrow
    mockPrisma.classSession.findFirst.mockResolvedValue({
      id: 'sess-1', tenantId: MOCK_USER.tenantId, status: 'SCHEDULED',
      startsAt: futureDate,
      classType: { capacity: 25, dropInPriceAed: 75 },
      _count: { bookings: 10 },
    });
    mockPrisma.member.findFirst.mockResolvedValue({ id: 'm1', membershipStatus: 'ACTIVE' });
    mockPrisma.booking.findFirst.mockResolvedValue(null); // no existing booking
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        booking: {
          count: mockPrisma.booking.count.mockResolvedValue(10),
          create: vi.fn().mockResolvedValue({ id: 'bk-1', sessionId: 'sess-1', memberId: 'm1', status: 'BOOKED' }),
        },
      };
      return fn(tx);
    });

    const req = createReq({ method: 'POST', body: { sessionId: 'sess-1', memberId: 'm1' } });
    const res = await bookingHandlers.POST(req as any);
    expect(res.status).toBe(201);
  });

  it('POST /api/classes/bookings — returns 400 for past session', async () => {
    mockPrisma.classSession.findFirst.mockResolvedValue({
      id: 'sess-1', tenantId: MOCK_USER.tenantId, status: 'SCHEDULED',
      startsAt: new Date('2020-01-01'), // past
      classType: { capacity: 25 },
      _count: { bookings: 0 },
    });
    mockPrisma.member.findFirst.mockResolvedValue({ id: 'm1', membershipStatus: 'ACTIVE' });
    mockPrisma.booking.findFirst.mockResolvedValue(null);

    const req = createReq({ method: 'POST', body: { sessionId: 'sess-1', memberId: 'm1' } });
    const res = await bookingHandlers.POST(req as any);
    const body = await jsonBody(res);

    expect(res.status).toBe(400);
    expect(body).toMatchObject({ message: 'Cannot book a session that has already started' });
  });

  it('POST /api/classes/bookings — returns 409 for duplicate booking', async () => {
    const futureDate = new Date(Date.now() + 86400000);
    mockPrisma.classSession.findFirst.mockResolvedValue({
      id: 'sess-1', tenantId: MOCK_USER.tenantId, status: 'SCHEDULED',
      startsAt: futureDate,
      classType: { capacity: 25 },
      _count: { bookings: 5 },
    });
    mockPrisma.member.findFirst.mockResolvedValue({ id: 'm1', membershipStatus: 'ACTIVE' });
    mockPrisma.booking.findFirst.mockResolvedValue({ id: 'bk-1', status: 'BOOKED' }); // already booked

    const req = createReq({ method: 'POST', body: { sessionId: 'sess-1', memberId: 'm1' } });
    const res = await bookingHandlers.POST(req as any);
    const body = await jsonBody(res);

    expect(res.status).toBe(409);
    expect(body).toMatchObject({ message: 'Already booked' });
  });

  it('POST /api/classes/bookings — waitlists when session is full', async () => {
    const futureDate = new Date(Date.now() + 86400000);
    mockPrisma.classSession.findFirst.mockResolvedValue({
      id: 'sess-1', tenantId: MOCK_USER.tenantId, status: 'SCHEDULED',
      startsAt: futureDate,
      classType: { capacity: 25, dropInPriceAed: 75 },
      _count: { bookings: 25 }, // full capacity
    });
    mockPrisma.member.findFirst.mockResolvedValue({ id: 'm1', membershipStatus: 'ACTIVE' });
    mockPrisma.booking.findFirst.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        booking: {
          count: mockPrisma.booking.count.mockResolvedValue(25),
          create: vi.fn().mockResolvedValue({ id: 'bk-1', sessionId: 'sess-1', memberId: 'm1', status: 'WAITLISTED', position: 1 }),
        },
      };
      return fn(tx);
    });

    const req = createReq({ method: 'POST', body: { sessionId: 'sess-1', memberId: 'm1' } });
    const res = await bookingHandlers.POST(req as any);
    const body = (await jsonBody(res)) as any;

    expect(res.status).toBe(201);
    expect(body.status).toBe('WAITLISTED');
  });

  it('POST /api/classes/bookings/[id]/cancel — cancels a booking', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue({
      id: 'bk-1', tenantId: MOCK_USER.tenantId, status: 'BOOKED',
    });
    mockPrisma.booking.update.mockResolvedValue({ id: 'bk-1', status: 'CANCELLED' });
    const req = createReq({ method: 'POST' });
    const res = await bookingCancelHandlers.POST(req as any, { params: Promise.resolve({ id: 'bk-1' }) });
    expect(res.status).toBe(200);
  });

  it('POST /api/classes/bookings/[id]/check-in — checks in a booking', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue({
      id: 'bk-1', tenantId: MOCK_USER.tenantId, status: 'BOOKED',
    });
    mockPrisma.booking.update.mockResolvedValue({ id: 'bk-1', status: 'CHECKED_IN', checkedInAt: NOW });
    const req = createReq({ method: 'POST' });
    const res = await bookingCheckInHandlers.POST(req as any, { params: Promise.resolve({ id: 'bk-1' }) });
    expect(res.status).toBe(200);
  });
});
