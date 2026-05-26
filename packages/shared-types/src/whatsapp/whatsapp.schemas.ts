import { z } from 'zod';

export const e164PhoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, 'Must be a valid E.164 phone number');
export type E164Phone = z.infer<typeof e164PhoneSchema>;

export const whatsappSendRequestSchema = z.object({
  to: e164PhoneSchema,
  body: z.string().min(1).max(4096),
  templateName: z.string().optional(),
  templateVariables: z.record(z.string()).optional(),
  locale: z.enum(['en', 'ar']).default('en'),
});
export type WhatsappSendRequest = z.infer<typeof whatsappSendRequestSchema>;

export const whatsappMessageStatusSchema = z.enum([
  'queued',
  'sent',
  'delivered',
  'read',
  'failed',
  'undelivered',
]);
export type WhatsappMessageStatus = z.infer<typeof whatsappMessageStatusSchema>;

export const whatsappSendResultSchema = z.object({
  messageId: z.string(),
  status: whatsappMessageStatusSchema,
  to: e164PhoneSchema,
  sentAt: z.date(),
});
export type WhatsappSendResult = z.infer<typeof whatsappSendResultSchema>;
