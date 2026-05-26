import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),
  REDIS_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  TWILIO_MODE: z.enum(['live', 'mock']).default('mock'),
  TWILIO_ACCOUNT_SID: z.string().default(''),
  TWILIO_AUTH_TOKEN: z.string().default(''),
  TWILIO_WHATSAPP_FROM: z.string().default('whatsapp:+14155238886'),

  CRM_MODE: z.enum(['live', 'fake']).default('fake'),

  CLERK_SECRET_KEY: z.string().default(''),

  DOOR_WEBHOOK_SECRET: z.string().default('change-me-door-secret-dev-only'),
  DATA_REGION: z.string().default('me-south-1'),

  BILLING_PROVIDER_MODE: z.enum(['mock', 'stripe', 'telr']).default('mock'),

  STRIPE_MODE: z.enum(['live', 'mock']).default('mock'),
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  STRIPE_DEFAULT_CURRENCY: z.string().default('aed'),
  STRIPE_PRICE_STARTER: z.string().default('price_mock_starter'),
  STRIPE_PRICE_GROWTH: z.string().default('price_mock_growth'),
  STRIPE_PRICE_SCALE: z.string().default('price_mock_scale'),

  KIOSK_STAFF_PIN_LENGTH: z.coerce.number().int().min(4).max(10).default(4),

  CORS_ORIGIN: z.string().default('http://localhost:3000'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  if (parsed.data.TWILIO_MODE === 'live') {
    if (!parsed.data.TWILIO_ACCOUNT_SID || !parsed.data.TWILIO_AUTH_TOKEN) {
      throw new Error(
        'TWILIO_MODE=live requires TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to be set',
      );
    }
  }
  if (parsed.data.STRIPE_MODE === 'live') {
    if (!parsed.data.STRIPE_SECRET_KEY || !parsed.data.STRIPE_WEBHOOK_SECRET) {
      throw new Error(
        'STRIPE_MODE=live requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to be set',
      );
    }
  }
  return parsed.data;
}
