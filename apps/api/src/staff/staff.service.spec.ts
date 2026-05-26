import { StaffRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShiftsService } from './shifts.service';
import { StaffService } from './staff.service';

interface StaffRow { id: string; tenantId: string; fullName: string; role: StaffRole; active: boolean; pinHash: string | null; terminatedAt: Date | null }
interface ShiftRow { id: string; tenantId: string; staffId: string; startsAt: Date; endsAt: Date; role: StaffRole | null; notes: string | null }

function makeStub() {
  const staffMap = new Map<string, StaffRow>();
  const shiftMap = new Map<string, ShiftRow>();
  let seq = 0;
  return {
    staffMap,
    shiftMap,
    staff: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string; active?: boolean } }) => {
        const s = staffMap.get(where.id);
        if (!s || s.tenantId !== where.tenantId) return null;
        if (where.active && !s.active) return null;
        return s;
      }),
      findMany: vi.fn(async ({ where }: { where: { tenantId: string; active?: boolean; pinHash?: { not: null } } }) => {
        return [...staffMap.values()].filter((s) => {
          if (s.tenantId !== where.tenantId) return false;
          if (where.active && !s.active) return false;
          if (where.pinHash?.not === null && !s.pinHash) return false;
          return true;
        });
      }),
      create: vi.fn(async ({ data }: { data: Partial<StaffRow> & { tenantId: string; fullName: string } }) => {
        seq += 1;
        const row: StaffRow = {
          id: `staff-${seq}`,
          tenantId: data.tenantId,
          fullName: data.fullName,
          role: data.role ?? StaffRole.TRAINER,
          active: true,
          pinHash: (data as { pinHash?: string | null }).pinHash ?? null,
          terminatedAt: null,
        };
        staffMap.set(row.id, row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<StaffRow> }) => {
        const s = staffMap.get(where.id);
        if (!s) throw new Error('not found');
        Object.assign(s, data);
        return s;
      }),
    },
    shift: {
      findMany: vi.fn(async ({ where }: { where: { tenantId: string; staffId?: string; NOT?: { id: string }; startsAt?: { lt?: Date; gte?: Date; lte?: Date }; endsAt?: { gt: Date } } }) => {
        return [...shiftMap.values()].filter((sh) => {
          if (sh.tenantId !== where.tenantId) return false;
          if (where.staffId && sh.staffId !== where.staffId) return false;
          if (where.NOT && sh.id === where.NOT.id) return false;
          if (where.startsAt?.lt && sh.startsAt >= where.startsAt.lt) return false;
          if (where.endsAt?.gt && sh.endsAt <= where.endsAt.gt) return false;
          if (where.startsAt?.gte && sh.startsAt < where.startsAt.gte) return false;
          if (where.startsAt?.lte && sh.startsAt > where.startsAt.lte) return false;
          return true;
        });
      }),
      create: vi.fn(async ({ data }: { data: Omit<ShiftRow, 'id'> }) => {
        seq += 1;
        const row: ShiftRow = { id: `shift-${seq}`, ...data, role: data.role ?? null, notes: data.notes ?? null };
        shiftMap.set(row.id, row);
        return row;
      }),
      createMany: vi.fn(async ({ data }: { data: Array<Omit<ShiftRow, 'id' | 'role' | 'notes'> & { role?: StaffRole }> }) => {
        for (const d of data) {
          seq += 1;
          const row: ShiftRow = { id: `shift-${seq}`, role: d.role ?? null, notes: null, ...d };
          shiftMap.set(row.id, row);
        }
        return { count: data.length };
      }),
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string } }) => {
        const s = shiftMap.get(where.id);
        return s && s.tenantId === where.tenantId ? s : null;
      }),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

