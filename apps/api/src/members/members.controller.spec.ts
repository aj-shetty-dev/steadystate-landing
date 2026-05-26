import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MembersController } from './members.controller';

interface MemberRow {
  id: string;
  tenantId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  membershipStatus: string;
  provider: string;
  lastCheckinAt: Date | null;
  joinedAt: Date;
}

type WhereInput = {
  tenantId: string;
  membershipStatus?: string;
  OR?: Array<{
    fullName?: { contains: string; mode?: string };
    email?: { contains: string; mode?: string };
    phone?: { contains: string };
  }>;
};

function applyWhere(rows: MemberRow[], where: WhereInput): MemberRow[] {
  return rows.filter((m) => {
    if (m.tenantId !== where.tenantId) return false;
    if (where.membershipStatus && m.membershipStatus !== where.membershipStatus) return false;
    if (where.OR) {
      const q = where.OR[0]?.fullName?.contains?.toLowerCase() ?? '';
      const matchesFullName = m.fullName.toLowerCase().includes(q);
      const matchesEmail = m.email?.toLowerCase().includes(q) ?? false;
      const matchesPhone = m.phone?.includes(q) ?? false;
      if (!matchesFullName && !matchesEmail && !matchesPhone) return false;
    }
    return true;
  });
}

function makeUser(tenantId = 'tenant-1') {
  return { id: 'user-1', tenantId, email: 'op@gym.com', role: 'ADMIN' } as never;
}

function makeStub() {
  const members = new Map<string, MemberRow>();
  let seq = 0;

  function addMember(overrides: Partial<MemberRow> = {}): MemberRow {
    seq++;
    const m: MemberRow = {
      id: `member-${seq}`,
      tenantId: 'tenant-1',
      fullName: `Member ${seq}`,
      email: null,
      phone: null,
      membershipStatus: 'ACTIVE',
      provider: 'NATIVE',
      lastCheckinAt: null,
      joinedAt: new Date('2026-01-01'),
      ...overrides,
    };
    members.set(m.id, m);
    return m;
  }

  const stub = {
    members,
    memberships: [] as Array<{ memberId: string; tenantId: string; status: string; planNameEn: string; startDate: Date }>,
    addMember,
    addMembership(row: { memberId: string; tenantId?: string; status?: string; planNameEn: string; startDate?: Date }) {
      this.memberships.push({
        memberId: row.memberId,
        tenantId: row.tenantId ?? 'tenant-1',
        status: row.status ?? 'ACTIVE',
        planNameEn: row.planNameEn,
        startDate: row.startDate ?? new Date('2026-01-01'),
      });
    },
    member: {
      findMany: vi.fn(async ({ where, skip, take }: { where: WhereInput; skip: number; take: number }) => {
        const rows = applyWhere([...members.values()], where);
        return rows.slice(skip, skip + take);
      }),
      findFirst: vi.fn(async ({ where }: { where: { id?: string; tenantId: string; phone?: string; NOT?: { id?: string } } }) => {
        if (where.id) {
          const m = members.get(where.id);
          return m && m.tenantId === where.tenantId ? m : null;
        }
        if (where.phone) {
          return [...members.values()].find((m) => {
            if (m.tenantId !== where.tenantId) return false;
            if (m.phone !== where.phone) return false;
            if (where.NOT?.id && m.id === where.NOT.id) return false;
            return true;
          }) ?? null;
        }
        return null;
      }),
      count: vi.fn(async ({ where }: { where: WhereInput }) => {
        return applyWhere([...members.values()], where).length;
      }),
      create: vi.fn(async ({ data }: { data: Partial<MemberRow> & { tenantId: string; externalId: string } }) => {
        seq++;
        const m: MemberRow = {
          id: `member-${seq}`,
          tenantId: data.tenantId,
          fullName: data.fullName ?? '',
          email: data.email ?? null,
          phone: data.phone ?? null,
          membershipStatus: data.membershipStatus ?? 'ACTIVE',
          provider: 'NATIVE',
          lastCheckinAt: null,
          joinedAt: new Date('2026-01-01'),
        };
        members.set(m.id, m);
        return m;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<MemberRow> }) => {
        const m = members.get(where.id);
        if (!m) throw new Error('not found');
        Object.assign(m, data);
        return m;
      }),
    },
    membership: {
      findMany: vi.fn(async ({ where }: { where: { tenantId: string; memberId: { in: string[] }; status: { in: string[] } } }) => {
        return stub.memberships
          .filter((m) => m.tenantId === where.tenantId)
          .filter((m) => where.memberId.in.includes(m.memberId))
          .filter((m) => where.status.in.includes(m.status))
          .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())
          .map((m) => ({ memberId: m.memberId, plan: { nameEn: m.planNameEn } }));
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { tenantId: string; memberId: string; status: { in: string[] } }; data: { status: string; cancellationReason?: string | null; cancelAtPeriodEnd?: boolean } }) => {
        let count = 0;
        for (const m of stub.memberships) {
          if (m.tenantId !== where.tenantId) continue;
          if (m.memberId !== where.memberId) continue;
          if (!where.status.in.includes(m.status)) continue;
          m.status = data.status;
          count++;
        }
        return { count };
      }),
    },
    booking: {
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === 'function') return (arg as (tx: typeof stub) => unknown)(stub);
      return Promise.all(arg as Promise<unknown>[]);
    }),
  };

  return stub;
}

