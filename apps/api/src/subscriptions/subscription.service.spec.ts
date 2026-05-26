import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockStripeProvider } from './mock-stripe.provider';
import { SubscriptionService } from './subscription.service';

const BASE_ENV = {
  BILLING_PROVIDER_MODE: 'mock' as const,
  STRIPE_MODE: 'mock' as const,
  STRIPE_PRICE_STARTER: 'price_mock_starter',
  STRIPE_PRICE_GROWTH: 'price_mock_growth',
  STRIPE_PRICE_SCALE: 'price_mock_scale',
};
const mockEnv = BASE_ENV as never;

type SubRow = {
  id: string;
  tenantId: string;
  plan: string;
  status: string;
  trialEndsAt: Date | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  provider: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
};

function makePrismaStub() {
  const rows = new Map<string, SubRow>();
  return {
    rows,
    subscription: {
      findUnique: vi.fn(async ({ where }: { where: { tenantId?: string; id?: string } }) => {
        if (where.tenantId) return rows.get(where.tenantId) ?? null;
        return [...rows.values()].find((r) => r.id === where.id) ?? null;
      }),
      create: vi.fn(async ({ data }: { data: Partial<SubRow> }) => {
        const row: SubRow = {
          id: `sub_${Date.now()}`,
          plan: 'STARTER',
          status: 'TRIALING',
          trialEndsAt: null,
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          provider: null,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          ...data,
          tenantId: data.tenantId!,
        };
        rows.set(row.tenantId, row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { tenantId: string }; data: Partial<SubRow> }) => {
        const row = rows.get(where.tenantId);
        if (!row) throw new Error('not found');
        Object.assign(row, data);
        return row;
      }),
      upsert: vi.fn(async ({ where, create, update }: { where: { tenantId: string }; create: Partial<SubRow>; update: Partial<SubRow> }) => {
        const existing = rows.get(where.tenantId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row: SubRow = { id: `sub_${Date.now()}`, plan: 'STARTER', status: 'TRIALING', trialEndsAt: null, stripeCustomerId: null, stripeSubscriptionId: null, provider: null, currentPeriodStart: null, currentPeriodEnd: null, ...create, tenantId: where.tenantId };
        rows.set(where.tenantId, row);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { stripeSubscriptionId: string }; data: Partial<SubRow> }) => {
        for (const row of rows.values()) {
          if (row.stripeSubscriptionId === where.stripeSubscriptionId) {
            Object.assign(row, data);
          }
        }
        return { count: 1 };
      }),
    },
  };
}

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let prisma: ReturnType<typeof makePrismaStub>;
  let stripe: MockStripeProvider;

  beforeEach(() => {
    prisma = makePrismaStub();
    stripe = new MockStripeProvider();
    service = new SubscriptionService(prisma as never, mockEnv, stripe);
  });

  describe('startTrial', () => {
    it('creates a TRIALING subscription', async () => {
      const sub = await service.startTrial('t1');
      expect(sub.status).toBe('TRIALING');
      expect(sub.tenantId).toBe('t1');
    });

    it('is idempotent — returns existing subscription if one exists', async () => {
      const first = await service.startTrial('t1');
      const second = await service.startTrial('t1');
      expect(first.id).toBe(second.id);
      expect(prisma.subscription.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('syncStatusFromTrial', () => {
    it('returns EXPIRED and updates DB when trial has ended', async () => {
      await service.startTrial('t1');
      const row = prisma.rows.get('t1')!;
      row.trialEndsAt = new Date(Date.now() - 1000);

      const status = await service.syncStatusFromTrial('t1');
      expect(status).toBe('EXPIRED');
      expect(prisma.rows.get('t1')!.status).toBe('EXPIRED');
    });

    it('returns TRIALING when trial is still active', async () => {
      await service.startTrial('t1');
      const row = prisma.rows.get('t1')!;
      row.trialEndsAt = new Date(Date.now() + 86_400_000);

      const status = await service.syncStatusFromTrial('t1');
      expect(status).toBe('TRIALING');
    });

    it('returns EXPIRED when no subscription exists', async () => {
      const status = await service.syncStatusFromTrial('unknown_tenant');
      expect(status).toBe('EXPIRED');
    });
  });

  describe('createCheckoutSession', () => {
    it('creates a Stripe customer and returns checkout URL', async () => {
      await service.startTrial('t1');
      const result = await service.createCheckoutSession(
        't1',
        'owner@gym.ae',
        'STARTER',
        'https://app.example/success',
        'https://app.example/cancel',
      );
      expect(result.url).toContain('mock-stripe.local');
      expect(result.url).toContain('STARTER');
    });

    it('reuses existing stripeCustomerId', async () => {
      await service.startTrial('t1');
      prisma.rows.get('t1')!.stripeCustomerId = 'cus_existing';
      const createCustomerSpy = vi.spyOn(stripe, 'createCustomer');

      await service.createCheckoutSession('t1', 'owner@gym.ae', 'GROWTH', 'https://s', 'https://c');
      expect(createCustomerSpy).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for unknown plan', async () => {
      await service.startTrial('t1');
      await expect(
        service.createCheckoutSession('t1', 'e@g.ae', 'UNKNOWN' as never, 'https://s', 'https://c'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('createPortalSession', () => {
    it('returns portal URL when stripeCustomerId is set', async () => {
      await service.startTrial('t1');
      prisma.rows.get('t1')!.stripeCustomerId = 'cus_abc123';

      const result = await service.createPortalSession('t1', 'https://app.example/settings');
      expect(result.url).toContain('cus_abc123');
    });

    it('throws NotFoundException when no Stripe customer exists', async () => {
      await service.startTrial('t1');
      await expect(service.createPortalSession('t1', 'https://app.example')).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('handleProviderWebhook', () => {
    it('is a no-op in mock mode', async () => {
      await expect(
        service.handleProviderWebhook('stripe', Buffer.from('{}'), 'sig'),
      ).resolves.toBeUndefined();
    });

    it('activates subscription on checkout.session.completed', async () => {
      const liveEnv = { ...BASE_ENV, BILLING_PROVIDER_MODE: 'stripe' } as never;
      const liveSvc = new SubscriptionService(prisma as never, liveEnv, stripe);

      const payload = {
        type: 'checkout.session.completed',
        data: {
          object: {
            metadata: { tenantId: 't2' },
            subscription: 'sub_123',
            customer: 'cus_456',
          },
        },
      };
      const raw = Buffer.from(JSON.stringify(payload));
      await liveSvc.handleProviderWebhook('stripe', raw, 'any');

      const sub = prisma.rows.get('t2');
      expect(sub?.status).toBe('ACTIVE');
      expect(sub?.stripeSubscriptionId).toBe('sub_123');
    });

    it('sets PAST_DUE on invoice.payment_failed', async () => {
      const liveEnv = { ...BASE_ENV, BILLING_PROVIDER_MODE: 'stripe' } as never;
      const liveSvc = new SubscriptionService(prisma as never, liveEnv, stripe);

      await service.startTrial('t3');
      prisma.rows.get('t3')!.stripeSubscriptionId = 'sub_999';

      const payload = {
        type: 'invoice.payment_failed',
        data: { object: { subscription: 'sub_999' } },
      };
      await liveSvc.handleProviderWebhook('stripe', Buffer.from(JSON.stringify(payload)), 'any');
      expect(prisma.rows.get('t3')!.status).toBe('PAST_DUE');
    });

    it('cancels subscription on customer.subscription.deleted', async () => {
      const liveEnv = { ...BASE_ENV, BILLING_PROVIDER_MODE: 'stripe' } as never;
      const liveSvc = new SubscriptionService(prisma as never, liveEnv, stripe);

      await service.startTrial('t4');
      prisma.rows.get('t4')!.stripeSubscriptionId = 'sub_del';

      const payload = {
        type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_del' } },
      };
      await liveSvc.handleProviderWebhook('stripe', Buffer.from(JSON.stringify(payload)), 'any');
      expect(prisma.rows.get('t4')!.status).toBe('CANCELLED');
    });
  });
});
