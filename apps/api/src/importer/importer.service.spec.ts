import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImporterService } from './importer.service';

interface M { id: string; tenantId: string; externalId: string; phone: string; fullName: string; email: string | null; membershipStatus: string }

function makeStub() {
  const members = new Map<string, M>();
  let seq = 0;
  return {
    members,
    member: {
      findMany: vi.fn(async ({ where }: { where: { OR?: Array<{ phone?: { in: string[] }; externalId?: { in: string[] } }>; tenantId: string } }) => {
        const all = [...members.values()].filter((m) => m.tenantId === where.tenantId);
        if (!where.OR) return all;
        return all.filter((m) =>
          where.OR!.some(
            (c) =>
              (c.phone?.in.includes(m.phone) ?? false) || (c.externalId?.in.includes(m.externalId) ?? false),
          ),
        );
      }),
      create: vi.fn(async ({ data }: { data: Omit<M, 'id'> & { source: string; raw: unknown; joinedAt: Date } }) => {
        seq += 1;
        const r: M = {
          id: `m-${seq}`,
          tenantId: data.tenantId,
          externalId: data.externalId,
          fullName: data.fullName,
          email: data.email ?? null,
          phone: data.phone,
          membershipStatus: data.membershipStatus,
        };
        members.set(r.id, r);
        return r;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<M> }) => {
        const m = members.get(where.id)!;
        Object.assign(m, data);
        return m;
      }),
    },
  };
}

const csv = `externalId,fullName,phone,email,membershipStatus
ext-1,Alice,+971500000001,alice@example.com,ACTIVE
ext-2,Bob,+971500000002,,PENDING
,Cara,+971500000003,cara@example.com,ACTIVE
,Bad,not-a-phone,,ACTIVE`;

describe('ImporterService', () => {
  let stub: ReturnType<typeof makeStub>;
  let svc: ImporterService;

  beforeEach(() => {
    stub = makeStub();
    svc = new ImporterService(stub as unknown as never);
  });

  it('plans creates + reports validation errors', async () => {
    const plan = await svc.planMembers('t1', csv);
    expect(plan.totalRows).toBe(4);
    expect(plan.validRows).toBe(3);
    expect(plan.errors).toHaveLength(1);
    expect(plan.toCreate).toHaveLength(3);
    expect(plan.toUpdate).toHaveLength(0);
  });

  it('classifies match-by-phone as update when different fullName', async () => {
    stub.members.set('m0', { id: 'm0', tenantId: 't1', externalId: 'old', phone: '+971500000001', fullName: 'OldName', email: 'alice@example.com', membershipStatus: 'ACTIVE' });
    const plan = await svc.planMembers('t1', csv);
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toUpdate[0].id).toBe('m0');
  });

  it('match-by-externalId with no changes -> unchanged', async () => {
    stub.members.set('m0', { id: 'm0', tenantId: 't1', externalId: 'ext-1', phone: '+971500000099', fullName: 'Alice', email: 'alice@example.com', membershipStatus: 'ACTIVE' });
    const plan = await svc.planMembers('t1', csv);
    expect(plan.unchanged).toBe(1);
  });

  it('apply creates and updates', async () => {
    stub.members.set('m0', { id: 'm0', tenantId: 't1', externalId: 'old', phone: '+971500000001', fullName: 'OldName', email: 'alice@example.com', membershipStatus: 'ACTIVE' });
    const r = await svc.applyMembers('t1', csv);
    expect(r.applied).toBe(true);
    expect(r.created).toBe(2);
    expect(r.updated).toBe(1);
  });
});
