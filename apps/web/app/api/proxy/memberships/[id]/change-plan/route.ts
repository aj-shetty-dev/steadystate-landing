import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '../../../../../../lib/session';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ message: 'Unauthenticated' }, { status: 401 });

  const { id } = await params;
  const res = await fetch(`${API_URL}/api/v1/memberships/${id}/change-plan`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: await req.text(),
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
  });
}
