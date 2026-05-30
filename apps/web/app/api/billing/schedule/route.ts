import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import {
  nextSalaryWindow,
  scheduledInstantFor,
  type SalaryWindowConfig,
} from '@/lib/billing-utils';

// Default billing config (matches apps/api/src/billing/billing.config.ts)
const DEFAULT_WINDOW_START = 25;
const DEFAULT_WINDOW_END = 28;
const DEFAULT_TIMEZONE = 'Asia/Dubai';
const DEFAULT_JITTER_MINUTES = 120;

// ---------------------------------------------------------------------------
// GET /api/billing/schedule
// ---------------------------------------------------------------------------
// Returns the effective salary window config for this tenant
// (row from DB or defaults).
export async function GET() {
  const user = await requireServerUser();
  const tenantId = user.tenantId;

  const row = await prisma.salaryWindow.findUnique({ where: { tenantId } });
  const window: SalaryWindowConfig = {
    startDay: row?.startDay ?? DEFAULT_WINDOW_START,
    endDay: row?.endDay ?? DEFAULT_WINDOW_END,
    timezone: row?.timezone ?? DEFAULT_TIMEZONE,
    jitterMinutes: row?.jitterMinutes ?? DEFAULT_JITTER_MINUTES,
  };
  const span = nextSalaryWindow(new Date(), window);

  return NextResponse.json({ window, span });
}

// ---------------------------------------------------------------------------
// POST /api/billing/schedule
// ---------------------------------------------------------------------------
// Schedule retries for FAILED invoices.
// Matches NestJS BillingService.scheduleRetries exactly.
export async function POST() {
  const user = await requireServerUser();
  const tenantId = user.tenantId;

  // Load the salary window config
  const row = await prisma.salaryWindow.findUnique({ where: { tenantId } });
  const window: SalaryWindowConfig = {
    startDay: row?.startDay ?? DEFAULT_WINDOW_START,
    endDay: row?.endDay ?? DEFAULT_WINDOW_END,
    timezone: row?.timezone ?? DEFAULT_TIMEZONE,
    jitterMinutes: row?.jitterMinutes ?? DEFAULT_JITTER_MINUTES,
  };
  const span = nextSalaryWindow(new Date(), window);

  // Find FAILED invoices that might need retry scheduling
  const invoices = await prisma.invoice.findMany({
    where: { tenantId, status: 'FAILED' },
    include: { attempts: { where: { outcome: 'PENDING' } } },
  });

  let scheduled = 0;
  let alreadyScheduled = 0;

  for (const invoice of invoices) {
    if (invoice.attempts.length > 0) {
      alreadyScheduled++;
      continue;
    }
    const at = scheduledInstantFor(invoice.id, span, window);
    await prisma.$transaction([
      prisma.paymentAttempt.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          scheduledFor: at,
          outcome: 'PENDING',
        },
      }),
      prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: 'RETRY_SCHEDULED' },
      }),
    ]);
    scheduled++;
  }

  return NextResponse.json({
    eligible: invoices.length,
    scheduled,
    alreadyScheduled,
  });
}
