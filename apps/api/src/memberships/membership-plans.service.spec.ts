import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MembershipPlansService } from './membership-plans.service';

interface PlanRow {
  id: string;
  tenantId: string;
  nameEn: string;
  nameAr: string | null;
  description: string | null;
  durationDays: number;
  priceAed: number;
  vatRate: number;
  includesClasses: boolean;
  maxFreezeDays: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function makeStub() {
  const plans = new Map<string, PlanRow>();
  let seq = 0;

  const stub = {
    plans,
    membershipPlan: {
      findMany: vi.fn(async ({ where }: { where: { tenantId: string; active?: boolean } }) => {
        return [...plans.values()].filter((p) => {
          if (p.tenantId !== where.tenantId) return false;
          if (where.active !== undefined && p.active !== where.active) return false;
          return true;
        });
      }),
      findFirst: vi.fn(
        async ({ where }: { where: { id: string; tenantId: string } }) => {
          const p = plans.get(where.id);
          return p && p.tenantId === where.tenantId ? p : null;
        },
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: Omit<PlanRow, 'id' | 'createdAt' | 'updatedAt'>;
        }) => {
          const id = `plan_${++seq}`;
          const row: PlanRow = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
          plans.set(id, row);
          return row;
        },
      ),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Partial<PlanRow> }) => {
          const p = plans.get(where.id);
          if (!p) throw new Error('not found');
          Object.assign(p, data);
          return p;
        },
      ),
    },
    membership: {
      count: vi.fn(async () => 0),
    },
  };
  return stub;
}

describe('MembershipPlansService', () => {
  let stub: ReturnType<typeof makeStub>;
  let svc: MembershipPlansService;

  const validInput = {
    nameEn: 'Monthly Gold',
    durationDays: 30,
    priceAed: 499,
    vatRate: 5,
    includesClasses: false,
    maxFreezeDays: 0,
  };

  beforeEach(() => {
    stub = makeStub();
    svc = new MembershipPlansService(stub as never);
  });

  describe('list()', () => {
    it('returns all plans for the tenant when activeOnly=false', async () => {
      await svc.create('t', validInput);
      await svc.create('t', { ...validInput, nameEn: 'Plan B', active: false });
      const result = await svc.list('t', false);
      expect(result).toHaveLength(2);
    });

    it('returns only active plans when activeOnly=true', async () => {
      await svc.create('t', validInput);
      const all = await svc.list('t', false);
      stub.plans.set(all[0].id, { ...all[0], active: false });
      const active = await svc.list('t', true);
      expect(active).toHaveLength(0);
    });

    it('does not return plans from other tenants', async () => {
      await svc.create('tenant-a', validInput);
      await svc.create('tenant-b', { ...validInput, nameEn: 'Other plan' });
      const result = await svc.list('tenant-a', false);
      expect(result).toHaveLength(1);
    });
  });

  describe('create()', () => {
    it('creates a plan with the correct fields', async () => {
      const plan = await svc.create('t', {
        nameEn: 'Annual Platinum',
        durationDays: 365,
        priceAed: 3000,
        vatRate: 5,
        includesClasses: true,
        maxFreezeDays: 30,
      });
      expect(plan.nameEn).toBe('Annual Platinum');
      expect(plan.priceAed).toBe(3000);
      expect(plan.durationDays).toBe(365);
      expect(plan.tenantId).toBe('t');
      expect(plan.includesClasses).toBe(true);
    });

    it('applies Zod defaults (vatRate=5, active=true)', async () => {
      const plan = await svc.create('t', { nameEn: 'X', durationDays: 30, priceAed: 100 });
      expect(plan.vatRate).toBe(5);
      expect(plan.active).toBe(true);
    });

    it('rejects input missing required nameEn', async () => {
      await expect(
        svc.create('t', { durationDays: 30, priceAed: 100 }),
      ).rejects.toThrow();
    });

    it('rejects negative priceAed', async () => {
      await expect(
        svc.create('t', { nameEn: 'X', durationDays: 30, priceAed: -1 }),
      ).rejects.toThrow();
    });

    it('rejects durationDays > 3650', async () => {
      await expect(
        svc.create('t', { nameEn: 'X', durationDays: 3651, priceAed: 100 }),
      ).rejects.toThrow();
    });
  });

  describe('update()', () => {
    it('updates nameEn and priceAed', async () => {
      const plan = await svc.create('t', validInput);
      const updated = await svc.update('t', plan.id, { nameEn: 'Updated', priceAed: 599 });
      expect(updated.nameEn).toBe('Updated');
      expect(updated.priceAed).toBe(599);
    });

    it('throws NotFoundException for unknown plan id', async () => {
      await expect(svc.update('t', 'ghost-id', { nameEn: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when plan belongs to another tenant', async () => {
      const plan = await svc.create('tenant-a', validInput);
      await expect(svc.update('tenant-b', plan.id, { nameEn: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('archive()', () => {
    it('sets active=false', async () => {
      const plan = await svc.create('t', validInput);
      await svc.archive('t', plan.id);
      expect(stub.plans.get(plan.id)!.active).toBe(false);
    });

    it('throws NotFoundException for unknown plan', async () => {
      await expect(svc.archive('t', 'no-such-id')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when plan has active memberships', async () => {
      const plan = await svc.create('t', validInput);
      stub.membership.count.mockResolvedValueOnce(3);
      await expect(svc.archive('t', plan.id)).rejects.toThrow(BadRequestException);
    });

    it('archive message includes count of active memberships', async () => {
      const plan = await svc.create('t', validInput);
      stub.membership.count.mockResolvedValueOnce(5);
      await expect(svc.archive('t', plan.id)).rejects.toThrow('5');
    });
  });
});
