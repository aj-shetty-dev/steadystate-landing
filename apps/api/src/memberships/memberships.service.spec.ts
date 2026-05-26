import { FreezeStatus, MembershipStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MembershipsService } from './memberships.service';

interface Plan {
  id: string;
  tenantId: string;
  durationDays: number;
  maxFreezeDays: number;
  active: boolean;
  nameEn?: string;
  nameAr?: string | null;
}
interface Member { id: string; tenantId: string; membershipStatus: MembershipStatus; membershipExpiresAt: Date | null; phone?: string | null; preferredLocale?: string; fullName?: string }
interface Freeze { id: string; membershipId: string; tenantId: string; startDate: Date; endDate: Date; daysUsed: number; status: FreezeStatus }
interface MembershipRow {
  id: string;
  tenantId: string;
  memberId: string;
  planId: string;
  startDate: Date;
  endDate: Date;
  status: MembershipStatus;
  cancellationReason: string | null;
  cancelAtPeriodEnd: boolean;
  frozenUntil: Date | null;
  signedAt: Date | null;
  signatureData: unknown;
  lastReminderSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  member?: Member;
  plan?: Plan;
  freezes?: Freeze[];
}

function makeStub() {
  const plans = new Map<string, Plan>();
  const members = new Map<string, Member>();
  const memberships = new Map<string, MembershipRow>();
  const freezes = new Map<string, Freeze>();
  let seq = 0;

  const stub = {
    plans,
    members,
    memberships,
    freezes,
    member: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string } }) => {
        const m = members.get(where.id);
        return m && m.tenantId === where.tenantId ? m : null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Member> }) => {
        const m = members.get(where.id);
        if (!m) throw new Error('member not found');
        Object.assign(m, data);
        return m;
      }),
    },
    membershipPlan: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string; active?: boolean } }) => {
        const p = plans.get(where.id);
        if (!p || p.tenantId !== where.tenantId) return null;
        if (where.active && !p.active) return null;
        return p;
      }),
    },
    membership: {
      findFirst: vi.fn(async ({ where, include }: { where: { id?: string; tenantId: string; memberId?: string; planId?: string; status?: MembershipStatus | { in?: MembershipStatus[] }; endDate?: { gt?: Date }; startDate?: { lt?: Date } }; include?: Record<string, boolean | { orderBy?: unknown }> }) => {
        if (where.id) {
          const m = memberships.get(where.id);
          if (!m || m.tenantId !== where.tenantId) return null;
          const out: MembershipRow = { ...m };
          if (include?.member) out.member = members.get(m.memberId);
          if (include?.plan) out.plan = plans.get(m.planId);
          if (include?.freezes) out.freezes = [...freezes.values()].filter((f) => f.membershipId === m.id);
          return out;
        }
        // overlap-check shape
        const match = [...memberships.values()].find((m) => {
          if (m.tenantId !== where.tenantId) return false;
          if (where.memberId && m.memberId !== where.memberId) return false;
          if (where.planId && m.planId !== where.planId) return false;
          if (where.status && typeof where.status === 'object' && where.status.in && !where.status.in.includes(m.status)) return false;
          if (where.endDate?.gt && m.endDate.getTime() <= where.endDate.gt.getTime()) return false;
          if (where.startDate?.lt && m.startDate.getTime() >= where.startDate.lt.getTime()) return false;
          return true;
        });
        return match ?? null;
      }),
      findMany: vi.fn(async ({ where }: { where: { status?: MembershipStatus | { in?: MembershipStatus[] }; endDate?: { lte?: Date; gte?: Date }; lastReminderSentAt?: null } }) => {
        return [...memberships.values()].filter((m) => {
          if (where.status) {
            if (typeof where.status === 'string' && m.status !== where.status) return false;
            if (typeof where.status === 'object' && where.status.in && !where.status.in.includes(m.status)) return false;
          }
          if (where.endDate?.gte && m.endDate.getTime() < where.endDate.gte.getTime()) return false;
          if (where.endDate?.lte && m.endDate.getTime() > where.endDate.lte.getTime()) return false;
          if (where.lastReminderSentAt === null && m.lastReminderSentAt !== null) return false;
          return true;
        }).map((m) => ({
          ...m,
          member: members.get(m.memberId),
          plan: plans.get(m.planId),
        }));
      }),
      count: vi.fn(async ({ where }: { where: { tenantId: string } }) => {
        return [...memberships.values()].filter((m) => m.tenantId === where.tenantId).length;
      }),
      create: vi.fn(async ({ data }: { data: Omit<MembershipRow, 'id' | 'createdAt' | 'updatedAt' | 'cancellationReason' | 'cancelAtPeriodEnd' | 'frozenUntil' | 'signedAt' | 'signatureData' | 'lastReminderSentAt'> & Partial<MembershipRow> }) => {
        const id = `mem_${++seq}`;
        const row: MembershipRow = {
          id, ...data,
          cancellationReason: data.cancellationReason ?? null,
          cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
          frozenUntil: data.frozenUntil ?? null,
          signedAt: data.signedAt ?? null,
          signatureData: data.signatureData ?? null,
          lastReminderSentAt: null,
          createdAt: new Date(), updatedAt: new Date(),
        };
        memberships.set(id, row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<MembershipRow> }) => {
        const row = memberships.get(where.id);
        if (!row) throw new Error('membership not found');
        Object.assign(row, data);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: { in: string[] } }; data: Partial<MembershipRow> }) => {
        let count = 0;
        for (const id of where.id.in) {
          const m = memberships.get(id);
          if (m) { Object.assign(m, data); count++; }
        }
        return { count };
      }),
    },
    membershipFreeze: {
      findFirst: vi.fn(async ({ where }: { where: { membershipId: string; tenantId: string; status: FreezeStatus; startDate: { lt: Date }; endDate: { gt: Date } } }) => {
        return [...freezes.values()].find((f) => {
          if (f.membershipId !== where.membershipId) return false;
          if (f.status !== where.status) return false;
          if (f.startDate >= where.startDate.lt) return false;
          if (f.endDate <= where.endDate.gt) return false;
          return true;
        }) ?? null;
      }),
      create: vi.fn(async ({ data }: { data: Omit<Freeze, 'id'> }) => {
        const id = `frz_${++seq}`;
        const row: Freeze = { id, ...data };
        freezes.set(id, row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Freeze> }) => {
        const f = freezes.get(where.id);
        if (!f) throw new Error('freeze not found');
        Object.assign(f, data);
        return f;
      }),
    },
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === 'function') return (arg as (tx: typeof stub) => unknown)(stub);
      return Promise.all(arg as Promise<unknown>[]);
    }),
  };
  return stub;
}

