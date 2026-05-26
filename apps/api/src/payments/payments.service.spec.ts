import { PaymentStatus } from '@prisma/client';
import Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentsService } from './payments.service';

function makeStub() {
  const sales = new Map<string, { id: string; tenantId: string; totalAed: number; refundedAed: number; memberId: string | null; paymentStatus: PaymentStatus; stripePaymentIntentId: string | null; type: string }>();
  const members = new Map<string, { id: string; tenantId: string; fullName: string; email: string | null; phone: string | null }>();
  const customers = new Map<string, { id: string; memberId: string; stripeCustomerId: string }>();
  const events = new Map<string, { eventId: string; type: string }>();

  const stub = {
    sales, members, customers, events,
    member: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string } }) => {
        const m = members.get(where.id);
        return m && m.tenantId === where.tenantId ? m : null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<{ fullName: string; email: string | null; phone: string | null }> }) => {
        const m = members.get(where.id)!;
        Object.assign(m, data);
        return m;
      }),
    },
    stripeCustomer: {
      findUnique: vi.fn(async ({ where }: { where: { memberId: string } }) => {
        for (const c of customers.values()) if (c.memberId === where.memberId) return c;
        return null;
      }),
      create: vi.fn(async ({ data }: { data: { tenantId: string; memberId: string; stripeCustomerId: string } }) => {
        const id = `sc_${customers.size + 1}`;
        const row = { id, ...data };
        customers.set(id, row);
        return row;
      }),
    },
    sale: {
      findFirst: vi.fn(async ({ where }: { where: { id?: string; tenantId?: string; stripePaymentIntentId?: string } }) => {
        if (where.id) {
          const s = sales.get(where.id);
          return s && (!where.tenantId || s.tenantId === where.tenantId) ? s : null;
        }
        if (where.stripePaymentIntentId) {
          for (const s of sales.values()) if (s.stripePaymentIntentId === where.stripePaymentIntentId) return s;
        }
        return null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<typeof sales extends Map<string, infer V> ? V : never> }) => {
        const s = sales.get(where.id)!;
        Object.assign(s, data);
        return s;
      }),
    },

    stripeEvent: {
      findUnique: vi.fn(async ({ where }: { where: { eventId: string } }) => events.get(where.eventId) ?? null),
      create: vi.fn(async ({ data }: { data: { eventId: string; type: string } }) => {
        events.set(data.eventId, data);
        return data;
      }),
    },
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === 'function') return (arg as (tx: typeof stub) => unknown)(stub);
      return Promise.all(arg as Promise<unknown>[]);
    }),
  };
  return stub;
}

function makeStripeMock() {
  return {
    isLive: () => false,
    createCustomer: vi.fn(async () => ({ id: `cus_${Math.random().toString(36).slice(2, 8)}` })),
    createPaymentIntent: vi.fn(async (p: { amountAed: number }) => ({
      id: `pi_${Math.random().toString(36).slice(2, 8)}`,
      clientSecret: 'cs_mock',
      status: 'requires_payment_method',
      amount: p.amountAed,
      currency: 'aed',
    })),
    createSubscription: vi.fn(),
    refund: vi.fn(async () => ({ id: `re_mock_${Math.random().toString(36).slice(2, 6)}`, status: 'succeeded' })),
    cancelSubscription: vi.fn(),
    constructEvent: vi.fn(),
  };
}

