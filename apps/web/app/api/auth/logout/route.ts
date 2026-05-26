import { NextResponse } from 'next/server';

/** Logout is handled client-side by Clerk's useClerk().signOut(). */
export function POST() {
  return NextResponse.json({ ok: true });
}
