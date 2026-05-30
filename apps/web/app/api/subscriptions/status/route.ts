import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';

// ---------------------------------------------------------------------------
// GET /api/subscriptions/status
// Get current tenant's subscription status.
// Matching NestJS SubscriptionController.current → SubscriptionService
// ---------------------------------------------------------------------------
export async function GET(_req: NextRequest) {
  const user = await requireServerUser();

  const subscription = await prisma.subscription.findUnique({
    where: { tenantId: user.tenantId },
  });

  if (!subscription) {
    return NextResponse.json({
      status: 'EXPIRED',
      subscription: null,
    });
  }

  // Sync trial expiry
  let status = subscription.status;
  if (
    status === 'TRIALING' &&
    subscription.trialEndsAt &&
    subscription.trialEndsAt.getTime() <= Date.now()
  ) {
    await prisma.subscription.update({
      where: { tenantId: user.tenantId },
      data: { status: 'EXPIRED' },
    });
    status = 'EXPIRED';
  }

  return NextResponse.json({ status, subscription });
}
