import { NextResponse } from 'next/server';

/** Deprecated: authentication is now handled by Clerk. */
export function POST() {
  return NextResponse.json(
    { message: 'Login is handled by Clerk. Please use /sign-in.' },
    { status: 410 },
  );
}
