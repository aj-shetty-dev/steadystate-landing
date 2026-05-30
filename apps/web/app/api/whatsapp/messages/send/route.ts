import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Twilio helpers
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

  return {
    messageId: message.sid,
    status: 'queued',
    to,
    sentAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// POST /api/whatsapp/messages/send
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const user = await requireServerUser();

  const body = await req.json();
  const { to, body: messageBody, templateName } = body as {
    to?: string;
    body?: string;
    templateName?: string;
  };

  if (!to || !messageBody) {
    return NextResponse.json(
      { message: 'to and body are required' },
      { status: 400 },
    );
  }

  // Validate E.164 phone format
  if (!/^\+[1-9]\d{6,14}$/.test(to)) {
    return NextResponse.json(
      { message: 'to must be a valid E.164 phone number' },
      { status: 400 },
    );
  }

  if (messageBody.length < 1 || messageBody.length > 4096) {
    return NextResponse.json(
      { message: 'body must be between 1 and 4096 characters' },
      { status: 400 },
    );
  }

  // Create message record
  const record = await prisma.whatsappMessage.create({
    data: {
      tenantId: user.tenantId,
      to,
      body: messageBody,
      templateName: templateName ?? null,
      status: 'QUEUED',
    },
  });

  // Send via provider
  try {
    const result = await sendViaTwilio(to, messageBody);

    await prisma.whatsappMessage.update({
      where: { id: record.id },
      data: {
        status: 'SENT',
        providerMessageId: result.messageId,
        sentAt: result.sentAt,
      },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error(`WhatsApp send failed: ${message}`);

    await prisma.whatsappMessage.update({
      where: { id: record.id },
      data: { status: 'FAILED', errorMessage: message },
    });

    return NextResponse.json(
      { message: `WhatsApp send failed: ${message}` },
      { status: 500 },
    );
  }
}