describe('MembersController', () => {
  let stub: ReturnType<typeof makeStub>;
  let ctrl: MembersController;

  beforeEach(() => {
    stub = makeStub();
    ctrl = new MembersController(stub as never);
  });

  describe('list()', () => {
    it('returns only members belonging to the authenticated tenant', async () => {
      stub.addMember({ tenantId: 'tenant-1' });
      stub.addMember({ tenantId: 'tenant-1' });
      stub.addMember({ tenantId: 'tenant-2' });

      const result = await ctrl.list(makeUser('tenant-1'), 1, 25);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('paginates correctly: page 2 returns the second slice', async () => {
      for (let i = 0; i < 5; i++) stub.addMember();

      const page1 = await ctrl.list(makeUser(), 1, 3);
      const page2 = await ctrl.list(makeUser(), 2, 3);

      expect(page1.items).toHaveLength(3);
      expect(page2.items).toHaveLength(2);
      expect(page1.items[0].id).not.toBe(page2.items[0].id);
    });

    it('clamps pageSize to 100 maximum', async () => {
      const result = await ctrl.list(makeUser(), 1, 9999);
      expect(result.pageSize).toBe(100);
    });

    it('floors page to 1 when 0 or negative is given', async () => {
      const result = await ctrl.list(makeUser(), 0, 10);
      expect(result.page).toBe(1);
    });

    it('returns empty items and total=0 when tenant has no members', async () => {
      const result = await ctrl.list(makeUser('empty-tenant'), 1, 25);
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('filters by status: only EXPIRED members are returned', async () => {
      stub.addMember({ membershipStatus: 'ACTIVE' });
      stub.addMember({ membershipStatus: 'ACTIVE' });
      stub.addMember({ membershipStatus: 'EXPIRED' });

      const result = await ctrl.list(makeUser(), 1, 25, undefined, 'EXPIRED');

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.items[0].membershipStatus).toBe('EXPIRED');
    });

    it('ignores unknown status values (no filter applied)', async () => {
      stub.addMember({ membershipStatus: 'ACTIVE' });
      stub.addMember({ membershipStatus: 'EXPIRED' });

      const result = await ctrl.list(makeUser(), 1, 25, undefined, 'NOT_A_REAL_STATUS');

      expect(result.total).toBe(2);
    });

    it('searches by full name (case-insensitive)', async () => {
      stub.addMember({ fullName: 'Alice Johnson' });
      stub.addMember({ fullName: 'Bob Smith' });

      const result = await ctrl.list(makeUser(), 1, 25, 'alice');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].fullName).toBe('Alice Johnson');
    });

    it('searches by email', async () => {
      stub.addMember({ fullName: 'Alice', email: 'alice@example.com' });
      stub.addMember({ fullName: 'Bob', email: 'bob@example.com' });

      const result = await ctrl.list(makeUser(), 1, 25, 'alice@');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].fullName).toBe('Alice');
    });

    it('searches by phone', async () => {
      stub.addMember({ fullName: 'Alice', phone: '+971501111111' });
      stub.addMember({ fullName: 'Bob', phone: '+971502222222' });

      const result = await ctrl.list(makeUser(), 1, 25, '1111');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].fullName).toBe('Alice');
    });

    it('combines search and status filters', async () => {
      stub.addMember({ fullName: 'Alice', membershipStatus: 'ACTIVE' });
      stub.addMember({ fullName: 'Alice', membershipStatus: 'EXPIRED' });
      stub.addMember({ fullName: 'Bob', membershipStatus: 'ACTIVE' });

      const result = await ctrl.list(makeUser(), 1, 25, 'alice', 'ACTIVE');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].fullName).toBe('Alice');
      expect(result.items[0].membershipStatus).toBe('ACTIVE');
    });

    it('enriches each row with activePlanNames from an ACTIVE membership', async () => {
      const a = stub.addMember({ fullName: 'Alice' });
      const b = stub.addMember({ fullName: 'Bob' });
      stub.addMembership({ memberId: a.id, planNameEn: 'Platinum' });

      const result = await ctrl.list(makeUser(), 1, 25);
      const alice = result.items.find((m) => m.id === a.id) as unknown as { activePlanNames: string[] };
      const bob = result.items.find((m) => m.id === b.id) as unknown as { activePlanNames: string[] };
      expect(alice.activePlanNames).toEqual(['Platinum']);
      expect(bob.activePlanNames).toEqual([]);
    });

    it('returns all active plan names when a member has multiple memberships', async () => {
      const a = stub.addMember({ fullName: 'Alice' });
      stub.addMembership({ memberId: a.id, planNameEn: 'Gym' });
      stub.addMembership({ memberId: a.id, planNameEn: 'Yoga' });

      const result = await ctrl.list(makeUser(), 1, 25);
      const alice = result.items.find((m) => m.id === a.id) as unknown as { activePlanNames: string[] };
      expect(alice.activePlanNames).toEqual(expect.arrayContaining(['Gym', 'Yoga']));
      expect(alice.activePlanNames).toHaveLength(2);
    });

    it('treats FROZEN memberships as active for activePlanNames resolution', async () => {
      const a = stub.addMember({ fullName: 'Alice' });
      stub.addMembership({ memberId: a.id, status: 'FROZEN', planNameEn: 'Gold' });
      const result = await ctrl.list(makeUser(), 1, 25);
      const alice = result.items.find((m) => m.id === a.id) as unknown as { activePlanNames: string[] };
      expect(alice.activePlanNames).toEqual(['Gold']);
    });

    it('ignores CANCELLED/EXPIRED memberships when resolving activePlanNames', async () => {
      const a = stub.addMember({ fullName: 'Alice' });
      stub.addMembership({ memberId: a.id, status: 'CANCELLED', planNameEn: 'Old' });
      const result = await ctrl.list(makeUser(), 1, 25);
      const alice = result.items.find((m) => m.id === a.id) as unknown as { activePlanNames: string[] };
      expect(alice.activePlanNames).toEqual([]);
    });
  });

  describe('get()', () => {
    it('returns full member detail when found in the same tenant', async () => {
      const m = stub.addMember({ tenantId: 'tenant-1', fullName: 'Alice Smith' });

      const result = await ctrl.get(makeUser('tenant-1'), m.id);

      expect((result as unknown as { fullName: string }).fullName).toBe('Alice Smith');
      expect((result as unknown as { id: string }).id).toBe(m.id);
    });

    it('throws NotFoundException for a completely unknown id', async () => {
      await expect(ctrl.get(makeUser(), 'no-such-id')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the member belongs to a different tenant', async () => {
      const m = stub.addMember({ tenantId: 'tenant-2' });

      await expect(ctrl.get(makeUser('tenant-1'), m.id)).rejects.toThrow(NotFoundException);
    });

    it('does not leak cross-tenant data: same id, different tenant → 404', async () => {
      const m = stub.addMember({ tenantId: 'tenant-1', fullName: 'Secret Member' });

      await expect(ctrl.get(makeUser('tenant-2'), m.id)).rejects.toThrow(NotFoundException);
    });

    it('enriches detail with activePlanNames when an ACTIVE membership exists', async () => {
      const m = stub.addMember({ tenantId: 'tenant-1', fullName: 'Alice' });
      stub.addMembership({ memberId: m.id, planNameEn: 'Platinum' });
      const result = (await ctrl.get(makeUser('tenant-1'), m.id)) as unknown as { activePlanNames: string[] };
      expect(result.activePlanNames).toEqual(['Platinum']);
    });

    it('returns activePlanNames=[] on detail when no active membership exists', async () => {
      const m = stub.addMember({ tenantId: 'tenant-1', fullName: 'Alice' });
      const result = (await ctrl.get(makeUser('tenant-1'), m.id)) as unknown as { activePlanNames: string[] };
      expect(result.activePlanNames).toEqual([]);
    });
  });

  describe('create()', () => {
    it('creates a member successfully when phone is unique', async () => {
      const result = await ctrl.create(makeUser(), { fullName: 'Zara', phone: '+971509000001' });
      expect((result as unknown as { fullName: string }).fullName).toBe('Zara');
    });

    it('throws ConflictException when phone already in use by same tenant', async () => {
      stub.addMember({ phone: '+971509000002', tenantId: 'tenant-1' });
      await expect(ctrl.create(makeUser(), { fullName: 'Dupe', phone: '+971509000002' })).rejects.toThrow(ConflictException);
    });

    it('allows same phone across different tenants', async () => {
      stub.addMember({ phone: '+971509000003', tenantId: 'tenant-2' });
      // tenant-1 creating member with same phone that belongs to tenant-2 — should succeed
      await expect(ctrl.create(makeUser('tenant-1'), { fullName: 'New', phone: '+971509000003' })).resolves.toBeDefined();
    });
  });

  describe('update()', () => {
    it('throws ConflictException when updating phone to one already used in same tenant', async () => {
      const existing = stub.addMember({ phone: '+971509000010', tenantId: 'tenant-1' });
      const target = stub.addMember({ phone: '+971509000011', tenantId: 'tenant-1' });
      await expect(ctrl.update(makeUser(), target.id, { phone: existing.phone })).rejects.toThrow(ConflictException);
    });

    it('allows updating other fields without triggering duplicate phone check', async () => {
      const m = stub.addMember({ phone: '+971509000020', tenantId: 'tenant-1' });
      await expect(ctrl.update(makeUser(), m.id, { fullName: 'Updated Name' })).resolves.toBeDefined();
    });

    it('allows updating a member phone to its own current phone (no-op on phone)', async () => {
      const m = stub.addMember({ phone: '+971509000030', tenantId: 'tenant-1' });
      await expect(ctrl.update(makeUser(), m.id, { phone: '+971509000030' })).resolves.toBeDefined();
    });
  });

  describe('deactivate()', () => {
    it('cascades CANCELLED to all ACTIVE/FROZEN/PENDING_PAYMENT memberships', async () => {
      const m = stub.addMember({ tenantId: 'tenant-1', fullName: 'Alice' });
      stub.addMembership({ memberId: m.id, status: 'ACTIVE', planNameEn: 'Gold' });
      stub.addMembership({ memberId: m.id, status: 'FROZEN', planNameEn: 'Silver' });
      stub.addMembership({ memberId: m.id, status: 'EXPIRED', planNameEn: 'Bronze' });
      stub.addMembership({ memberId: m.id, status: 'PENDING_PAYMENT', planNameEn: 'Trial' });

      await ctrl.deactivate(makeUser('tenant-1'), m.id);

      const after = stub.memberships.filter((mem) => mem.memberId === m.id);
      expect(after.filter((mem) => mem.status === 'CANCELLED')).toHaveLength(3);
      expect(after.filter((mem) => mem.status === 'EXPIRED')).toHaveLength(1);
      expect(stub.members.get(m.id)!.membershipStatus).toBe('CANCELLED');
    });

    it('rejects cross-tenant deactivate with NotFoundException', async () => {
      const m = stub.addMember({ tenantId: 'tenant-1', fullName: 'X' });
      await expect(ctrl.deactivate(makeUser('tenant-2'), m.id)).rejects.toThrow(NotFoundException);
    });

    it('cancels forward-looking bookings on deactivate', async () => {
      const m = stub.addMember({ tenantId: 'tenant-1', fullName: 'Bob' });
      await ctrl.deactivate(makeUser('tenant-1'), m.id);
      expect(stub.booking.updateMany).toHaveBeenCalledOnce();
      const call = (stub.booking.updateMany.mock.calls[0] as unknown as [{
        where: { tenantId: string; memberId: string; status: { in: string[] }; session: { startsAt: { gt: Date } } };
        data: { status: string; cancelledAt: Date };
      }])[0];
      expect(call.where.tenantId).toBe('tenant-1');
      expect(call.where.memberId).toBe(m.id);
      expect(call.where.status.in).toEqual(['BOOKED', 'WAITLISTED']);
      expect(call.data.status).toBe('CANCELLED');
    });
  });
});
