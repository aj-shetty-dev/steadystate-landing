import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { z } from 'zod';

const portalBodySchema = z.object({
  returnUrl: z.string().url(),
});

// ---------------------------------------------------------------------------
// POST /api/subscriptions/portal
// Create a Stripe customer portal session.
// Matching NestJS SubscriptionController.portal →
// SubscriptionService.createPortalSession
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const user = await requireServerUser();
  const body = await req.json();

  const parsed = portalBodySchema.parse(body);

  const sub = await prisma.subscription.findUnique({
    where: { tenantId: user.tenantId },
  });

  if (!sub?.stripeCustomerId) {
    return NextResponse.json(
      { message: 'No Stripe customer found. Complete a checkout first.' },
      { status: 404 },
    );
  }

  const isMock =
    (process.env.STRIPE_MODE ?? 'mock') === 'mock' ||
    (process.env.BILLING_PROVIDER_MODE ?? 'mock') === 'mock';

  if (isMock) {
    // Return a mock portal URL matching MockStripeProvider behavior
    const url = `https://mock-stripe.local/portal/${sub.stripeCustomerId}?return=${encodeURIComponent(parsed.returnUrl)}`;
    return NextResponse.json({ url });
  }

  // ── Live Stripe mode ──
  const Stripe = (await import('stripe')).default;
  const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
    apiVersion: '2024-12-18.acacia' as any,
  });

  const session = await stripeClient.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: parsed.returnUrl,
  });

  return NextResponse.json({ url: session.url });
}