describe('MembershipsService', () => {
  let stub: ReturnType<typeof makeStub>;
  let svc: MembershipsService;
  let notificationsSpy: { dispatch: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    stub = makeStub();
    notificationsSpy = { dispatch: vi.fn().mockResolvedValue({ messageId: 'msg_1', channel: 'WHATSAPP' }) };
    svc = new MembershipsService(stub as never, notificationsSpy as never);
    stub.members.set('mem1', { id: 'mem1', tenantId: 't', membershipStatus: MembershipStatus.PENDING, membershipExpiresAt: null });
    stub.plans.set('plan1', { id: 'plan1', tenantId: 't', durationDays: 30, maxFreezeDays: 14, active: true });
    stub.plans.set('plan2', { id: 'plan2', tenantId: 't', durationDays: 30, maxFreezeDays: 14, active: true });
  });

  it('create sets endDate = startDate + durationDays and PENDING_PAYMENT by default', async () => {
    const out = await svc.create('t', {
      memberId: 'mem1', planId: 'plan1', startDate: '2026-05-01T00:00:00Z',
    });
    expect(out.status).toBe(MembershipStatus.PENDING_PAYMENT);
    expect(out.endDate.toISOString()).toBe('2026-05-31T00:00:00.000Z');
  });

  it('create with status ACTIVE activates immediately and updates member', async () => {
    const out = await svc.create('t', { memberId: 'mem1', planId: 'plan1', status: 'ACTIVE' });
    expect(out.status).toBe(MembershipStatus.ACTIVE);
    expect(stub.members.get('mem1')!.membershipStatus).toBe(MembershipStatus.ACTIVE);
  });

  it('freeze extends endDate, deducts quota, sets FROZEN', async () => {
    const m = await svc.create('t', { memberId: 'mem1', planId: 'plan1', startDate: '2026-05-01T00:00:00Z', status: 'ACTIVE' });
    const originalEnd = m.endDate;
    await svc.freeze('t', m.id, {
      startDate: '2026-05-10T00:00:00Z', endDate: '2026-05-15T00:00:00Z', reason: 'travel',
    }, 'user-1');
    const updated = stub.memberships.get(m.id)!;
    expect(updated.status).toBe(MembershipStatus.FROZEN);
    expect(updated.endDate.getTime()).toBe(originalEnd.getTime() + 5 * 24 * 60 * 60 * 1000);
  });

  it('freeze rejects when quota exceeded', async () => {
    const m = await svc.create('t', { memberId: 'mem1', planId: 'plan1', status: 'ACTIVE' });
    await expect(
      svc.freeze('t', m.id, {
        startDate: '2026-05-10T00:00:00Z', endDate: '2026-06-01T00:00:00Z', // 22 days > 14
      }, 'user-1'),
    ).rejects.toThrow(/quota/i);
  });

  it('freeze rejects overlapping active freeze dates', async () => {
    const m = await svc.create('t', { memberId: 'mem1', planId: 'plan1', status: 'ACTIVE' });
    await svc.freeze('t', m.id, { startDate: '2026-05-10T00:00:00Z', endDate: '2026-05-13T00:00:00Z' }, 'user-1');
    await expect(
      svc.freeze('t', m.id, { startDate: '2026-05-12T00:00:00Z', endDate: '2026-05-14T00:00:00Z' }, 'user-1'),
    ).rejects.toThrow(/freeze already exists/i);
  });

  it('activate throws on CANCELLED membership', async () => {
    const m = await svc.create('t', { memberId: 'mem1', planId: 'plan1', status: 'ACTIVE' });
    await svc.cancel('t', m.id, 'test');
    await expect(svc.activate('t', m.id)).rejects.toThrow(/CANCELLED/);
  });

  it('activate throws on EXPIRED membership', async () => {
    const m = await svc.create('t', { memberId: 'mem1', planId: 'plan1', startDate: '2026-01-01T00:00:00Z', status: 'ACTIVE' });
    stub.memberships.get(m.id)!.status = MembershipStatus.EXPIRED;
    await expect(svc.activate('t', m.id)).rejects.toThrow(/EXPIRED/);
  });

  it('unfreeze restores ACTIVE and marks freeze COMPLETED', async () => {
    const m = await svc.create('t', { memberId: 'mem1', planId: 'plan1', status: 'ACTIVE' });
    await svc.freeze('t', m.id, {
      startDate: '2026-05-10T00:00:00Z', endDate: '2026-05-12T00:00:00Z',
    }, 'user-1');
    await svc.unfreeze('t', m.id);
    const updated = stub.memberships.get(m.id)!;
    expect(updated.status).toBe(MembershipStatus.ACTIVE);
    const freeze = [...stub.freezes.values()].find((f) => f.membershipId === m.id);
    expect(freeze!.status).toBe(FreezeStatus.COMPLETED);
  });

  it('cancel sets CANCELLED on both membership and member', async () => {
    const m = await svc.create('t', { memberId: 'mem1', planId: 'plan1', status: 'ACTIVE' });
    await svc.cancel('t', m.id, 'requested by member');
    expect(stub.memberships.get(m.id)!.status).toBe(MembershipStatus.CANCELLED);
    expect(stub.members.get('mem1')!.membershipStatus).toBe(MembershipStatus.CANCELLED);
  });

  describe('overlap protection', () => {
    it('rejects creating a second ACTIVE membership while one is still active', async () => {
      await svc.create('t', {
        memberId: 'mem1', planId: 'plan1',
        startDate: '2026-05-01T00:00:00Z',
        status: 'ACTIVE',
      });
      await expect(
        svc.create('t', {
          memberId: 'mem1', planId: 'plan1',
          startDate: '2026-05-15T00:00:00Z',
          status: 'ACTIVE',
        }),
      ).rejects.toThrow(/overlapping/i);
    });

    it('allows a member to hold two different concurrent plan memberships (Gym + Yoga)', async () => {
      await svc.create('t', {
        memberId: 'mem1', planId: 'plan1',
        startDate: '2026-05-01T00:00:00Z',
        status: 'ACTIVE',
      });
      await expect(
        svc.create('t', {
          memberId: 'mem1', planId: 'plan2',
          startDate: '2026-05-01T00:00:00Z',
          status: 'ACTIVE',
        }),
      ).resolves.toMatchObject({ status: MembershipStatus.ACTIVE });
    });

    it('allows creating a new membership after the previous endDate', async () => {
      const first = await svc.create('t', {
        memberId: 'mem1', planId: 'plan1',
        startDate: '2026-01-01T00:00:00Z',
        status: 'ACTIVE',
      });
      // First ends 2026-01-31. New starts after that.
      void first;
      await expect(
        svc.create('t', {
          memberId: 'mem1', planId: 'plan1',
          startDate: '2026-02-15T00:00:00Z',
          status: 'ACTIVE',
        }),
      ).resolves.toMatchObject({ status: MembershipStatus.ACTIVE });
    });
  });

  describe('lifecycle notifications', () => {
    beforeEach(() => {
      stub.members.set('mem1', {
        id: 'mem1', tenantId: 't',
        membershipStatus: MembershipStatus.PENDING,
        membershipExpiresAt: null,
        phone: '+971501234567',
        preferredLocale: 'EN',
      } as never);
    });

    it('dispatches membership_started when creating an ACTIVE membership', async () => {
      notificationsSpy.dispatch.mockClear();
      await svc.create('t', { memberId: 'mem1', planId: 'plan1', status: 'ACTIVE' });
      expect(notificationsSpy.dispatch).toHaveBeenCalledOnce();
      expect(notificationsSpy.dispatch.mock.calls[0][0]).toMatchObject({ category: 'membership_started' });
    });

    it('does not dispatch when membership is PENDING_PAYMENT', async () => {
      notificationsSpy.dispatch.mockClear();
      await svc.create('t', { memberId: 'mem1', planId: 'plan1' });
      expect(notificationsSpy.dispatch).not.toHaveBeenCalled();
    });

    it('dispatches membership_frozen and membership_unfrozen', async () => {
      const m = await svc.create('t', { memberId: 'mem1', planId: 'plan1', status: 'ACTIVE' });
      notificationsSpy.dispatch.mockClear();
      await svc.freeze('t', m.id, {
        startDate: '2026-05-10T00:00:00Z', endDate: '2026-05-15T00:00:00Z',
      }, 'user-1');
      await svc.unfreeze('t', m.id);
      const categories = notificationsSpy.dispatch.mock.calls.map((c) => (c[0] as { category: string }).category);
      expect(categories).toContain('membership_frozen');
      expect(categories).toContain('membership_unfrozen');
    });

    it('dispatches membership_cancelled on cancel', async () => {
      const m = await svc.create('t', { memberId: 'mem1', planId: 'plan1', status: 'ACTIVE' });
      notificationsSpy.dispatch.mockClear();
      await svc.cancel('t', m.id, 'no longer needed');
      expect(notificationsSpy.dispatch).toHaveBeenCalledOnce();
      expect(notificationsSpy.dispatch.mock.calls[0][0]).toMatchObject({ category: 'membership_cancelled' });
    });
  });

  it('expireDue flips overdue ACTIVE → EXPIRED', async () => {
    const m = await svc.create('t', { memberId: 'mem1', planId: 'plan1', startDate: '2026-01-01T00:00:00Z', status: 'ACTIVE' });
    void m;
    const out = await svc.expireDue(new Date('2026-12-01T00:00:00Z'));
    expect(out.expired).toBe(1);
    expect(stub.members.get('mem1')!.membershipStatus).toBe(MembershipStatus.EXPIRED);
  });

  describe('list() — pagination + filters', () => {
    it('returns paginated shape with items + total', async () => {
      const result = await svc.list('t');
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('pageSize');
    });

    it('passes memberId to Prisma where clause when provided', async () => {
      await svc.list('t', undefined, 'mem1');

      expect(stub.membership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 't', memberId: 'mem1' }),
        }),
      );
    });

    it('does not include memberId in where clause when not provided', async () => {
      await svc.list('t');

      const call = stub.membership.findMany.mock.calls[0] as [{ where: Record<string, unknown> }];
      expect(call[0].where).not.toHaveProperty('memberId');
    });

    it('combines memberId and status filters when both are provided', async () => {
      await svc.list('t', MembershipStatus.ACTIVE, 'mem1');

      expect(stub.membership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 't',
            memberId: 'mem1',
            status: MembershipStatus.ACTIVE,
          }),
        }),
      );
    });

    it('applies search filter on member relation', async () => {
      await svc.list('t', undefined, undefined, 'Ahmed', 1, 25);

      expect(stub.membership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            member: expect.objectContaining({ OR: expect.any(Array) }),
          }),
        }),
      );
    });
  });

  describe('sendExpiryReminders()', () => {
    it('sends a reminder and marks lastReminderSentAt', async () => {
      stub.members.set('mem1', {
        id: 'mem1', tenantId: 't',
        membershipStatus: MembershipStatus.ACTIVE,
        membershipExpiresAt: null,
        phone: '+971501234567',
        preferredLocale: 'EN',
      } as never);

      const now = new Date('2026-05-23T09:00:00Z');
      const expiringSoon = new Date('2026-05-29T00:00:00Z');

      const m = await svc.create('t', {
        memberId: 'mem1', planId: 'plan1',
        startDate: '2026-04-29T00:00:00Z',
        status: 'ACTIVE',
      });
      // Override endDate to be within the window
      stub.memberships.get(m.id)!.endDate = expiringSoon;
      stub.memberships.get(m.id)!.lastReminderSentAt = null;

      notificationsSpy.dispatch.mockClear();
      const result = await svc.sendExpiryReminders(now, 7);
      expect(result.sent).toBe(1);
      expect(result.skipped).toBe(0);
      expect(notificationsSpy.dispatch).toHaveBeenCalledOnce();
      expect(stub.memberships.get(m.id)!.lastReminderSentAt).toEqual(now);
    });

    it('skips members with no phone', async () => {
      // mem1 has no phone in the base stub
      const m = await svc.create('t', {
        memberId: 'mem1', planId: 'plan1',
        startDate: '2026-04-29T00:00:00Z',
        status: 'ACTIVE',
      });
      const now = new Date('2026-05-23T09:00:00Z');
      stub.memberships.get(m.id)!.endDate = new Date('2026-05-29T00:00:00Z');
      stub.memberships.get(m.id)!.lastReminderSentAt = null;

      const result = await svc.sendExpiryReminders(now, 7);
      expect(result.skipped).toBe(1);
      expect(notificationsSpy.dispatch).not.toHaveBeenCalled();
    });

    it('skips memberships that already have lastReminderSentAt', async () => {
      stub.members.set('mem1', {
        id: 'mem1', tenantId: 't',
        membershipStatus: MembershipStatus.ACTIVE,
        membershipExpiresAt: null,
        phone: '+971501234567',
        preferredLocale: 'EN',
      } as never);

      const m = await svc.create('t', {
        memberId: 'mem1', planId: 'plan1',
        startDate: '2026-04-29T00:00:00Z',
        status: 'ACTIVE',
      });
      const now = new Date('2026-05-23T09:00:00Z');
      stub.memberships.get(m.id)!.endDate = new Date('2026-05-29T00:00:00Z');
      stub.memberships.get(m.id)!.lastReminderSentAt = new Date('2026-05-20T00:00:00Z');

      const result = await svc.sendExpiryReminders(now, 7);
      expect(result.sent).toBe(0);
    });
  });

  describe('changePlan()', () => {
    beforeEach(() => {
      stub.plans.set('plan2', { id: 'plan2', tenantId: 't', durationDays: 60, maxFreezeDays: 20, active: true });
    });

    it('cancels the current membership and creates a new ACTIVE one on the new plan', async () => {
      const original = await svc.create('t', {
        memberId: 'mem1',
        planId: 'plan1',
        startDate: '2026-05-01T00:00:00Z',
        status: 'ACTIVE',
      });

      const result = await svc.changePlan('t', original.id, { newPlanId: 'plan2' });

      // Old membership is cancelled
      expect(stub.memberships.get(original.id)!.status).toBe(MembershipStatus.CANCELLED);
      // New membership is active on the new plan
      expect(result.status).toBe(MembershipStatus.ACTIVE);
      expect(result.planId).toBe('plan2');
      // endDate = startDate + 60 days
      const diffDays = Math.round(
        (result.endDate.getTime() - result.startDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      expect(diffDays).toBe(60);
      // Member record updated
      expect(stub.members.get('mem1')!.membershipStatus).toBe(MembershipStatus.ACTIVE);
    });

    it('respects an explicit startDate', async () => {
      const original = await svc.create('t', {
        memberId: 'mem1',
        planId: 'plan1',
        status: 'ACTIVE',
      });

      const result = await svc.changePlan('t', original.id, {
        newPlanId: 'plan2',
        startDate: '2026-06-01T00:00:00Z',
      });

      expect(result.startDate.toISOString()).toBe('2026-06-01T00:00:00.000Z');
      expect(result.endDate.toISOString()).toBe('2026-07-31T00:00:00.000Z');
    });

    it('throws BadRequestException when changing a CANCELLED membership', async () => {
      const original = await svc.create('t', { memberId: 'mem1', planId: 'plan1', status: 'ACTIVE' });
      await svc.cancel('t', original.id);

      await expect(svc.changePlan('t', original.id, { newPlanId: 'plan2' })).rejects.toThrow(/CANCELLED/);
    });

    it('throws BadRequestException when changing a FROZEN membership', async () => {
      const original = await svc.create('t', { memberId: 'mem1', planId: 'plan1', status: 'ACTIVE' });
      await svc.freeze('t', original.id, { startDate: '2026-05-10T00:00:00Z', endDate: '2026-05-13T00:00:00Z' }, 'u1');
      await expect(svc.changePlan('t', original.id, { newPlanId: 'plan2' })).rejects.toThrow(/Unfreeze/);
    });

    it('throws NotFoundException when the new plan does not exist in the tenant', async () => {
      const original = await svc.create('t', { memberId: 'mem1', planId: 'plan1', status: 'ACTIVE' });

      await expect(svc.changePlan('t', original.id, { newPlanId: 'plan_other_tenant' })).rejects.toThrow(/not found/i);
    });

    it('dispatches membership_plan_changed notification', async () => {
      stub.members.set('mem1', {
        id: 'mem1', tenantId: 't',
        membershipStatus: MembershipStatus.PENDING,
        membershipExpiresAt: null,
        phone: '+971501234567',
        preferredLocale: 'EN',
        fullName: 'Ali',
      } as never);
      const original = await svc.create('t', { memberId: 'mem1', planId: 'plan1', status: 'ACTIVE' });
      notificationsSpy.dispatch.mockClear();
      await svc.changePlan('t', original.id, { newPlanId: 'plan2' });
      expect(notificationsSpy.dispatch).toHaveBeenCalledOnce();
      expect(notificationsSpy.dispatch.mock.calls[0][0]).toMatchObject({ category: 'membership_plan_changed' });
    });
  });
});