describe('PaymentsService', () => {
  let stub: ReturnType<typeof makeStub>;
  let stripe: ReturnType<typeof makeStripeMock>;
  let svc: PaymentsService;

  beforeEach(() => {
    stub = makeStub();
    stripe = makeStripeMock();
    svc = new PaymentsService(stub as never, stripe as never);
  });

  it('ensureCustomer is idempotent — creates once, returns cached on subsequent calls', async () => {
    stub.members.set('m1', { id: 'm1', tenantId: 't', fullName: 'Ali', email: 'a@x.com', phone: '+9715' });
    const first = await svc.ensureCustomer({ tenantId: 't', memberId: 'm1' });
    const second = await svc.ensureCustomer({ tenantId: 't', memberId: 'm1' });
    expect(first.stripeCustomerId).toBe(second.stripeCustomerId);
    expect(stripe.createCustomer).toHaveBeenCalledOnce();
  });

  it('createSalePaymentIntent stores intent id on Sale', async () => {
    stub.members.set('m1', { id: 'm1', tenantId: 't', fullName: 'Ali', email: null, phone: null });
    stub.sales.set('s1', { id: 's1', tenantId: 't', totalAed: 15000, refundedAed: 0, memberId: 'm1', paymentStatus: PaymentStatus.PENDING, stripePaymentIntentId: null, type: 'DROP_IN' });
    const out = await svc.createSalePaymentIntent('t', 's1');
    expect(out.paymentIntentId).toMatch(/^pi_/);
    expect(stub.sales.get('s1')!.stripePaymentIntentId).toBe(out.paymentIntentId);
  });

  it('createSalePaymentIntent throws if sale already paid', async () => {
    stub.sales.set('s1', { id: 's1', tenantId: 't', totalAed: 15000, refundedAed: 0, memberId: null, paymentStatus: PaymentStatus.PAID, stripePaymentIntentId: 'pi_old', type: 'DROP_IN' });
    await expect(svc.createSalePaymentIntent('t', 's1')).rejects.toThrow(/paid/i);
  });

  it('webhook payment_intent.succeeded marks Sale PAID', async () => {
    stub.sales.set('s1', { id: 's1', tenantId: 't', totalAed: 15000, refundedAed: 0, memberId: null, paymentStatus: PaymentStatus.PENDING, stripePaymentIntentId: 'pi_x', type: 'DROP_IN' });
    const evt = { id: 'evt_1', type: 'payment_intent.succeeded', data: { object: { id: 'pi_x' } } } as unknown as Stripe.Event;
    await svc.handleWebhookEvent(evt);
    expect(stub.sales.get('s1')!.paymentStatus).toBe(PaymentStatus.PAID);
  });

  it('webhook is idempotent by event.id', async () => {
    const evt = { id: 'evt_dupe', type: 'payment_intent.succeeded', data: { object: { id: 'pi_nope' } } } as unknown as Stripe.Event;
    await svc.handleWebhookEvent(evt);
    const second = await svc.handleWebhookEvent(evt);
    expect(second.duplicate).toBe(true);
  });

  // ── Refund tests ──

  it('refundSale performs full refund for a PAID sale', async () => {
    stub.sales.set('s1', { id: 's1', tenantId: 't', totalAed: 15000, refundedAed: 0, memberId: null, paymentStatus: PaymentStatus.PAID, stripePaymentIntentId: 'pi_x', type: 'DROP_IN' });
    const result = await svc.refundSale('t', 's1');
    expect(result.refundedAed).toBe(15000);
    expect(result.salePaymentStatus).toBe('REFUNDED');
    expect(stub.sales.get('s1')!.paymentStatus).toBe(PaymentStatus.REFUNDED);
    expect(stub.sales.get('s1')!.refundedAed).toBe(15000);
  });

  it('refundSale supports partial refund', async () => {
    stub.sales.set('s1', { id: 's1', tenantId: 't', totalAed: 15000, refundedAed: 0, memberId: null, paymentStatus: PaymentStatus.PAID, stripePaymentIntentId: 'pi_x', type: 'DROP_IN' });
    const result = await svc.refundSale('t', 's1', 5000);
    expect(result.refundedAed).toBe(5000);
    expect(result.salePaymentStatus).toBe('PARTIALLY_REFUNDED');
    expect(stub.sales.get('s1')!.paymentStatus).toBe(PaymentStatus.PARTIALLY_REFUNDED);
  });

  it('refundSale throws if sale is not PAID or PARTIALLY_REFUNDED', async () => {
    stub.sales.set('s1', { id: 's1', tenantId: 't', totalAed: 15000, refundedAed: 0, memberId: null, paymentStatus: PaymentStatus.PENDING, stripePaymentIntentId: 'pi_x', type: 'DROP_IN' });
    await expect(svc.refundSale('t', 's1')).rejects.toThrow(/only paid/i);
  });

  it('refundSale throws if no payment intent', async () => {
    stub.sales.set('s1', { id: 's1', tenantId: 't', totalAed: 15000, refundedAed: 0, memberId: null, paymentStatus: PaymentStatus.PAID, stripePaymentIntentId: null, type: 'DROP_IN' });
    await expect(svc.refundSale('t', 's1')).rejects.toThrow(/no payment intent/i);
  });

  it('refundSale throws if refund exceeds remaining amount', async () => {
    stub.sales.set('s1', { id: 's1', tenantId: 't', totalAed: 15000, refundedAed: 0, memberId: null, paymentStatus: PaymentStatus.PAID, stripePaymentIntentId: 'pi_x', type: 'DROP_IN' });
    await expect(svc.refundSale('t', 's1', 20000)).rejects.toThrow(/exceeds/i);
  });
});
