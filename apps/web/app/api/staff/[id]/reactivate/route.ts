import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';

// ---------------------------------------------------------------------------
// POST /api/staff/[id]/reactivate
// Reactivate a terminated staff member.
// Matching NestJS StaffController.reactivate → StaffService.reactivate
// ---------------------------------------------------------------------------
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;

  const existing = await prisma.staff.findFirst({
    where: { id, tenantId: user.tenantId },
  });

  if (!existing) {
    return NextResponse.json({ message: 'Staff not found' }, { status: 404 });
  }

  const staff = await prisma.staff.update({
    where: { id },
    data: { active: true, terminatedAt: null },
  });

  return NextResponse.json(staff);
}
