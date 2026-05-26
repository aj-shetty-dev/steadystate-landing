import { BookingStatus, ClassSessionStatus, Locale, MembershipStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingsService } from './bookings.service';
import { RecurrenceExpanderService } from './recurrence-expander.service';
import { SessionsService } from './sessions.service';

interface ClassTypeRow { id: string; tenantId: string; nameEn: string; nameAr?: string | null; durationMin: number; capacity: number; dropInPriceAed: number | null; active: boolean }
interface SessionRow { id: string; tenantId: string; classTypeId: string; instructorId: string | null; recurrenceRuleId: string | null; startsAt: Date; endsAt: Date; status: ClassSessionStatus; capacityOverride: number | null; room: string | null }
interface BookingRow { id: string; tenantId: string; sessionId: string; memberId: string; status: BookingStatus; position: number | null; bookedAt: Date; cancelledAt: Date | null; checkedInAt: Date | null }
interface MemberRow { id: string; tenantId: string; membershipStatus: MembershipStatus }
interface RecRow { id: string; tenantId: string; classTypeId: string; instructorId: string | null; daysOfWeek: number[]; startTime: string; durationMin: number; room: string | null; validFrom: Date; validUntil: Date | null; generatedThrough: Date | null; active: boolean }

function makeStub() {
  const types = new Map<string, ClassTypeRow>();
  const sessions = new Map<string, SessionRow>();
  const bookings = new Map<string, BookingRow>();
  const members = new Map<string, MemberRow>();
  const recs = new Map<string, RecRow>();
  let seq = 0;

  type SessionWhere = { id?: string; tenantId: string; classTypeId?: string; status?: ClassSessionStatus | { in?: ClassSessionStatus[] }; startsAt?: { gte?: Date; lte?: Date } };

  const stub = {
    types, sessions, bookings, members, recs,
    classType: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string; active?: boolean } }) => {
        const c = types.get(where.id);
        if (!c || c.tenantId !== where.tenantId) return null;
        if (where.active && !c.active) return null;
        return c;
      }),
      count: vi.fn(async () => 0),
    },
    classSession: {
      count: vi.fn(async () => 0),
      findFirst: vi.fn(async ({ where, include }: { where: SessionWhere; include?: Record<string, unknown> }) => {
        const id = where.id;
        if (!id) return null;
        const s = sessions.get(id);
        if (!s || s.tenantId !== where.tenantId) return null;
        const out: SessionRow & { classType?: ClassTypeRow; _count?: { bookings: number } } = { ...s };
        if (include?.classType) out.classType = types.get(s.classTypeId);
        if (include?._count) {
          const taken = [...bookings.values()].filter(
            (b) => b.sessionId === s.id && (b.status === BookingStatus.BOOKED || b.status === BookingStatus.CHECKED_IN),
          ).length;
          out._count = { bookings: taken };
        }
        return out;
      }),
      create: vi.fn(async ({ data }: { data: Omit<SessionRow, 'id'> & { tenantId: string; classTypeId: string } }) => {
        const existing = [...sessions.values()].find(
          (s) => s.recurrenceRuleId && data.recurrenceRuleId && s.recurrenceRuleId === data.recurrenceRuleId && s.startsAt.getTime() === data.startsAt.getTime(),
        );
        if (existing) throw new Error('unique constraint');
        seq += 1;
        const row: SessionRow = {
          id: `sess-${seq}`,
          tenantId: data.tenantId,
          classTypeId: data.classTypeId,
          instructorId: data.instructorId ?? null,
          recurrenceRuleId: data.recurrenceRuleId ?? null,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          status: data.status ?? ClassSessionStatus.SCHEDULED,
          capacityOverride: data.capacityOverride ?? null,
          room: data.room ?? null,
        };
        sessions.set(row.id, row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<SessionRow> }) => {
        const s = sessions.get(where.id)!;
        Object.assign(s, data);
        return s;
      }),
    },
    booking: {
      count: vi.fn(async ({ where }: { where: { tenantId: string; sessionId?: string; status?: BookingStatus | { in: BookingStatus[] } } }) => {
        let arr = [...bookings.values()].filter((b) => b.tenantId === where.tenantId);
        if (where.sessionId) arr = arr.filter((b) => b.sessionId === where.sessionId);
        if (where.status) {
          const s = where.status;
          if (typeof s === 'object' && 'in' in s) arr = arr.filter((b) => s.in.includes(b.status));
          else arr = arr.filter((b) => b.status === s);
        }
        return arr.length;
      }),
      findFirst: vi.fn(async ({ where, orderBy, include }: { where: { id?: string; tenantId: string; sessionId?: string; memberId?: string; status?: BookingStatus | { in: BookingStatus[] } }; orderBy?: { position?: 'asc' | 'desc' }; include?: Record<string, unknown> }) => {
        let arr = [...bookings.values()].filter((b) => b.tenantId === where.tenantId);
        if (where.id) arr = arr.filter((b) => b.id === where.id);
        if (where.sessionId) arr = arr.filter((b) => b.sessionId === where.sessionId);
        if (where.memberId) arr = arr.filter((b) => b.memberId === where.memberId);
        if (where.status) {
          const s = where.status;
          if (typeof s === 'object' && 'in' in s) arr = arr.filter((b) => s.in.includes(b.status));
          else arr = arr.filter((b) => b.status === s);
        }
        if (orderBy?.position === 'asc') arr.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        const hit = arr[0] ?? null;
        if (hit && include) {
          const out: BookingRow & { member?: unknown; session?: unknown } = { ...hit };
          if (include.member) out.member = members.get(hit.memberId) ?? null;
          if (include.session) {
            const s = sessions.get(hit.sessionId);
            out.session = s ? { ...s, classType: types.get(s.classTypeId) ?? null } : null;
          }
          return out;
        }
        return hit;
      }),
      findMany: vi.fn(async ({ where, include }: { where: { tenantId: string; sessionId?: string; status?: { in: BookingStatus[] } }; include?: Record<string, unknown> }) => {
        let arr = [...bookings.values()].filter((b) => b.tenantId === where.tenantId);
        if (where.sessionId) arr = arr.filter((b) => b.sessionId === where.sessionId);
        if (where.status?.in) arr = arr.filter((b) => where.status!.in.includes(b.status));
        if (include?.member) {
          return arr.map((b) => ({ ...b, member: members.get(b.memberId) ?? null }));
        }
        return arr;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { tenantId: string; sessionId?: string; status?: { in: BookingStatus[] } }; data: Partial<BookingRow> }) => {
        let count = 0;
        for (const b of bookings.values()) {
          if (b.tenantId !== where.tenantId) continue;
          if (where.sessionId && b.sessionId !== where.sessionId) continue;
          if (where.status?.in && !where.status.in.includes(b.status)) continue;
          Object.assign(b, data);
          count++;
        }
        return { count };
      }),
      create: vi.fn(async ({ data }: { data: Omit<BookingRow, 'id' | 'bookedAt' | 'cancelledAt' | 'checkedInAt'> }) => {
        seq += 1;
        const row: BookingRow = {
          id: `book-${seq}`,
          bookedAt: new Date(),
          cancelledAt: null,
          checkedInAt: null,
          ...data,
        };
        bookings.set(row.id, row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<BookingRow> }) => {
        const b = bookings.get(where.id)!;
        Object.assign(b, data);
        return b;
      }),
    },
    member: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string } }) => {
        const m = members.get(where.id);
        return m && m.tenantId === where.tenantId ? m : null;
      }),
    },
    membership: {
      findFirst: vi.fn(async () => null),
    },
    membershipFreeze: {
      findFirst: vi.fn(async () => null),
    },
    classRecurrence: {
      findMany: vi.fn(async () => [...recs.values()].filter((r) => r.active)),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<RecRow> }) => {
        const r = recs.get(where.id)!;
        Object.assign(r, data);
        return r;
      }),
    },
    staff: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string; active?: boolean } }) => {
        if (where.id === 'staff-1' && where.tenantId === 't1') return { id: 'staff-1' };
        return null;
      }),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      if (Array.isArray(fn)) return Promise.all(fn);
      return fn(stub);
    }),
  };
  return stub;
}

