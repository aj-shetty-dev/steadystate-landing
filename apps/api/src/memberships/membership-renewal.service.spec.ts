import { MembershipStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MembershipRenewalService } from './membership-renewal.service';

interface PlanRow { id: string; tenantId: string; nameEn: string; nameAr: string | null; durationDays: number; active: boolean }
interface MemberRow { id: string; tenantId: string; fullName: string; phone: string | null; preferredLocale: string | null }
interface MembershipRow {
  id: string; tenantId: string; memberId: string; planId: string;
  startDate: Date; endDate: Date; status: MembershipStatus;
  cancelAtPeriodEnd: boolean;
  lastReminderSentAt?: Date | null;
}

function makeStub() {
  const plans = new Map<string, PlanRow>();
  const members = new Map<string, MemberRow>();
  const memberships = new Map<string, MembershipRow>();
  let seq = 0;

  const stub = {
    plans, members, memberships,
    membership: {
      findMany: vi.fn(async ({
        where,
        include,
      }: {
        where: {
          status?: MembershipStatus;
          endDate?: { gte?: Date; lte?: Date };
          startDate?: { gte?: Date; lte?: Date };
          lastReminderSentAt?: null;
        };
        include?: Record<string, unknown>;
      }) => {
        return [...memberships.values()].filter((m) => {
          if (where.status && m.status !== where.status) return false;
          if (where.endDate?.gte && m.endDate < where.endDate.gte) return false;
          if (where.endDate?.lte && m.endDate > where.endDate.lte) return false;
          if (where.startDate?.gte && m.startDate < where.startDate.gte) return false;
          if (where.startDate?.lte && m.startDate > where.startDate.lte) return false;
          if (!plans.get(m.planId)) return false;
          if ('lastReminderSentAt' in where && where.lastReminderSentAt === null && m.lastReminderSentAt != null) return false;
          return true;
        }).map((m) => ({
          ...m,
          plan: include?.plan ? plans.get(m.planId) : undefined,
          member: include?.member ? members.get(m.memberId) : undefined,
        }));
      }),
      findFirst: vi.fn(async ({
        where,
      }: {
        where: {
          tenantId?: string; memberId?: string; planId?: string;
          status?: MembershipStatus; startDate?: { gte?: Date };
        };
      }) => {
        return [...memberships.values()].find((m) => {
          if (where.tenantId && m.tenantId !== where.tenantId) return false;
          if (where.memberId && m.memberId !== where.memberId) return false;
          if (where.planId && m.planId !== where.planId) return false;
          if (where.status && m.status !== where.status) return false;
          if (where.startDate?.gte && m.startDate < where.startDate.gte) return false;
          return true;
        }) ?? null;
      }),
      create: vi.fn(async ({ data }: { data: Omit<MembershipRow, 'id'> }) => {
        const id = `mem_${++seq}`;
        const row: MembershipRow = { id, ...data };
        memberships.set(id, row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<MembershipRow> }) => {
        const row = memberships.get(where.id);
        if (row) Object.assign(row, data);
        return row;
      }),
    },
  };
  return stub;
}

function makeNotificationsSpy() {
  return { dispatch: vi.fn().mockResolvedValue({ messageId: 'msg-1', channel: 'WHATSAPP' }) };
}

