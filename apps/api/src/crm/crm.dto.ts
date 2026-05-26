import { z } from 'zod';
import { crmProviderSchema } from '@steady-state/shared-types';

export const createCrmConnectionSchema = z.object({
  provider: crmProviderSchema,
  credentials: z.record(z.unknown()).default({}),
});
export type CreateCrmConnectionDto = z.infer<typeof createCrmConnectionSchema>;
