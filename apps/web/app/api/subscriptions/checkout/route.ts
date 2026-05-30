import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { z } from 'zod';

const checkoutBodySchema = z.object({
  plan: z.enum(['STARTER', 'GROWTH', 'SCALE']).default('STARTER'),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

const PLAN_PRICE_ENV_MAP: Record<string, string> = {
  STARTER: 'STRIPE_PRICE_STARTER',
  GROWTH: 'STRIPE_PRICE_GROWTH',
  SCALE: 'STRIPE_PRICE_SCALE',
};

// ---------------------------------------------------------------------------
// POST /api/subscriptions/checkout
// Create a Stripe checkout session for a subscription plan.
// Matching NestJS SubscriptionController.checkout →
// SubscriptionService.createCheckoutSession
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const user = await requireServerUser();
  const body = await req.json();

  const parsed = checkoutBodySchema.parse(body);

  // Find or create Stripe customer for this tenant
  const sub = await prisma.subscription.findUnique({
    where: { tenantId: user.tenantId },
  });

  const isMock =
    (process.env.STRIPE_MODE ?? 'mock') === 'mock' ||
    (process.env.BILLING_PROVIDER_MODE ?? 'mock') === 'mock';

  if (isMock) {
    // Return a mock checkout URL matching MockStripeProvider behavior
    const sessionId = `cs_mock_${Date.now().toString(36)}`;
    const url = `https://mock-stripe.local/checkout/${sessionId}?plan=${parsed.plan}&tenant=${user.tenantId}`;
    return NextResponse.json({ url });
  }

  // ── Live Stripe mode ──
  const Stripe = (await import('stripe')).default;
  const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
    apiVersion: '2024-12-18.acacia' as any,
  });

  let stripeCustomerId = sub?.stripeCustomerId ?? null;

  if (!stripeCustomerId) {
    const customer = await stripeClient.customers.create({
      email: user.email,
      metadata: { tenantId: user.tenantId },
    });
    stripeCustomerId = customer.id;

    if (sub) {
      await prisma.subscription.update({
        where: { tenantId: user.tenantId },
        data: { stripeCustomerId },
      });
    }
  }

  const priceEnvKey = PLAN_PRICE_ENV_MAP[parsed.plan];
  if (!priceEnvKey) {
    return NextResponse.json(
      { message: `Unknown plan: ${parsed.plan}` },
      { status: 400 },
    );
  }
  const priceId = process.env[priceEnvKey];
  if (!priceId) {
    return NextResponse.json(
      { message: `Price ID not configured for plan: ${parsed.plan}` },
      { status: 500 },
    );
  }

  const session = await stripeClient.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: parsed.successUrl,
    cancel_url: parsed.cancelUrl,
    customer: stripeCustomerId,
    metadata: { tenantId: user.tenantId, plan: parsed.plan },
  });

  if (!session.url) {
    return NextResponse.json(
      { message: 'Stripe checkout session URL missing' },
      { status: 500 },
    );
  }

  return NextResponse.json({ url: session.url });
}
