import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { z } from 'zod';

const salaryWindowSchema = z.object({
  startDay: z.number().int().min(1).max(28).optional(),
  endDay: z.number().int().min(1).max(31).optional(),
  timezone: z.string().optional(),
  jitterMinutes: z.number().int().min(0).max(1440).optional(),
});

// ---------------------------------------------------------------------------
// GET /api/billing/salary-window
// ---------------------------------------------------------------------------
// Returns the current salary window config for the tenant.
// Matches NestJS BillingController.getSalaryWindow.
export async function GET() {
  const user = await requireServerUser();

  const window = await prisma.salaryWindow.findUnique({
    where: { tenantId: user.tenantId },
  });

  return NextResponse.json(window);
}

// ---------------------------------------------------------------------------
// POST /api/billing/salary-window
// ---------------------------------------------------------------------------
// Create or update the salary window config for the tenant.
// Matches NestJS BillingController.updateSalaryWindow (PUT).
export async function POST(req: NextRequest) {
  const user = await requireServerUser();

  const body = (await req.json()) as Record<string, unknown>;
  const parsed = salaryWindowSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.errors) {
      const field = issue.path.join('.') || 'form';
      if (!fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return NextResponse.json(
      { message: Object.values(fieldErrors).join('; '), fieldErrors },
      { status: 400 },
    );
  }

  if (parsed.data.startDay !== undefined && parsed.data.endDay !== undefined && parsed.data.startDay > parsed.data.endDay) {
    return NextResponse.json(
      { message: 'startDay cannot be after endDay' },
      { status: 400 },
    );
  }

  const updated = await prisma.salaryWindow.upsert({
    where: { tenantId: user.tenantId },
    create: { tenantId: user.tenantId, ...parsed.data },
    update: parsed.data,
  });

  return NextResponse.json(updated);
}
