export const STRIPE_PROVIDER = 'STRIPE_PROVIDER';

export interface CheckoutSessionParams {
  tenantId: string;
  plan: string;
  stripeCustomerId: string | null;
  successUrl: string;
  cancelUrl: string;
  priceId: string;
}

export interface CheckoutSessionResult {
  url: string;
  sessionId: string;
}

export interface PortalSessionParams {
  stripeCustomerId: string;
  returnUrl: string;
}

export interface PortalSessionResult {
  url: string;
}

export interface StripeWebhookEvent {
  type: string;
  data: { object: Record<string, unknown> };
}

export interface StripeProvider {
  createCustomer(email: string, tenantId: string): Promise<{ customerId: string }>;
  createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSessionResult>;
  createPortalSession(params: PortalSessionParams): Promise<PortalSessionResult>;
  constructWebhookEvent(rawBody: Buffer, signature: string): StripeWebhookEvent;
}
