import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CheckoutSessionParams,
  CheckoutSessionResult,
  PortalSessionParams,
  PortalSessionResult,
  StripeProvider,
  StripeWebhookEvent,
} from './stripe.provider';

@Injectable()
export class MockStripeProvider implements StripeProvider {
  private readonly logger = new Logger(MockStripeProvider.name);

  async createCustomer(email: string, tenantId: string): Promise<{ customerId: string }> {
    const customerId = `cus_mock_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    this.logger.log(`[MOCK] Stripe createCustomer email=${email} tenant=${tenantId} → ${customerId}`);
    return { customerId };
  }

  async createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSessionResult> {
    const sessionId = `cs_mock_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const url = `https://mock-stripe.local/checkout/${sessionId}?plan=${params.plan}&tenant=${params.tenantId}`;
    this.logger.log(`[MOCK] Stripe createCheckoutSession plan=${params.plan} → ${sessionId}`);
    return { url, sessionId };
  }

  async createPortalSession(params: PortalSessionParams): Promise<PortalSessionResult> {
    const url = `https://mock-stripe.local/portal/${params.stripeCustomerId}?return=${encodeURIComponent(params.returnUrl)}`;
    this.logger.log(`[MOCK] Stripe createPortalSession customer=${params.stripeCustomerId}`);
    return { url };
  }

  constructWebhookEvent(rawBody: Buffer, _signature: string): StripeWebhookEvent {
    const payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    return {
      type: (payload['type'] as string) ?? 'mock.event',
      data: { object: (payload['data'] as { object: Record<string, unknown> })?.object ?? {} },
    };
  }
}
