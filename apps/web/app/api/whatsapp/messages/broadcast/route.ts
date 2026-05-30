import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { randomUUID } from 'node:crypto';
import { MembershipStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Twilio helpers
// ---------------------------------------------------------------------------
const TWILIO_MODE = process.env.TWILIO_MODE ?? 'mock';

async function sendViaTwilio(to: string, body: string): Promise<string> {
  if (TWILIO_MODE === 'mock') {
    console.log(`[MOCK] WhatsApp -> ${to} ${body.slice(0, 60)}...`);
    return `mock_${randomUUID()}`;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const twilio = require('twilio') as (sid: string, token: string) => {
    messages: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create(opts: { from: string; to: string; body: string }): Promise<{ sid: string }>;
    };
  };
  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!,
  );
  const message = await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM!,
    to: `whatsapp:${to}`,
    body,
  });

  return message.sid;
}

// ---------------------------------------------------------------------------
// POST /api/whatsapp/messages/broadcast
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const user = await requireServerUser();

  const body = await req.json();
  const { body: messageBody, segment } = body as {
    body?: string;
    segment?: {
      membershipStatus?: string;
      planId?: string;
      lastCheckinFrom?: string;
      lastCheckinTo?: string;
    };
  };

  if (!messageBody) {
    return NextResponse.json(
      { message: 'body is required' },
      { status: 400 },
    );
  }

  // Build member query
  const where: Record<string, unknown> = { tenantId: user.tenantId, phone: { not: null } };

  if (segment) {
    if (segment.membershipStatus) {
      where.membershipStatus = segment.membershipStatus;
    } else {
      where.membershipStatus = {
        in: [MembershipStatus.ACTIVE, MembershipStatus.FROZEN],
      };
    }
    if (segment.planId) {
      where.memberships = {
        some: { planId: segment.planId, status: MembershipStatus.ACTIVE },
      };
    }
    if (segment.lastCheckinFrom || segment.lastCheckinTo) {
      where.lastCheckinAt = {};
      if (segment.lastCheckinFrom) {
        (where.lastCheckinAt as Record<string, unknown>).gte = new Date(segment.lastCheckinFrom);
      }
      if (segment.lastCheckinTo) {
        (where.lastCheckinAt as Record<string, unknown>).lte = new Date(
          segment.lastCheckinTo + 'T23:59:59.999Z',
        );
      }
    }
  } else {
    where.membershipStatus = {
      in: [MembershipStatus.ACTIVE, MembershipStatus.FROZEN],
    };
  }

  const members = await prisma.member.findMany({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    where: where as any,
    select: { id: true, phone: true, fullName: true },
    take: 500,
  });

  // Send messages in PARALLEL using Promise.all
  const results = await Promise.all(
    members.map(async (m) => {
      if (!m.phone) return { sent: false, skipped: true, memberId: m.id };

      try {
        // Create message record
        const record = await prisma.whatsappMessage.create({
          data: {
            tenantId: user.tenantId,
            to: m.phone,
            body: messageBody,
            status: 'QUEUED',
          },
        });

        const providerMessageId = await sendViaTwilio(m.phone, messageBody);

        await prisma.whatsappMessage.update({
          where: { id: record.id },
          data: {
            status: 'SENT',
            providerMessageId,
            sentAt: new Date(),
          },
        });

        return { sent: true, skipped: false, memberId: m.id };
      } catch {
        // Mark as failed but don't throw — continue sending to other members
        return { sent: false, skipped: true, memberId: m.id };
      }
    }),
  );

  const sent = results.filter((r) => r.sent).length;
  const skipped = results.filter((r) => r.skipped).length;

  return NextResponse.json({ sent, skipped, total: members.length });
}
