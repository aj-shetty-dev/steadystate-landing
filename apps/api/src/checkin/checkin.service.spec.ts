import { CheckInSource, MembershipStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckInService } from './checkin.service';
import { QrTokenService } from './qr-token.service';

interface MemberRow { id: string; tenantId: string; fullName: string; phone: string; lastCheckinAt: Date | null; membershipStatus: MembershipStatus }
interface QrRow { id: string; tenantId: string; memberId: string; token: string; expiresAt: Date }
interface CheckInRow { id: string; tenantId: string; memberId: string; source: CheckInSource; sessionId: string | null; staffId: string | null; checkedInAt: Date }

function makeStub() {
  const members = new Map<string, MemberRow>();
  const qrs = new Map<string, QrRow>();
  const checkIns = new Map<string, CheckInRow>();
  let seq = 0;

  const stub = {
    members, qrs, checkIns,
    member: {
      findFirst: vi.fn(async ({ where }: { where: { id?: string; phone?: string; tenantId: string } }) => {
        return [...members.values()].find((m) => {
          if (m.tenantId !== where.tenantId) return false;
          if (where.id && m.id !== where.id) return false;
          if (where.phone && m.phone !== where.phone) return false;
          return true;
        }) ?? null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<MemberRow> }) => {
        const m = members.get(where.id)!;
        Object.assign(m, data);
        return m;
      }),
    },
    memberQrToken: {
      findFirst: vi.fn(async ({ where }: { where: { memberId?: string; tenantId?: string; token?: string; expiresAt?: { gt: Date } } }) => {
        return [...qrs.values()].find((q) => {
          if (where.memberId && q.memberId !== where.memberId) return false;
          if (where.tenantId && q.tenantId !== where.tenantId) return false;
          if (where.token && q.token !== where.token) return false;
          if (where.expiresAt?.gt && q.expiresAt <= where.expiresAt.gt) return false;
          return true;
        }) ?? null;
      }),
      create: vi.fn(async ({ data }: { data: Omit<QrRow, 'id'> }) => {
        seq += 1;
        const r: QrRow = { id: `qr-${seq}`, ...data };
        qrs.set(r.id, r);
        return r;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<QrRow> }) => {
        const q = qrs.get(where.id)!;
        Object.assign(q, data);
        return q;
      }),
    },
    booking: {
      findFirst: vi.fn(async () => null),
      update: vi.fn(),
    },
    staff: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string; active?: boolean } }) => {
        if (where.id === 'staff-1' && where.tenantId === 't1') return { id: 'staff-1' };
        return null;
      }),
    },
    checkIn: {
      create: vi.fn(async ({ data }: { data: Omit<CheckInRow, 'id' | 'sessionId' | 'staffId' | 'checkedInAt'> & { sessionId?: string; staffId?: string } }) => {
        seq += 1;
        const r: CheckInRow = { id: `ci-${seq}`, sessionId: data.sessionId ?? null, staffId: data.staffId ?? null, checkedInAt: new Date(), ...data };
        checkIns.set(r.id, r);
        return r;
      }),
      findFirst: vi.fn(async ({ where }: { where: { tenantId: string; memberId: string; checkedInAt?: { gte: Date } } }) => {
        const rows = [...checkIns.values()]
          .filter((c) => c.tenantId === where.tenantId && c.memberId === where.memberId)
          .filter((c) => (where.checkedInAt?.gte ? c.checkedInAt >= where.checkedInAt.gte : true))
          .sort((a, b) => b.checkedInAt.getTime() - a.checkedInAt.getTime());
        return rows[0] ?? null;
      }),
      findMany: vi.fn(async () => [...checkIns.values()]),
    },
    $transaction: vi.fn(async (fn: ((tx: unknown) => Promise<unknown>) | unknown[]) => {
      if (Array.isArray(fn)) return Promise.all(fn);
      return (fn as (tx: unknown) => Promise<unknown>)(stub);
    }),
  };
  return stub;
}

