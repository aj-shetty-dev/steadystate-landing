import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';

function mapStripeStatus(stripeStatus: string): SubscriptionStatus {
  switch (stripeStatus) {
    case 'active':
      return 'ACTIVE';
    case 'trialing':
      return 'TRIALING';
    case 'past_due':
    case 'unpaid':
      return 'PAST_DUE';
    case 'canceled':
    case 'cancelled':
      return 'CANCELLED';
    default:
      return 'EXPIRED';
  }
}

interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

/**
 * Verify and construct a Stripe webhook event.
 * In mock mode: parse as JSON directly.
 * In live mode: verify the Stripe signature.
 */
async function constructEvent(
  rawBody: string,
  signature: string | null,
): Promise<StripeEvent> {
  const isMock =
    (process.env.STRIPE_MODE ?? 'mock') === 'mock' ||
    (process.env.BILLING_PROVIDER_MODE ?? 'mock') === 'mock';

  if (isMock) {
    const parsed = JSON.parse(rawBody) as StripeEvent;
    if (!parsed.id) parsed.id = `evt_mock_${Date.now()}`;
    return parsed;
  }

  // Live mode: verify Stripe signature
  const Stripe = (await import('stripe')).default;
  const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
    apiVersion: '2024-12-18.acacia' as any,
  });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature) {
    throw new Error('Missing Stripe signature header');
  }
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET not configured');
  }

  const event = stripeClient.webhooks.constructEvent(
    rawBody,
    signature,
    webhookSecret,
  );

  return {
    id: event.id,
    type: event.type,
    data: { object: event.data.object as unknown as Record<string, unknown> },
  };
}

/**
 * Process a verified Stripe webhook event.
 * Matching NestJS SubscriptionService.processStripeEvent
 */
async function processEvent(event: StripeEvent): Promise<void> {
  const obj = event.data.object;

  switch (event.type) {
    case 'checkout.session.completed': {
      const meta = obj['metadata'] as Record<string, string> | undefined;
      const tenantId = meta?.['tenantId'];
      const subscriptionId = obj['subscription'] as string | undefined;
      const customerId = obj['customer'] as string | undefined;
      if (!tenantId || !subscriptionId || !customerId) break;

      await prisma.subscription.upsert({
        where: { tenantId },
        create: {
          tenantId,
          status: 'ACTIVE',
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          provider: 'stripe',
        },
        update: {
          status: 'ACTIVE',
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          provider: 'stripe',
        },
      });
      break;
    }

    case 'customer.subscription.updated': {
      const stripeSubId = obj['id'] as string;
      if (!stripeSubId) break;
      const status = mapStripeStatus(obj['status'] as string);
      const periodStart = obj['current_period_start'] as number | undefined;
      const periodEnd = obj['current_period_end'] as number | undefined;

      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: stripeSubId },
        data: {
          status,
          ...(periodStart
            ? { currentPeriodStart: new Date(periodStart * 1000) }
            : {}),
          ...(periodEnd
            ? { currentPeriodEnd: new Date(periodEnd * 1000) }
            : {}),
        },
      });
      break;
    }

    case 'customer.subscription.deleted': {
      const stripeSubId = obj['id'] as string;
      if (!stripeSubId) break;

      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: stripeSubId },
        data: { status: 'CANCELLED' },
      });
      break;
    }

    case 'invoice.paid':
    case 'invoice.payment_succeeded': {
      const stripeSubId = obj['subscription'] as string | undefined;
      if (!stripeSubId) break;

      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: stripeSubId },
        data: { status: 'ACTIVE' },
      });
      break;
    }

    case 'invoice.payment_failed': {
      const stripeSubId = obj['subscription'] as string | undefined;
      if (!stripeSubId) break;

      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: stripeSubId },
        data: { status: 'PAST_DUE' },
      });
      break;
    }

    default:
      // Unhandled events are silently ignored
      break;
  }
}

// ---------------------------------------------------------------------------
// POST /api/subscriptions/webhook
// Handle Stripe webhook events.
// Matching NestJS SubscriptionController.webhook →
// SubscriptionService.handleProviderWebhook →
// SubscriptionService.processStripeEvent
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');

  try {
    const event = await constructEvent(rawBody, signature);
    await processEvent(event);
    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Stripe webhook error:', message);
    return NextResponse.json(
      { message: `Webhook error: ${message}` },
      { status: 400 },
    );
  }
}
