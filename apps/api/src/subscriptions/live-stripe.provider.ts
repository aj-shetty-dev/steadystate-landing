import { Inject, Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { ENV_TOKEN } from '../config/config.module';
import type { Env } from '../config/env.config';
import type {
  CheckoutSessionParams,
  CheckoutSessionResult,
  PortalSessionParams,
  PortalSessionResult,
  StripeProvider,
  StripeWebhookEvent,
} from './stripe.provider';

@Injectable()
export class LiveStripeProvider implements StripeProvider {
  private readonly logger = new Logger(LiveStripeProvider.name);
  private client: Stripe | null = null;

  constructor(@Inject(ENV_TOKEN) private readonly env: Env) {
    if (env.STRIPE_SECRET_KEY) {
      this.client = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2025-08-27.basil' });
    }
  }

  private getClient(): Stripe {
    if (!this.client) {
      throw new Error('Stripe client not initialised — set STRIPE_SECRET_KEY and STRIPE_MODE=live');
    }
    return this.client;
  }

  async createCustomer(email: string, tenantId: string): Promise<{ customerId: string }> {
    const customer = await this.getClient().customers.create({
      email,
      metadata: { tenantId },
    });
    this.logger.log(`Stripe createCustomer tenant=${tenantId} → ${customer.id}`);
    return { customerId: customer.id };
  }

  async createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSessionResult> {
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: params.priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: { tenantId: params.tenantId, plan: params.plan },
    };

    if (params.stripeCustomerId) {
      sessionParams.customer = params.stripeCustomerId;
    }

    const session = await this.getClient().checkout.sessions.create(sessionParams);

    if (!session.url) throw new Error('Stripe checkout session URL missing');
    return { url: session.url, sessionId: session.id };
  }

  async createPortalSession(params: PortalSessionParams): Promise<PortalSessionResult> {
    const session = await this.getClient().billingPortal.sessions.create({
      customer: params.stripeCustomerId,
      return_url: params.returnUrl,
    });
    return { url: session.url };
  }

  constructWebhookEvent(rawBody: Buffer, signature: string): StripeWebhookEvent {
    const event = this.getClient().webhooks.constructEvent(
      rawBody,
      signature,
      this.env.STRIPE_WEBHOOK_SECRET,
    );
    return {
      type: event.type,
      data: { object: event.data.object as unknown as Record<string, unknown> },
    };
  }
}