describe('MembershipRenewalService', () => {
  let stub: ReturnType<typeof makeStub>;
  let svc: MembershipRenewalService;
  let notificationsSpy: ReturnType<typeof makeNotificationsSpy>;

  const NOW = new Date('2026-06-01T08:00:00Z');
  const EXPIRING_IN_5 = new Date('2026-06-06T00:00:00Z');
  const EXPIRING_IN_10 = new Date('2026-06-11T00:00:00Z');
  const ALREADY_EXPIRED = new Date('2026-05-30T00:00:00Z');

  beforeEach(() => {
    stub = makeStub();
    notificationsSpy = makeNotificationsSpy();
    svc = new MembershipRenewalService(stub as never, notificationsSpy as never);

    // Plan A: standard plan
    stub.plans.set('plan-a', { id: 'plan-a', tenantId: 't1', nameEn: 'Gold', nameAr: 'ذهبي', durationDays: 30, active: true });
    // Plan B: another plan
    stub.plans.set('plan-b', { id: 'plan-b', tenantId: 't1', nameEn: 'Silver', nameAr: null, durationDays: 30, active: true });

    stub.members.set('m1', { id: 'm1', tenantId: 't1', fullName: 'Ali Hassan', phone: '+971501234567', preferredLocale: 'EN' });
    stub.members.set('m2', { id: 'm2', tenantId: 't1', fullName: 'Sara', phone: null, preferredLocale: null });
    stub.members.set('m3', { id: 'm3', tenantId: 't1', fullName: 'Omar', phone: '+971509876543', preferredLocale: 'AR' });
  });

  describe('findAutoRenewDue()', () => {
    it('returns active memberships expiring within the window', async () => {
      stub.memberships.set('ms1', {
        id: 'ms1', tenantId: 't1', memberId: 'm1', planId: 'plan-a',
        startDate: new Date('2026-05-07T00:00:00Z'), endDate: EXPIRING_IN_5,
        status: MembershipStatus.ACTIVE, cancelAtPeriodEnd: false,
      });
      const due = await svc.findAutoRenewDue(NOW, 7);
      expect(due).toHaveLength(1);
      expect(due[0].id).toBe('ms1');
    });

    it('includes memberships on any plan type', async () => {
      stub.memberships.set('ms2', {
        id: 'ms2', tenantId: 't1', memberId: 'm1', planId: 'plan-b',
        startDate: new Date('2026-05-07T00:00:00Z'), endDate: EXPIRING_IN_5,
        status: MembershipStatus.ACTIVE, cancelAtPeriodEnd: false,
      });
      const due = await svc.findAutoRenewDue(NOW, 7);
      expect(due).toHaveLength(1);
      expect(due[0].id).toBe('ms2');
    });

    it('excludes memberships expiring after the window', async () => {
      stub.memberships.set('ms4', {
        id: 'ms4', tenantId: 't1', memberId: 'm1', planId: 'plan-a',
        startDate: new Date('2026-05-12T00:00:00Z'), endDate: EXPIRING_IN_10,
        status: MembershipStatus.ACTIVE, cancelAtPeriodEnd: false,
      });
      const due = await svc.findAutoRenewDue(NOW, 7);
      expect(due).toHaveLength(0);
    });

    it('excludes already-expired memberships', async () => {
      stub.memberships.set('ms5', {
        id: 'ms5', tenantId: 't1', memberId: 'm1', planId: 'plan-a',
        startDate: new Date('2026-04-30T00:00:00Z'), endDate: ALREADY_EXPIRED,
        status: MembershipStatus.ACTIVE, cancelAtPeriodEnd: false,
      });
      const due = await svc.findAutoRenewDue(NOW, 7);
      expect(due).toHaveLength(0);
    });
  });

  describe('processAutoRenewals()', () => {
    it('creates a PENDING_PAYMENT renewal starting at current endDate', async () => {
      stub.memberships.set('ms1', {
        id: 'ms1', tenantId: 't1', memberId: 'm1', planId: 'plan-a',
        startDate: new Date('2026-05-07T00:00:00Z'), endDate: EXPIRING_IN_5,
        status: MembershipStatus.ACTIVE, cancelAtPeriodEnd: false,
      });
      const result = await svc.processAutoRenewals(NOW, 7);
      expect(result.created).toBe(1);
      expect(result.skipped).toBe(0);
      const renewals = [...stub.memberships.values()].filter((m) => m.status === MembershipStatus.PENDING_PAYMENT);
      expect(renewals).toHaveLength(1);
      expect(renewals[0].startDate).toEqual(EXPIRING_IN_5);
      const expectedEnd = new Date(EXPIRING_IN_5.getTime() + 30 * 24 * 60 * 60 * 1000);
      expect(renewals[0].endDate).toEqual(expectedEnd);
    });

    it('deduplicates: skips if PENDING_PAYMENT renewal already exists for member+plan', async () => {
      stub.memberships.set('ms1', {
        id: 'ms1', tenantId: 't1', memberId: 'm1', planId: 'plan-a',
        startDate: new Date('2026-05-07T00:00:00Z'), endDate: EXPIRING_IN_5,
        status: MembershipStatus.ACTIVE, cancelAtPeriodEnd: false,
      });
      // Pre-existing renewal
      stub.memberships.set('ms-renewal', {
        id: 'ms-renewal', tenantId: 't1', memberId: 'm1', planId: 'plan-a',
        startDate: EXPIRING_IN_5, endDate: new Date(EXPIRING_IN_5.getTime() + 30 * 24 * 60 * 60 * 1000),
        status: MembershipStatus.PENDING_PAYMENT, cancelAtPeriodEnd: false,
      });
      const result = await svc.processAutoRenewals(NOW, 7);
      expect(result.skipped).toBe(1);
      expect(result.created).toBe(0);
    });

    it('dispatches membership_renewal_reminder notification when member has phone', async () => {
      stub.memberships.set('ms1', {
        id: 'ms1', tenantId: 't1', memberId: 'm1', planId: 'plan-a',
        startDate: new Date('2026-05-07T00:00:00Z'), endDate: EXPIRING_IN_5,
        status: MembershipStatus.ACTIVE, cancelAtPeriodEnd: false,
      });
      await svc.processAutoRenewals(NOW, 7);
      expect(notificationsSpy.dispatch).toHaveBeenCalledOnce();
      expect(notificationsSpy.dispatch.mock.calls[0][0]).toMatchObject({
        category: 'membership_renewal_reminder',
        memberId: 'm1',
        to: '+971501234567',
      });
    });

    it('skips notification (no error) when member has no phone', async () => {
      stub.memberships.set('ms1', {
        id: 'ms1', tenantId: 't1', memberId: 'm2', planId: 'plan-a',
        startDate: new Date('2026-05-07T00:00:00Z'), endDate: EXPIRING_IN_5,
        status: MembershipStatus.ACTIVE, cancelAtPeriodEnd: false,
      });
      const result = await svc.processAutoRenewals(NOW, 7);
      expect(result.created).toBe(1);
      expect(notificationsSpy.dispatch).not.toHaveBeenCalled();
    });

    it('dispatches Arabic body for AR locale members', async () => {
      stub.memberships.set('ms1', {
        id: 'ms1', tenantId: 't1', memberId: 'm3', planId: 'plan-a',
        startDate: new Date('2026-05-07T00:00:00Z'), endDate: EXPIRING_IN_5,
        status: MembershipStatus.ACTIVE, cancelAtPeriodEnd: false,
      });
      await svc.processAutoRenewals(NOW, 7);
      const call = notificationsSpy.dispatch.mock.calls[0][0] as { bodyAr?: string; locale: string };
      expect(call.locale).toBe('AR');
      expect(call.bodyAr).toContain('ذهبي');
    });

    it('returns zero counts when no memberships are due', async () => {
      const result = await svc.processAutoRenewals(NOW, 7);
      expect(result).toEqual({ due: 0, created: 0, skipped: 0, failed: 0 });
    });
  });

  describe('sendPendingRenewalReminders()', () => {
    it('sends final reminders to PENDING_PAYMENT renewals starting within window', async () => {
      stub.memberships.set('ms-pend', {
        id: 'ms-pend', tenantId: 't1', memberId: 'm1', planId: 'plan-a',
        startDate: new Date('2026-06-02T00:00:00Z'), // 1 day from NOW
        endDate: new Date('2026-07-02T00:00:00Z'),
        status: MembershipStatus.PENDING_PAYMENT, cancelAtPeriodEnd: false,
        lastReminderSentAt: null,
      });
      const result = await svc.sendPendingRenewalReminders(NOW, 3);
      expect(result.sent).toBe(1);
      expect(notificationsSpy.dispatch).toHaveBeenCalledOnce();
      expect(notificationsSpy.dispatch.mock.calls[0][0]).toMatchObject({ category: 'membership_renewal_final_reminder' });
      // lastReminderSentAt should be stamped
      expect((stub.membership.update as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({
        where: { id: 'ms-pend' },
        data: { lastReminderSentAt: NOW },
      });
    });

    it('does not re-send if lastReminderSentAt already set', async () => {
      stub.memberships.set('ms-pend', {
        id: 'ms-pend', tenantId: 't1', memberId: 'm1', planId: 'plan-a',
        startDate: new Date('2026-06-02T00:00:00Z'),
        endDate: new Date('2026-07-02T00:00:00Z'),
        status: MembershipStatus.PENDING_PAYMENT, cancelAtPeriodEnd: false,
        lastReminderSentAt: new Date('2026-06-01T07:00:00Z'), // already reminded
      });
      const result = await svc.sendPendingRenewalReminders(NOW, 3);
      expect(result.found).toBe(0);
      expect(result.sent).toBe(0);
      expect(notificationsSpy.dispatch).not.toHaveBeenCalled();
    });
  });
});
