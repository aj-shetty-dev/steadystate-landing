import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '../../../../../../lib/session';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function POST(req: NextRequest) {
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const res = await fetch(`${API_URL}/api/v1/importer/members/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const ct = res.headers.get('content-type') ?? 'application/json';
  return new NextResponse(text, { status: res.status, headers: { 'content-type': ct } });
}
