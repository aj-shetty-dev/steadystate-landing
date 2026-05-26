import { NextResponse } from 'next/server';

/** Deprecated: sign-up is now handled by Clerk. */
export function POST() {
  return NextResponse.json(
    { message: 'Sign-up is handled by Clerk. Please use /sign-up.' },
    { status: 410 },
  );
}