function makeNotificationsSpy() {
  return { dispatch: vi.fn().mockResolvedValue({ messageId: 'm', channel: 'WHATSAPP' }) };
}

describe('SessionsService', () => {
  it('creates a session from class type', async () => {
    const stub = makeStub();
    stub.types.set('ct1', { id: 'ct1', tenantId: 't1', nameEn: 'Yoga', durationMin: 60, capacity: 10, dropInPriceAed: null, active: true });
    const svc = new SessionsService(stub as unknown as never, makeNotificationsSpy() as unknown as never);
    const s = await svc.create('t1', { classTypeId: 'ct1', startsAt: '2099-01-01T06:00:00.000Z' });
    expect(s.classTypeId).toBe('ct1');
    expect(s.endsAt.getTime() - s.startsAt.getTime()).toBe(60 * 60_000);
  });

  it('rejects when class type missing', async () => {
    const stub = makeStub();
    const svc = new SessionsService(stub as unknown as never, makeNotificationsSpy() as unknown as never);
    await expect(svc.create('t1', { classTypeId: 'missing', startsAt: '2099-01-01T06:00:00.000Z' })).rejects.toThrow();
  });

  it('rejects when instructorId belongs to a different tenant or is inactive', async () => {
    const stub = makeStub();
    stub.types.set('ct1', { id: 'ct1', tenantId: 't1', nameEn: 'Yoga', durationMin: 60, capacity: 10, dropInPriceAed: null, active: true });
    const svc = new SessionsService(stub as unknown as never, makeNotificationsSpy() as unknown as never);
    await expect(svc.create('t1', { classTypeId: 'ct1', startsAt: '2099-01-01T06:00:00.000Z', instructorId: 'ghost-staff' })).rejects.toThrow(/instructor/i);
  });

  it('creates session with valid instructorId', async () => {
    const stub = makeStub();
    stub.types.set('ct1', { id: 'ct1', tenantId: 't1', nameEn: 'Yoga', durationMin: 60, capacity: 10, dropInPriceAed: null, active: true });
    const svc = new SessionsService(stub as unknown as never, makeNotificationsSpy() as unknown as never);
    const s = await svc.create('t1', { classTypeId: 'ct1', startsAt: '2099-01-01T06:00:00.000Z', instructorId: 'staff-1' });
    expect(s.instructorId).toBe('staff-1');
  });

  it('reschedule rejects non-SCHEDULED sessions', async () => {
    const stub = makeStub();
    stub.types.set('ct1', { id: 'ct1', tenantId: 't1', nameEn: 'Yoga', durationMin: 60, capacity: 10, dropInPriceAed: null, active: true });
    stub.sessions.set('s-c', {
      id: 's-c', tenantId: 't1', classTypeId: 'ct1', instructorId: null, recurrenceRuleId: null,
      startsAt: new Date('2099-01-01T06:00:00Z'), endsAt: new Date('2099-01-01T07:00:00Z'),
      status: ClassSessionStatus.CANCELLED, capacityOverride: null, room: null,
    });
    const svc = new SessionsService(stub as unknown as never, makeNotificationsSpy() as unknown as never);
    await expect(svc.reschedule('t1', 's-c', new Date('2099-02-01T06:00:00Z'))).rejects.toThrow(/reschedule/i);
  });

  it('reschedule dispatches class_session_rescheduled to BOOKED members', async () => {
    const stub = makeStub();
    const notificationsSpy = makeNotificationsSpy();
    stub.types.set('ct1', { id: 'ct1', tenantId: 't1', nameEn: 'Yoga', nameAr: 'يوغا', durationMin: 60, capacity: 10, dropInPriceAed: null, active: true });
    stub.sessions.set('s-r', {
      id: 's-r', tenantId: 't1', classTypeId: 'ct1', instructorId: null, recurrenceRuleId: null,
      startsAt: new Date('2099-01-01T06:00:00Z'), endsAt: new Date('2099-01-01T07:00:00Z'),
      status: ClassSessionStatus.SCHEDULED, capacityOverride: null, room: null,
    });
    stub.members.set('m-r', { id: 'm-r', tenantId: 't1', membershipStatus: MembershipStatus.ACTIVE, phone: '+971500009999', preferredLocale: 'EN', fullName: 'Ali' } as never);
    stub.bookings.set('b-r', {
      id: 'b-r', tenantId: 't1', sessionId: 's-r', memberId: 'm-r',
      status: BookingStatus.BOOKED, position: null, bookedAt: new Date(), cancelledAt: null, checkedInAt: null,
    });
    const svc = new SessionsService(stub as unknown as never, notificationsSpy as unknown as never);
    await svc.reschedule('t1', 's-r', new Date('2099-02-01T06:00:00Z'));
    expect(notificationsSpy.dispatch).toHaveBeenCalledOnce();
    expect(notificationsSpy.dispatch.mock.calls[0][0]).toMatchObject({ category: 'class_session_rescheduled', memberId: 'm-r' });
  });

  it('cancel cascades to bookings and dispatches notifications', async () => {
    const stub = makeStub();
    const notificationsSpy = makeNotificationsSpy();
    stub.types.set('ct1', { id: 'ct1', tenantId: 't1', nameEn: 'Yoga', nameAr: 'يوغا', durationMin: 60, capacity: 10, dropInPriceAed: null, active: true });
    stub.sessions.set('s9', {
      id: 's9', tenantId: 't1', classTypeId: 'ct1', instructorId: null, recurrenceRuleId: null,
      startsAt: new Date('2099-02-01T06:00:00Z'), endsAt: new Date('2099-02-01T07:00:00Z'),
      status: ClassSessionStatus.SCHEDULED, capacityOverride: null, room: null,
    });
    stub.members.set('mp', { id: 'mp', tenantId: 't1', membershipStatus: MembershipStatus.ACTIVE, phone: '+971500000099', preferredLocale: Locale.EN, fullName: 'P' } as never);
    const bookings = new BookingsService(stub as unknown as never, makeNotificationsSpy() as unknown as never);
    await bookings.book('t1', { sessionId: 's9', memberId: 'mp' });

    const svc = new SessionsService(stub as unknown as never, notificationsSpy as unknown as never);
    await svc.cancel('t1', 's9');

    expect(stub.sessions.get('s9')!.status).toBe(ClassSessionStatus.CANCELLED);
    const allBookings = [...stub.bookings.values()].filter((b) => b.sessionId === 's9');
    expect(allBookings.every((b) => b.status === BookingStatus.CANCELLED)).toBe(true);
    expect(notificationsSpy.dispatch).toHaveBeenCalledOnce();
    expect(notificationsSpy.dispatch.mock.calls[0][0]).toMatchObject({ category: 'class_session_cancelled' });
  });
});

