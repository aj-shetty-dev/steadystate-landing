import { LeadActivityType, LeadStage } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeadsService } from './leads.service';

interface LeadRow { id: string; tenantId: string; fullName: string; phone: string; email: string | null; stage: LeadStage; convertedMemberId: string | null; createdAt: Date; updatedAt: Date; activities?: unknown[] }
interface MemberRow { id: string; tenantId: string; fullName: string; phone: string; email: string | null; source: string }
interface PlanRow { id: string; tenantId: string; durationDays: number; active: boolean }

function makeStub() {
  const leads = new Map<string, LeadRow>();
  const members = new Map<string, MemberRow>();
  const plans = new Map<string, PlanRow>();
  const memberships = new Map<string, unknown>();
  const activities: Array<{ id: string; leadId: string; type: LeadActivityType; summary: string }> = [];
  let seq = 0;

  const stub = {
    leads, members, plans, memberships, activities,
    lead: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string } }) => {
        const l = leads.get(where.id);
        if (!l || l.tenantId !== where.tenantId) return null;
        return { ...l, activities: activities.filter((a) => a.leadId === l.id) };
      }),
      findMany: vi.fn(async () => [...leads.values()]),
      create: vi.fn(async ({ data }: { data: Partial<LeadRow> & { tenantId: string; fullName: string; phone: string } }) => {
        seq += 1;
        const row: LeadRow = {
          id: `lead-${seq}`,
          tenantId: data.tenantId,
          fullName: data.fullName,
          phone: data.phone,
          email: data.email ?? null,
          stage: data.stage ?? LeadStage.NEW,
          convertedMemberId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        leads.set(row.id, row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<LeadRow> }) => {
        const l = leads.get(where.id)!;
        Object.assign(l, data, { updatedAt: new Date() });
        return l;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { stage?: { in: LeadStage[] }; updatedAt?: { lt: Date } }; data: Partial<LeadRow> }) => {
        let count = 0;
        for (const l of leads.values()) {
          if (where.stage && !where.stage.in.includes(l.stage)) continue;
          if (where.updatedAt && l.updatedAt >= where.updatedAt.lt) continue;
          Object.assign(l, data);
          count += 1;
        }
        return { count };
      }),
    },
    leadActivity: {
      create: vi.fn(async ({ data }: { data: { tenantId: string; leadId: string; type: LeadActivityType; summary: string } }) => {
        seq += 1;
        const a = { id: `act-${seq}`, ...data };
        activities.push(a);
        return a;
      }),
    },
    member: {
      create: vi.fn(async ({ data }: { data: Omit<MemberRow, 'id'> }) => {
        seq += 1;
        const m: MemberRow = { id: `mem-${seq}`, ...data };
        members.set(m.id, m);
        return m;
      }),
      findFirst: vi.fn(async ({ where }: { where: { tenantId: string; phone: string } }) => {
        for (const m of members.values()) {
          if (m.tenantId === where.tenantId && m.phone === where.phone) return { id: m.id };
        }
        return null;
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
      create: vi.fn(async ({ data }: { data: { tenantId: string; memberId: string; planId: string; startDate: Date; endDate: Date; status: string } }) => {
        seq += 1;
        const m = { id: `ms-${seq}`, ...data };
        memberships.set(m.id, m);
        return m;
      }),
    },
    $transaction: vi.fn(async (fn: ((tx: unknown) => Promise<unknown>) | unknown[]) => {
      if (Array.isArray(fn)) return Promise.all(fn);
      return (fn as (tx: unknown) => Promise<unknown>)(stub);
    }),
  };
  return stub;
}

