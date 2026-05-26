import { z } from 'zod';

export const automationConfigSchema = z.object({
  CHURN_THRESHOLD_DAYS: z.coerce.number().int().positive().default(5),
  CHURN_NUDGE_COOLDOWN_DAYS: z.coerce.number().int().positive().default(14),
  // BullMQ repeatable cron — runs detection daily. Default 8am UTC = 12pm GST.
  CHURN_DETECTION_CRON: z.string().default('0 8 * * *'),
});
export type AutomationConfig = z.infer<typeof automationConfigSchema>;

export function loadAutomationConfig(source: NodeJS.ProcessEnv = process.env): AutomationConfig {
  const parsed = automationConfigSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid automation config: ${parsed.error.message}`);
  }
  return parsed.data;
}
