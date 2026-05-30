/**
 * WhatsApp helper for Next.js server-side usage.
 * Uses the Twilio REST API directly via fetch (no SDK dependency).
 *
 * To enable live sending, set these env vars:
 *   TWILIO_ACCOUNT_SID=your_account_sid
 *   TWILIO_AUTH_TOKEN=your_auth_token
 *   TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
 *
 * In development, when env vars are not set, the helper logs the message
 * instead of sending (mock mode).
 */

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID ?? '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN ?? '';
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886';
const TWILIO_MODE = process.env.TWILIO_MODE ?? 'mock';

export interface SendWhatsappResult {
  messageId: string;
  status: string;
  to: string;
  sentAt: Date;
}

/**
 * Send a WhatsApp message via Twilio.
 * In mock mode (no credentials), logs the message and returns a fake result.
 */
export async function sendWhatsapp(
  to: string,
  body: string,
): Promise<SendWhatsappResult> {
  if (TWILIO_MODE === 'mock' || !TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.log(`[WhatsApp Mock] To: ${to}, Body: ${body}`);
    return {
      messageId: `mock_${Date.now()}`,
      status: 'queued',
      to,
      sentAt: new Date(),
    };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(TWILIO_ACCOUNT_SID)}/Messages.json`;
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

  const params = new URLSearchParams({
    From: TWILIO_WHATSAPP_FROM,
    To: `whatsapp:${to}`,
    Body: body,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Twilio API error ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as { sid: string; status: string; to: string };
  return {
    messageId: data.sid,
    status: data.status,
    to: data.to.replace('whatsapp:', ''),
    sentAt: new Date(),
  };
}
