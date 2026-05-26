import { Inject, Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { ENV_TOKEN } from '../config/config.module';
import type { Env } from '../config/env.config';

export interface PaymentIntentParams {
  amountAed: number;
  description?: string;
  customerId?: string;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
}

export interface PaymentIntentResult {
  id: string;
  clientSecret: string | null;
  status: string;
  amount: number;
  currency: string;
}

export interface CustomerParams {
  email?: string;
  phone?: string;
  name?: string;
  metadata?: Record<string, string>;
}

export interface SubscriptionParams {
  customerId: string;
  priceId: string;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
}

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly client: Stripe | null;
  private readonly mockCounter = { intent: 0, customer: 0, sub: 0, event: 0 };

  constructor(@Inject(ENV_TOKEN) private readonly env: Env) {
    if (env.STRIPE_MODE === 'live') {
      if (!env.STRIPE_SECRET_KEY) {
        throw new Error('STRIPE_MODE=live requires STRIPE_SECRET_KEY');
      }
      this.client = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion });
    } else {
      this.client = null;
      this.logger.warn('StripeService running in MOCK mode — no real charges');
    }
  }

  isLive(): boolean {
    return this.client !== null;
  }

  async createCustomer(params: CustomerParams): Promise<{ id: string }> {
    if (!this.client) {
      const id = `cus_mock_${++this.mockCounter.customer}`;
      return { id };
    }
    const c = await this.client.customers.create({
      email: params.email,
      phone: params.phone,
      name: params.name,
      metadata: params.metadata,
    });
    return { id: c.id };
  }

  async createPaymentIntent(params: PaymentIntentParams): Promise<PaymentIntentResult> {
    const amount = params.amountAed; // amount is fils (AED * 100 already from caller? we accept the smallest unit)
    if (!this.client) {
      const id = `pi_mock_${++this.mockCounter.intent}`;
      return {
        id,
        clientSecret: `${id}_secret_mock`,
        status: 'requires_payment_method',
        amount,
        currency: this.env.STRIPE_DEFAULT_CURRENCY,
      };
    }
    const intent = await this.client.paymentIntents.create(
      {
        amount,
        currency: this.env.STRIPE_DEFAULT_CURRENCY,
        description: params.description,
        customer: params.customerId,
        metadata: params.metadata,
        automatic_payment_methods: { enabled: true },
      },
      params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined,
    );
    return {
      id: intent.id,
      clientSecret: intent.client_secret,
      status: intent.status,
      amount: intent.amount,
      currency: intent.currency,
    };
  }

  async createSubscription(params: SubscriptionParams): Promise<{ id: string; status: string; clientSecret: string | null }> {
    if (!this.client) {
      const id = `sub_mock_${++this.mockCounter.sub}`;
      return { id, status: 'active', clientSecret: null };
    }
    const sub = await this.client.subscriptions.create(
      {
        customer: params.customerId,
        items: [{ price: params.priceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
        metadata: params.metadata,
      },
      params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined,
    );
    const invoice = sub.latest_invoice as (Stripe.Invoice & { payment_intent?: string | Stripe.PaymentIntent | null }) | null;
    const piRaw = invoice?.payment_intent;
    const pi = piRaw && typeof piRaw === 'object' ? piRaw : null;
    return { id: sub.id, status: sub.status, clientSecret: pi?.client_secret ?? null };
  }

  async cancelSubscription(subscriptionId: string): Promise<{ id: string; status: string }> {
    if (!this.client) return { id: subscriptionId, status: 'canceled' };
    const sub = await this.client.subscriptions.cancel(subscriptionId);
    return { id: sub.id, status: sub.status };
  }

  async refund(paymentIntentId: string, amount?: number): Promise<{ id: string; status: string }> {
    if (!this.client) {
      return { id: `re_mock_${++this.mockCounter.event}`, status: 'succeeded' };
    }
    const r = await this.client.refunds.create({ payment_intent: paymentIntentId, amount });
    return { id: r.id, status: r.status ?? 'unknown' };
  }

  /**
   * Verify and construct a Stripe webhook event. In mock mode the payload is parsed as JSON
   * (no signature check) — only acceptable in test/dev.
   */
  constructEvent(payload: Buffer | string, signature: string | undefined): Stripe.Event {
    if (!this.client) {
      const raw = typeof payload === 'string' ? payload : payload.toString('utf8');
      const evt = JSON.parse(raw) as Stripe.Event;
      if (!evt.id) evt.id = `evt_mock_${++this.mockCounter.event}`;
      return evt;
    }
    if (!signature) throw new Error('Missing Stripe signature');
    if (!this.env.STRIPE_WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET not configured');
    return this.client.webhooks.constructEvent(payload, signature, this.env.STRIPE_WEBHOOK_SECRET);
  }
}
