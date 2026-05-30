import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Twilio helpers (matching apps/web/app/api/whatsapp/messages/send/route.ts)
// ---------------------------------------------------------------------------
const TWILIO_MODE = process.env.TWILIO_MODE ?? 'mock';

interface TwilioSendResult {
  messageId: string;
  status: string;
  to: string;
  sentAt: Date;
}

async function sendViaTwilio(to: string, body: string): Promise<TwilioSendResult> {
  if (TWILIO_MODE === 'mock') {
    console.log(`[MOCK] WhatsApp -> ${to} ${body.slice(0, 60)}...`);
    return {
      messageId: `mock_${randomUUID()}`,
      status: 'queued',
      to,
      sentAt: new Date(),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const twilio = require('twilio') as (sid: string, token: string) => {
    messages: {
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

  return {
    messageId: message.sid,
    status: 'queued',
    to,
    sentAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// POST /api/whatsapp/messages/[id]/resend
// Resend a failed WhatsApp message.
// Matching NestJS WhatsappMessagesController.resend
// ---------------------------------------------------------------------------
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;

  const msg = await prisma.whatsappMessage.findFirst({
    where: { id, tenantId: user.tenantId },
  });

  if (!msg) {
    return NextResponse.json({ message: 'Message not found' }, { status: 400 });
  }

  if (msg.status !== 'FAILED') {
    return NextResponse.json(
      { message: 'Only failed messages can be resent' },
      { status: 400 },
    );
  }

  try {
    const result = await sendViaTwilio(msg.to, msg.body);

    // Update original record
    await prisma.whatsappMessage.update({
      where: { id },
      data: {
        status: 'SENT' as any,
        providerMessageId: result.messageId,
        sentAt: result.sentAt,
        errorMessage: null,
      },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error(`WhatsApp resend failed: ${message}`);

    await prisma.whatsappMessage.update({
      where: { id },
      data: { status: 'FAILED' as any, errorMessage: message },
    });

    return NextResponse.json(
      { message: `WhatsApp resend failed: ${message}` },
      { status: 500 },
    );
  }
}