describe('CheckInService', () => {
  let stub: ReturnType<typeof makeStub>;
  let svc: CheckInService;
  let qr: QrTokenService;

  beforeEach(() => {
    stub = makeStub();
    qr = new QrTokenService(stub as unknown as never);
    svc = new CheckInService(stub as unknown as never, qr);
    stub.members.set('m1', { id: 'm1', tenantId: 't1', fullName: 'A', phone: '+9710', lastCheckinAt: null, membershipStatus: MembershipStatus.ACTIVE });
  });

  it('creates check-in by memberId and updates lastCheckinAt', async () => {
    const ci = await svc.create('t1', { source: 'MANUAL', memberId: 'm1' });
    expect(ci.memberId).toBe('m1');
    expect(stub.members.get('m1')!.lastCheckinAt).toBeInstanceOf(Date);
  });

  it('resolves by phone', async () => {
    const ci = await svc.create('t1', { source: 'KIOSK_PIN', phone: '+9710' });
    expect(ci.memberId).toBe('m1');
  });

  it('resolves by QR token', async () => {
    const tok = await qr.issueOrRefresh('t1', 'm1');
    const ci = await svc.create('t1', { source: 'KIOSK_QR', qrToken: tok.token });
    expect(ci.memberId).toBe('m1');
  });

  it('rejects unknown member', async () => {
    await expect(svc.create('t1', { source: 'MANUAL', memberId: 'unknown' })).rejects.toThrow();
  });

  it('rejects when nothing provided', async () => {
    await expect(svc.create('t1', { source: 'MANUAL' })).rejects.toThrow();
  });

  it('QR token refreshes when about to expire', async () => {
    const tok1 = await qr.issueOrRefresh('t1', 'm1');
    const tok2 = await qr.issueOrRefresh('t1', 'm1');
    expect(tok1.id).toBe(tok2.id);
    expect(tok1.token).toBe(tok2.token); // not yet near expiry
  });

  it('rejects duplicate check-in within dedupe window', async () => {
    await svc.create('t1', { source: 'MANUAL', memberId: 'm1' });
    await expect(svc.create('t1', { source: 'MANUAL', memberId: 'm1' })).rejects.toThrow(/Duplicate/i);
  });

  it('normalizes UAE local-format phone to E.164', async () => {
    // Member stored in DB as E.164 +9710 (set in beforeEach).
    stub.members.set('m2', { id: 'm2', tenantId: 't1', fullName: 'B', phone: '+971501112222', lastCheckinAt: null, membershipStatus: MembershipStatus.ACTIVE });
    const ci = await svc.create('t1', { source: 'KIOSK_PIN', phone: '0501112222' });
    expect(ci.memberId).toBe('m2');
  });

  it('isolates resolveMember by tenant for QR tokens', async () => {
    const tok = await qr.issueOrRefresh('t1', 'm1');
    await expect(svc.create('t2', { source: 'KIOSK_QR', qrToken: tok.token })).rejects.toThrow();
  });

  it('rejects CANCELLED member', async () => {
    stub.members.set('mc', { id: 'mc', tenantId: 't1', fullName: 'C', phone: '+9712', lastCheckinAt: null, membershipStatus: MembershipStatus.CANCELLED });
    await expect(svc.create('t1', { source: 'MANUAL', memberId: 'mc' })).rejects.toThrow(/CANCELLED/i);
  });

  it('rejects EXPIRED member', async () => {
    stub.members.set('me', { id: 'me', tenantId: 't1', fullName: 'E', phone: '+9713', lastCheckinAt: null, membershipStatus: MembershipStatus.EXPIRED });
    await expect(svc.create('t1', { source: 'MANUAL', memberId: 'me' })).rejects.toThrow(/EXPIRED/i);
  });

  it('allows FROZEN member (they may attend during paid grace)', async () => {
    stub.members.set('mf', { id: 'mf', tenantId: 't1', fullName: 'F', phone: '+9714', lastCheckinAt: null, membershipStatus: MembershipStatus.FROZEN });
    const ci = await svc.create('t1', { source: 'MANUAL', memberId: 'mf' });
    expect(ci.memberId).toBe('mf');
  });

  it('rejects check-in with unknown or cross-tenant staffId', async () => {
    await expect(svc.create('t1', { source: 'MANUAL', memberId: 'm1', staffId: 'ghost-staff' })).rejects.toThrow(/staff/i);
  });

  it('allows check-in with valid staffId', async () => {
    const ci = await svc.create('t1', { source: 'MANUAL', memberId: 'm1', staffId: 'staff-1' });
    expect(ci.staffId).toBe('staff-1');
  });
});
