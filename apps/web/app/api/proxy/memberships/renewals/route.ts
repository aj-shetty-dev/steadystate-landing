import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '../../../../../lib/session';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function GET(req: NextRequest) {
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ message: 'Unauthenticated' }, { status: 401 });

  const qs = req.nextUrl.searchParams.toString();
  const res = await fetch(`${API_URL}/api/v1/memberships/renewals${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
  });
}
