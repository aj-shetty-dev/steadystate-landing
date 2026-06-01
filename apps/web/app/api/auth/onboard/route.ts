import { auth, clerkClient, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

const bodySchema = z.object({
  tenantName: z.string().min(1).max(100),
});

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ message: 'Unauthenticated' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid input' }, { status: 400 });
  }

  const clerkUser = await currentUser();
  if (!clerkUser) return NextResponse.json({ message: 'User not found' }, { status: 404 });

  const fullName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || 'Unknown';
  const email = clerkUser.emailAddresses[0]?.emailAddress ?? '';

  // Generate a URL-safe slug from the tenant name
  const slug = parsed.data.tenantName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) + '-' + Date.now().toString(36);

  // Create tenant, user, and trial subscription in a transaction
  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: parsed.data.tenantName,
        slug,
        country: 'AE',
        city: 'Dubai',
      },
    });

    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        clerkId: userId,
        email,
        fullName,
        role: 'OWNER',
      },
    });

    // Start a 14-day trial
    const now = new Date();
    const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    await tx.subscription.create({
      data: {
        tenantId: tenant.id,
        plan: 'STARTER',
        status: 'TRIALING',
        trialEndsAt: trialEnd,
        currentPeriodStart: now,
        currentPeriodEnd: trialEnd,
      },
    });

    return { tenant, user };
  });

  // Set Clerk public metadata for server-side tenant scoping
  try {
    const clerk = await clerkClient();
    await clerk.users.updateUser(userId, {
      publicMetadata: {
        tenantId: result.tenant.id,
        internalUserId: result.user.id,
        role: 'OWNER',
      },
    });
  } catch (err) {
    // clerkClient() may fail if CLERK_SECRET_KEY isn't in the environment.
    // The DB records exist — the user just needs a re-login once the key is configured.
    console.error('Failed to update Clerk metadata — user must re-login:', err);
    return NextResponse.json({
      tenant: {
        id: result.tenant.id,
        name: result.tenant.name,
        slug: result.tenant.slug,
      },
      user: {
        id: result.user.id,
        email: result.user.email,
        fullName: result.user.fullName,
        role: result.user.role,
      },
      warning: 'Session refresh required. Please sign out and sign back in.',
    });
  }

  return NextResponse.json({
    tenant: {
      id: result.tenant.id,
      name: result.tenant.name,
      slug: result.tenant.slug,
    },
    user: {
      id: result.user.id,
      email: result.user.email,
      fullName: result.user.fullName,
      role: result.user.role,
    },
  });
}
