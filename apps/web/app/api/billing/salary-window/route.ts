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
  const parsed = salaryWindowSchema.parse(body);

  if (parsed.startDay !== undefined && parsed.endDay !== undefined && parsed.startDay > parsed.endDay) {
    return NextResponse.json(
      { error: 'startDay cannot be after endDay' },
      { status: 400 },
    );
  }

  const updated = await prisma.salaryWindow.upsert({
    where: { tenantId: user.tenantId },
    create: { tenantId: user.tenantId, ...parsed },
    update: parsed,
  });

  return NextResponse.json(updated);
}