describe('BookingsService', () => {
  let stub: ReturnType<typeof makeStub>;
  let svc: BookingsService;
  let notificationsSpy: ReturnType<typeof makeNotificationsSpy>;
  beforeEach(() => {
    stub = makeStub();
    stub.types.set('ct1', { id: 'ct1', tenantId: 't1', nameEn: 'Yoga', nameAr: 'يوغا', durationMin: 60, capacity: 2, dropInPriceAed: null, active: true });
    stub.sessions.set('s1', {
      id: 's1', tenantId: 't1', classTypeId: 'ct1', instructorId: null, recurrenceRuleId: null,
      startsAt: new Date('2099-01-01T06:00:00Z'), endsAt: new Date('2099-01-01T07:00:00Z'),
      status: ClassSessionStatus.SCHEDULED, capacityOverride: null, room: null,
    });
    stub.members.set('m1', { id: 'm1', tenantId: 't1', membershipStatus: MembershipStatus.ACTIVE });
    stub.members.set('m2', { id: 'm2', tenantId: 't1', membershipStatus: MembershipStatus.ACTIVE });
    stub.members.set('m3', { id: 'm3', tenantId: 't1', membershipStatus: MembershipStatus.ACTIVE });
    stub.members.set('m4', { id: 'm4', tenantId: 't1', membershipStatus: MembershipStatus.PENDING_PAYMENT });
    notificationsSpy = makeNotificationsSpy();
    svc = new BookingsService(stub as unknown as never, notificationsSpy as unknown as never);
  });

  it('books active member into open session', async () => {
    const b = await svc.book('t1', { sessionId: 's1', memberId: 'm1' });
    expect(b.status).toBe(BookingStatus.BOOKED);
  });

  it('rejects member without active membership and no drop-in', async () => {
    await expect(svc.book('t1', { sessionId: 's1', memberId: 'm4' })).rejects.toThrow();
  });

  it('waitlists when capacity reached', async () => {
    await svc.book('t1', { sessionId: 's1', memberId: 'm1' });
    await svc.book('t1', { sessionId: 's1', memberId: 'm2' });
    const third = await svc.book('t1', { sessionId: 's1', memberId: 'm3' });
    expect(third.status).toBe(BookingStatus.WAITLISTED);
    expect(third.position).toBe(1);
  });

  it('cancel promotes first waitlisted', async () => {
    const b1 = await svc.book('t1', { sessionId: 's1', memberId: 'm1' });
    await svc.book('t1', { sessionId: 's1', memberId: 'm2' });
    const b3 = await svc.book('t1', { sessionId: 's1', memberId: 'm3' });
    expect(b3.status).toBe(BookingStatus.WAITLISTED);
    await svc.cancel('t1', b1.id);
    const promoted = stub.bookings.get(b3.id)!;
    expect(promoted.status).toBe(BookingStatus.BOOKED);
  });

  it('check-in works on booked', async () => {
    const b = await svc.book('t1', { sessionId: 's1', memberId: 'm1' });
    const ci = await svc.checkIn('t1', b.id);
    expect(ci.status).toBe(BookingStatus.CHECKED_IN);
    expect(ci.checkedInAt).toBeInstanceOf(Date);
  });

  it('allows FROZEN member to book (they can attend while paused)', async () => {
    stub.members.set('mf', { id: 'mf', tenantId: 't1', membershipStatus: MembershipStatus.FROZEN });
    const b = await svc.book('t1', { sessionId: 's1', memberId: 'mf' });
    expect(b.status).toBe(BookingStatus.BOOKED);
  });

  it('rejects CANCELLED member when no drop-in price', async () => {
    stub.members.set('mc', { id: 'mc', tenantId: 't1', membershipStatus: MembershipStatus.CANCELLED });
    await expect(svc.book('t1', { sessionId: 's1', memberId: 'mc' })).rejects.toThrow();
  });

  it('allows CANCELLED member to book when class type has drop-in price', async () => {
    stub.types.set('ct2', { id: 'ct2', tenantId: 't1', nameEn: 'Drop-in', durationMin: 60, capacity: 5, dropInPriceAed: 75, active: true });
    stub.sessions.set('s2', {
      id: 's2', tenantId: 't1', classTypeId: 'ct2', instructorId: null, recurrenceRuleId: null,
      startsAt: new Date('2099-01-01T08:00:00Z'), endsAt: new Date('2099-01-01T09:00:00Z'),
      status: ClassSessionStatus.SCHEDULED, capacityOverride: null, room: null,
    });
    stub.members.set('mc', { id: 'mc', tenantId: 't1', membershipStatus: MembershipStatus.CANCELLED });
    const b = await svc.book('t1', { sessionId: 's2', memberId: 'mc' });
    expect(b.status).toBe(BookingStatus.BOOKED);
  });

  it('rejects booking against a cancelled session', async () => {
    stub.sessions.get('s1')!.status = ClassSessionStatus.CANCELLED;
    await expect(svc.book('t1', { sessionId: 's1', memberId: 'm1' })).rejects.toThrow();
  });

  it('rejects duplicate active booking for the same member + session', async () => {
    await svc.book('t1', { sessionId: 's1', memberId: 'm1' });
    await expect(svc.book('t1', { sessionId: 's1', memberId: 'm1' })).rejects.toThrow();
  });

  it('cross-tenant: cannot book a member from another tenant', async () => {
    stub.members.set('mx', { id: 'mx', tenantId: 't2', membershipStatus: MembershipStatus.ACTIVE });
    await expect(svc.book('t1', { sessionId: 's1', memberId: 'mx' })).rejects.toThrow();
  });

  it('cross-tenant: cannot book against a session from another tenant', async () => {
    stub.sessions.set('sx', {
      id: 'sx', tenantId: 't2', classTypeId: 'ct1', instructorId: null, recurrenceRuleId: null,
      startsAt: new Date('2099-01-01T06:00:00Z'), endsAt: new Date('2099-01-01T07:00:00Z'),
      status: ClassSessionStatus.SCHEDULED, capacityOverride: null, room: null,
    });
    await expect(svc.book('t1', { sessionId: 'sx', memberId: 'm1' })).rejects.toThrow();
  });

  it('cancelled booking can be re-booked (resurrected)', async () => {
    const b = await svc.book('t1', { sessionId: 's1', memberId: 'm1' });
    await svc.cancel('t1', b.id);
    const b2 = await svc.book('t1', { sessionId: 's1', memberId: 'm1' });
    expect(b2.id).toBe(b.id);
    expect(b2.status).toBe(BookingStatus.BOOKED);
  });

  it('check-in rejects cancelled booking', async () => {
    const b = await svc.book('t1', { sessionId: 's1', memberId: 'm1' });
    await svc.cancel('t1', b.id);
    await expect(svc.checkIn('t1', b.id)).rejects.toThrow();
  });

  it('rejects booking a session whose startsAt is in the past', async () => {
    stub.sessions.set('past1', {
      id: 'past1', tenantId: 't1', classTypeId: 'ct1', instructorId: null, recurrenceRuleId: null,
      startsAt: new Date('2020-01-01T06:00:00Z'), endsAt: new Date('2020-01-01T07:00:00Z'),
      status: ClassSessionStatus.SCHEDULED, capacityOverride: null, room: null,
    });
    await expect(svc.book('t1', { sessionId: 'past1', memberId: 'm1' })).rejects.toThrow(/past|already started/i);
  });

  it('blocks FROZEN member from booking during an active freeze window', async () => {
    stub.members.set('mfz', { id: 'mfz', tenantId: 't1', membershipStatus: MembershipStatus.FROZEN });
    stub.membershipFreeze.findFirst = vi.fn(async () => ({ id: 'frz1' })) as never;
    await expect(svc.book('t1', { sessionId: 's1', memberId: 'mfz' })).rejects.toThrow(/freeze/i);
  });

  it('dispatches waitlist promotion notification when cancellation frees a slot', async () => {
    stub.members.set('m1', { id: 'm1', tenantId: 't1', membershipStatus: MembershipStatus.ACTIVE });
    stub.members.set('m3', { id: 'm3', tenantId: 't1', membershipStatus: MembershipStatus.ACTIVE, phone: '+971500000003', preferredLocale: Locale.EN, fullName: 'M3' } as never);
    const b1 = await svc.book('t1', { sessionId: 's1', memberId: 'm1' });
    await svc.book('t1', { sessionId: 's1', memberId: 'm2' });
    const b3 = await svc.book('t1', { sessionId: 's1', memberId: 'm3' });
    expect(b3.status).toBe(BookingStatus.WAITLISTED);
    notificationsSpy.dispatch.mockClear();
    await svc.cancel('t1', b1.id);
    expect(notificationsSpy.dispatch).toHaveBeenCalledOnce();
    expect(notificationsSpy.dispatch.mock.calls[0][0]).toMatchObject({ category: 'class_waitlist_promoted' });
  });
});

