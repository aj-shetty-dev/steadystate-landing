import { auth, currentUser } from '@clerk/nextjs/server';

export interface ServerUser {
  id: string;
  email: string;
  fullName: string;
  tenantId: string;
  role: 'OWNER' | 'STAFF' | 'SUPER_ADMIN';
}

/**
 * Returns the authenticated user from the Clerk session cookie.
 * Use this in server-side route handlers and server components.
 * Returns null if not signed in or not yet onboarded.
 */
export async function getServerUser(): Promise<ServerUser | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const user = await currentUser();
  if (!user) return null;

  const meta = user.publicMetadata as {
    tenantId?: string;
    internalUserId?: string;
    role?: string;
  };

  if (!meta.tenantId || !meta.internalUserId) return null;

  const email = user.emailAddresses[0]?.emailAddress ?? '';
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || email;

  return {
    id: meta.internalUserId,
    email,
    fullName,
    tenantId: meta.tenantId,
    role: (meta.role as ServerUser['role']) ?? 'OWNER',
  };
}

/**
 * Returns the authenticated user or throws if not authenticated.
 */
export async function requireServerUser(): Promise<ServerUser> {
  const user = await getServerUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  return user;
}

/**
 * Validates that the user belongs to a tenant and returns the tenantId.
 * Use this to scope all Prisma queries for multi-tenant isolation.
 */
export async function requireTenantId(): Promise<string> {
  const user = await requireServerUser();
  return user.tenantId;
}
