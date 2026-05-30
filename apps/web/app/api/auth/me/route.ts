import { NextRequest, NextResponse } from 'next/server';
import { requireServerUser } from '@/lib/auth-server';

// ---------------------------------------------------------------------------
// GET /api/auth/me
// Returns the currently authenticated user from the Clerk session.
// ---------------------------------------------------------------------------
export async function GET(_req: NextRequest) {
  const user = await requireServerUser();
  return NextResponse.json(user);
}
