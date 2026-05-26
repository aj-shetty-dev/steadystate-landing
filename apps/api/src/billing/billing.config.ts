import { z } from 'zod';

const schema = z.object({
  BILLING_DEFAULT_WINDOW_START: z.coerce.number().int().min(1).max(28).default(25),
  BILLING_DEFAULT_WINDOW_END: z.coerce.number().int().min(1).max(28).default(28),
  BILLING_DEFAULT_TIMEZONE: z.string().default('Asia/Dubai'),
  BILLING_JITTER_MINUTES: z.coerce.number().int().min(0).max(720).default(120),
  BILLING_CRON: z.string().default('0 6 * * *'),
});

export type BillingConfig = z.infer<typeof schema>;

export function loadBillingConfig(source: NodeJS.ProcessEnv = process.env): BillingConfig {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid billing config: ${parsed.error.message}`);
  }
  if (parsed.data.BILLING_DEFAULT_WINDOW_END < parsed.data.BILLING_DEFAULT_WINDOW_START) {
    throw new Error('BILLING_DEFAULT_WINDOW_END must be >= BILLING_DEFAULT_WINDOW_START');
  }
  return parsed.data;
}
