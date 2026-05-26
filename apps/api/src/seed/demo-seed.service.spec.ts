import { describe, expect, it, vi } from 'vitest';
import { DemoSeedService } from './demo-seed.service';

function makePrisma() {
  const data: Record<string, unknown[]> = {
    member: [],
    staff: [],
    membershipPlan: [],
    membership: [],
    classType: [],
    classSession: [],
    booking: [],
    lead: [],
    product: [],
    sale: [],
    checkIn: [],
  };
  const create = (key: string) =>
    vi.fn(async ({ data: row }: { data: Record<string, unknown> }) => {
      const r = { id: `${key}-${data[key].length + 1}`, ...row };
      data[key].push(r);
      return r;
    });
  const prisma = {
    member: {
      count: vi.fn(async () => data.member.length),
      create: create('member'),
    },
    staff: { create: create('staff') },
    membershipPlan: { create: create('membershipPlan') },
    membership: { create: create('membership') },
    classType: { create: create('classType') },
    classSession: { create: create('classSession') },
    booking: { create: create('booking') },
    lead: {
      createMany: vi.fn(async ({ data: rows }: { data: Array<Record<string, unknown>> }) => {
        for (const row of rows) data.lead.push({ id: `lead-${data.lead.length + 1}`, ...row });
        return { count: rows.length };
      }),
    },
    product: { create: create('product') },
    sale: { create: create('sale') },
    checkIn: { create: create('checkIn') },
  };
  return { prisma, data };
}

describe('DemoSeedService', () => {
  it('seeds a starter dataset', async () => {
    const { prisma, data } = makePrisma();
    const svc = new DemoSeedService(prisma as unknown as never);
    await svc.seed('tenant-1');

    expect(data.member.length).toBeGreaterThan(0);
    expect(data.staff.length).toBe(2);
    expect(data.membershipPlan.length).toBe(2);
    expect(data.classType.length).toBe(1);
    expect(data.classSession.length).toBe(5);
    expect(data.booking.length).toBeGreaterThan(0);
    expect(data.lead.length).toBe(3);
    expect(data.product.length).toBe(2);
    expect(data.sale.length).toBe(3);
  });

  it('is a no-op when members already exist', async () => {
    const { prisma, data } = makePrisma();
    prisma.member.count = vi.fn(async () => 5);
    const svc = new DemoSeedService(prisma as unknown as never);
    await svc.seed('tenant-1');
    expect(data.staff.length).toBe(0);
    expect(data.classType.length).toBe(0);
  });
});
