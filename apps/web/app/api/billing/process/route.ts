import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { renderBillingReminder } from '@/lib/billing-utils';
import { sendWhatsapp } from '@/lib/whatsapp';

// ---------------------------------------------------------------------------
// POST /api/billing/process
// ---------------------------------------------------------------------------
// Process due retries: find PENDING payment attempts past their scheduledFor,
// send WhatsApp reminders in parallel, and update outcomes.
//
// Matches NestJS BillingService.processDueRetries but uses Promise.all()
// for WhatsApp sends instead of a sequential for loop.
export async function POST() {
  const user = await requireServerUser();
  const tenantId = user.tenantId;
  const now = new Date();

  const due = await prisma.paymentAttempt.findMany({
    where: {
      tenantId,
      outcome: 'PENDING',
      scheduledFor: { lte: now },
    },
    include: {
      invoice: {
        include: {
          member: {
            select: { id: true, fullName: true, phone: true, preferredLocale: true },
          },
        },
      },
    },
  });

  // Process each attempt: skip if no phone, otherwise send WhatsApp
  const results = await Promise.all(
    due.map(async (attempt) => {
      const phone = attempt.invoice.member.phone;
      if (!phone) {
        await prisma.paymentAttempt.update({
          where: { id: attempt.id },
          data: { outcome: 'SKIPPED', attemptedAt: now },
        });
        return { notified: false, failed: false, skipped: true };
      }

      const body = renderBillingReminder({
        firstName: attempt.invoice.member.fullName.split(' ')[0] ?? 'there',
        amountAed: (attempt.invoice.amountAed + attempt.invoice.vatAed) / 100,
        locale: attempt.invoice.member.preferredLocale ?? 'EN',
      });

      try {
        await sendWhatsapp(phone, body);
        // TODO: trigger real card retry via Stripe/Telr here
        await prisma.paymentAttempt.update({
          where: { id: attempt.id },
          data: { outcome: 'SKIPPED', attemptedAt: now },
        });
        return { notified: true, failed: false, skipped: false };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error';
        await prisma.paymentAttempt.update({
          where: { id: attempt.id },
          data: {
            outcome: 'FAILED',
            attemptedAt: now,
            providerResponse: { error: message },
          },
        });
        return { notified: false, failed: true, skipped: false };
      }
    }),
  );

  const notified = results.filter((r) => r.notified).length;
  const failed = results.filter((r) => r.failed).length;
  const skipped = results.filter((r) => r.skipped).length;

  return NextResponse.json({
    processed: due.length,
    notified,
    failed,
    skipped,
  });
}