describe('StaffService', () => {
  let stub: ReturnType<typeof makeStub>;
  let svc: StaffService;

  beforeEach(() => {
    stub = makeStub();
    svc = new StaffService(stub as unknown as never);
  });

  it('creates staff and hashes PIN', async () => {
    const created = await svc.create('t1', { fullName: 'A', role: 'TRAINER', pin: '1234' });
    expect(created.fullName).toBe('A');
    const row = stub.staffMap.get(created.id)!;
    expect(row.pinHash).toBeTruthy();
    expect(row.pinHash).not.toBe('1234');
  });

  it('rejects invalid PIN format', async () => {
    await expect(svc.create('t1', { fullName: 'A', role: 'TRAINER', pin: 'abc' })).rejects.toThrow();
  });

  it('verifies PIN against hash', async () => {
    const created = await svc.create('t1', { fullName: 'A', role: 'TRAINER', pin: '4321' });
    await expect(svc.verifyPin('t1', created.id, '4321')).resolves.toBe(true);
    await expect(svc.verifyPin('t1', created.id, '0000')).resolves.toBe(false);
  });

  it('finds staff by PIN', async () => {
    await svc.create('t1', { fullName: 'A', role: 'TRAINER', pin: '1111' });
    await svc.create('t1', { fullName: 'B', role: 'RECEPTION', pin: '2222' });
    const hit = await svc.findActiveByPin('t1', '2222');
    expect(hit?.fullName).toBe('B');
    expect(await svc.findActiveByPin('t1', '9999')).toBeNull();
  });

  it('terminates staff (soft delete)', async () => {
    const c = await svc.create('t1', { fullName: 'A', role: 'TRAINER' });
    await svc.terminate('t1', c.id);
    const row = stub.staffMap.get(c.id)!;
    expect(row.active).toBe(false);
    expect(row.terminatedAt).toBeInstanceOf(Date);
  });

  it('rejects duplicate PIN within the same tenant on create', async () => {
    await svc.create('t1', { fullName: 'A', role: 'TRAINER', pin: '5555' });
    await expect(svc.create('t1', { fullName: 'B', role: 'TRAINER', pin: '5555' })).rejects.toThrow(/PIN/i);
  });

  it('allows the same PIN in different tenants', async () => {
    await svc.create('t1', { fullName: 'A', role: 'TRAINER', pin: '6666' });
    await expect(svc.create('t2', { fullName: 'B', role: 'TRAINER', pin: '6666' })).resolves.toBeTruthy();
  });

  it('rejects updating a staff member to a PIN already in use by another active staff', async () => {
    await svc.create('t1', { fullName: 'A', role: 'TRAINER', pin: '7777' });
    const b = await svc.create('t1', { fullName: 'B', role: 'TRAINER', pin: '8888' });
    await expect(svc.update('t1', b.id, { pin: '7777' })).rejects.toThrow(/PIN/i);
  });

  it('reactivates a terminated staff member', async () => {
    const c = await svc.create('t1', { fullName: 'A', role: 'TRAINER' });
    await svc.terminate('t1', c.id);
    await svc.reactivate('t1', c.id);
    const row = stub.staffMap.get(c.id)!;
    expect(row.active).toBe(true);
    expect(row.terminatedAt).toBeNull();
  });

  it('list() with activeOnly=true excludes inactive staff', async () => {
    const active = await svc.create('t1', { fullName: 'Active', role: 'TRAINER' });
    const inactive = await svc.create('t1', { fullName: 'Inactive', role: 'TRAINER' });
    await svc.terminate('t1', inactive.id);
    const list = await svc.list('t1', true);
    expect(list.every((s) => s.active)).toBe(true);
    expect(list.find((s) => s.id === active.id)).toBeTruthy();
    expect(list.find((s) => s.id === inactive.id)).toBeUndefined();
  });

  it('list() with activeOnly=false includes all staff', async () => {
    await svc.create('t1', { fullName: 'Active', role: 'TRAINER' });
    const inactive = await svc.create('t1', { fullName: 'Inactive', role: 'TRAINER' });
    await svc.terminate('t1', inactive.id);
    const list = await svc.list('t1', false);
    expect(list.some((s) => !s.active)).toBe(true);
  });

  it('updates staff details (name, role)', async () => {
    const c = await svc.create('t1', { fullName: 'Old', role: 'TRAINER' });
    await svc.update('t1', c.id, { fullName: 'New', role: 'MANAGER' });
    const row = stub.staffMap.get(c.id)!;
    expect(row.fullName).toBe('New');
    expect(row.role).toBe('MANAGER');
  });

  it('get() throws NotFound for unknown staff', async () => {
    await expect(svc.get('t1', 'ghost')).rejects.toThrow('Staff not found');
  });

  it('get() returns staff by ID', async () => {
    const c = await svc.create('t1', { fullName: 'A', role: 'TRAINER' });
    const s = await svc.get('t1', c.id);
    expect(s.fullName).toBe('A');
  });

  it('verifyPin returns false for inactive staff', async () => {
    const c = await svc.create('t1', { fullName: 'A', role: 'TRAINER', pin: '1234' });
    await svc.terminate('t1', c.id);
    await expect(svc.verifyPin('t1', c.id, '1234')).resolves.toBe(false);
  });

  it('findActiveByPin returns null for inactive staff', async () => {
    const c = await svc.create('t1', { fullName: 'A', role: 'TRAINER', pin: '9999' });
    await svc.terminate('t1', c.id);
    await expect(svc.findActiveByPin('t1', '9999')).resolves.toBeNull();
  });

  it('creates staff without PIN (pinHash is null)', async () => {
    const c = await svc.create('t1', { fullName: 'NoPin', role: 'TRAINER' });
    expect(stub.staffMap.get(c.id)!.pinHash).toBeNull();
  });

  it('updates a staff member to set a PIN when they had none', async () => {
    const c = await svc.create('t1', { fullName: 'A', role: 'TRAINER' });
    await svc.update('t1', c.id, { pin: '4321' });
    const row = stub.staffMap.get(c.id)!;
    expect(row.pinHash).toBeTruthy();
    await expect(svc.verifyPin('t1', c.id, '4321')).resolves.toBe(true);
  });

  it('findActiveByPin rejects invalid PIN format', async () => {
    await expect(svc.findActiveByPin('t1', '123')).rejects.toThrow('Invalid PIN format');
  });

  it('findActiveByPin rejects PIN that is too long (> 8 digits)', async () => {
    await expect(svc.findActiveByPin('t1', '123456789')).rejects.toThrow('Invalid PIN format');
  });
});

