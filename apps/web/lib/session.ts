import { auth, currentUser } from '@clerk/nextjs/server';

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  tenantId: string;
  role: 'OWNER' | 'STAFF' | 'SUPER_ADMIN';
}

/** Returns the current Clerk session token to forward as Bearer to the API. */
export async function getAccessToken(): Promise<string | null> {
  const { getToken } = await auth();
  return getToken();
}

/**
 * Returns session user info from Clerk publicMetadata (set during onboarding).
 * Returns null if not signed in or not yet onboarded.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
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
    role: (meta.role as SessionUser['role']) ?? 'OWNER',
  };
}

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  return user;
}