describe('LeadsService', () => {
  let stub: ReturnType<typeof makeStub>;
  let svc: LeadsService;
  let notificationsSpy: { dispatch: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    stub = makeStub();
    notificationsSpy = { dispatch: vi.fn(async () => ({ messageId: 'm1', channel: 'WHATSAPP' as const })) };
    svc = new LeadsService(stub as unknown as never, notificationsSpy as unknown as never);
  });

  it('creates a lead with default stage NEW', async () => {
    const l = await svc.create('t1', { fullName: 'Ali', phone: '+971500000000' });
    expect(l.stage).toBe(LeadStage.NEW);
  });

  it('transitions NEW -> CONTACTED on first activity', async () => {
    const l = await svc.create('t1', { fullName: 'Ali', phone: '+971500000000' });
    await svc.addActivity('t1', l.id, 'u1', { type: 'CALL', summary: 'rang' });
    const updated = stub.leads.get(l.id)!;
    expect(updated.stage).toBe(LeadStage.CONTACTED);
  });

  it('converts lead to member with membership when plan supplied', async () => {
    stub.plans.set('p1', { id: 'p1', tenantId: 't1', durationDays: 30, active: true });
    const l = await svc.create('t1', { fullName: 'Ali', phone: '+971500000000' });
    const r = await svc.convert('t1', l.id, { planId: 'p1' });
    expect(r.memberId).toBeDefined();
    expect(r.membershipId).toBeDefined();
    const updated = stub.leads.get(l.id)!;
    expect(updated.stage).toBe(LeadStage.CONVERTED);
    expect(updated.convertedMemberId).toBe(r.memberId);
  });

  it('refuses to re-convert', async () => {
    stub.plans.set('p1', { id: 'p1', tenantId: 't1', durationDays: 30, active: true });
    const l = await svc.create('t1', { fullName: 'Ali', phone: '+971500000000' });
    await svc.convert('t1', l.id, { planId: 'p1' });
    await expect(svc.convert('t1', l.id, { planId: 'p1' })).rejects.toThrow();
  });

  it('auto-loses stale leads', async () => {
    const old = new Date(Date.now() - 30 * 86400000);
    stub.leads.set('lold', { id: 'lold', tenantId: 't1', fullName: 'X', phone: '+1', email: null, stage: LeadStage.NEW, convertedMemberId: null, createdAt: old, updatedAt: old });
    stub.leads.set('lfresh', { id: 'lfresh', tenantId: 't1', fullName: 'Y', phone: '+2', email: null, stage: LeadStage.NEW, convertedMemberId: null, createdAt: new Date(), updatedAt: new Date() });
    const r = await svc.autoLoseStale();
    expect(r.updated).toBe(1);
    expect(stub.leads.get('lold')!.stage).toBe(LeadStage.LOST);
    expect(stub.leads.get('lfresh')!.stage).toBe(LeadStage.NEW);
  });

  it('rejects conversion when a member with the same phone already exists', async () => {
    stub.members.set('existing', { id: 'existing', tenantId: 't1', fullName: 'Dup', phone: '+971500000000', email: null, source: 'X' });
    const l = await svc.create('t1', { fullName: 'Ali', phone: '+971500000000' });
    await expect(svc.convert('t1', l.id, {})).rejects.toThrow(/already exists/i);
  });

  it('dispatches lead_converted_welcome on successful conversion', async () => {
    stub.plans.set('p1', { id: 'p1', tenantId: 't1', durationDays: 30, active: true });
    const l = await svc.create('t1', { fullName: 'Ali', phone: '+971500000000' });
    await svc.convert('t1', l.id, { planId: 'p1' });
    expect(notificationsSpy.dispatch).toHaveBeenCalledOnce();
    expect(notificationsSpy.dispatch.mock.calls[0][0]).toMatchObject({
      category: 'lead_converted_welcome',
      to: '+971500000000',
    });
  });

  it('rejects invalid stage transitions', async () => {
    const l = await svc.create('t1', { fullName: 'Ali', phone: '+971500000000' });
    await expect(svc.update('t1', l.id, { stage: LeadStage.CONVERTED })).rejects.toThrow(/convert/i);
    // NEW -> TRIAL_BOOKED is allowed; from there going back to NEW is not.
    await svc.update('t1', l.id, { stage: LeadStage.TRIAL_BOOKED });
    await expect(svc.update('t1', l.id, { stage: LeadStage.NEW })).rejects.toThrow(/Invalid stage transition/);
  });

  it('isolates list() by tenantId', async () => {
    await svc.create('t1', { fullName: 'Ali', phone: '+9711' });
    await svc.create('t2', { fullName: 'Sara', phone: '+9712' });
    // stub.lead.findMany ignores the where clause but the service relies on findMany call signature
    // For tenant isolation we verify the where clause is passed.
    await svc.list('t1');
    const calls = stub.lead.findMany.mock.calls as unknown as Array<[{ where: { tenantId: string } }]>;
    const lastCall = calls[calls.length - 1][0];
    expect(lastCall.where.tenantId).toBe('t1');
  });
});