describe('ShiftsService', () => {
  let stub: ReturnType<typeof makeStub>;
  let svc: ShiftsService;
  let staffId: string;

  beforeEach(async () => {
    stub = makeStub();
    svc = new ShiftsService(stub as unknown as never);
    const s = await new StaffService(stub as unknown as never).create('t1', { fullName: 'A', role: 'TRAINER' });
    staffId = s.id;
  });

  it('creates a shift', async () => {
    const created = await svc.create('t1', {
      staffId,
      startsAt: '2025-01-01T06:00:00.000Z',
      endsAt: '2025-01-01T10:00:00.000Z',
    });
    expect(created.staffId).toBe(staffId);
  });

  it('rejects shift with end before start', async () => {
    await expect(
      svc.create('t1', { staffId, startsAt: '2025-01-01T10:00:00.000Z', endsAt: '2025-01-01T06:00:00.000Z' }),
    ).rejects.toThrow();
  });

  it('detects overlapping shifts', async () => {
    await svc.create('t1', { staffId, startsAt: '2025-01-01T06:00:00.000Z', endsAt: '2025-01-01T10:00:00.000Z' });
    const conflicts = await svc.detectConflicts(
      't1',
      staffId,
      new Date('2025-01-01T08:00:00.000Z'),
      new Date('2025-01-01T12:00:00.000Z'),
    );
    expect(conflicts).toHaveLength(1);
  });

  it('creates bulk recurring shifts', async () => {
    const res = await svc.createBulk('t1', {
      staffId,
      daysOfWeek: [1, 3, 5],
      startTime: '06:00',
      endTime: '10:00',
      weeks: 2,
      fromDate: '2025-01-06T00:00:00.000Z', // Monday
    });
    expect(res.created).toBe(6);
  });

  it('rejects creating a shift that overlaps an existing one', async () => {
    await svc.create('t1', { staffId, startsAt: '2025-02-01T06:00:00.000Z', endsAt: '2025-02-01T10:00:00.000Z' });
    await expect(
      svc.create('t1', { staffId, startsAt: '2025-02-01T09:00:00.000Z', endsAt: '2025-02-01T12:00:00.000Z' }),
    ).rejects.toThrow(/overlap/i);
  });

  it('rejects bulk shift schema with invalid time strings (24+ hours)', async () => {
    await expect(
      svc.createBulk('t1', {
        staffId,
        daysOfWeek: [1],
        startTime: '25:00',
        endTime: '26:00',
        weeks: 1,
        fromDate: '2025-01-06T00:00:00.000Z',
      }),
    ).rejects.toThrow();
  });
});
