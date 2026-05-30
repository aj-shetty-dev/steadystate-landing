import { z } from 'zod';

export const tenantSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  country: z.string().default('AE'),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Tenant = z.infer<typeof tenantSchema>;
