import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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

  const user = await currentUser();
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Unknown';
  const email = user?.emailAddresses[0]?.emailAddress ?? '';

  const upstream = await fetch(`${API_URL}/api/v1/auth/onboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clerkId: userId,
      tenantName: parsed.data.tenantName,
      fullName,
      email,
    }),
  });

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
  });
}