describe('RecurrenceExpanderService', () => {
  it('materialises sessions for active recurrence', async () => {
    const stub = makeStub();
    stub.recs.set('r1', {
      id: 'r1', tenantId: 't1', classTypeId: 'ct1', instructorId: null,
      daysOfWeek: [1, 3, 5], // Mon Wed Fri
      startTime: '06:00', durationMin: 60, room: null,
      validFrom: new Date('2025-01-01T00:00:00Z'),
      validUntil: null,
      generatedThrough: null,
      active: true,
    });
    const svc = new RecurrenceExpanderService(stub as unknown as never);
    const now = new Date('2025-01-05T00:00:00Z'); // Sunday
    const res = await svc.expandAll(14, now);
    // 14 days from Sun Jan 5 → up to Jan 19. Mon/Wed/Fri occurrences: 6,8,10,13,15,17 = 6
    expect(res.created).toBe(6);
  });

  it('is idempotent across runs', async () => {
    const stub = makeStub();
    stub.recs.set('r1', {
      id: 'r1', tenantId: 't1', classTypeId: 'ct1', instructorId: null,
      daysOfWeek: [1], startTime: '06:00', durationMin: 60, room: null,
      validFrom: new Date('2025-01-01T00:00:00Z'),
      validUntil: null,
      generatedThrough: null,
      active: true,
    });
    const svc = new RecurrenceExpanderService(stub as unknown as never);
    const now = new Date('2025-01-05T00:00:00Z');
    const a = await svc.expandAll(14, now);
    const b = await svc.expandAll(14, now);
    expect(a.created).toBeGreaterThan(0);
    expect(b.created).toBe(0);
  });
});
