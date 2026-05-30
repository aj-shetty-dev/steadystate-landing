import { z } from 'zod';

export const crmProviderSchema = z.enum([
  'mindbody',
  'glofox',
  'zenoti',
  'virtuagym',
  'gymmaster',
  'simple_logic',
  'elewix',
]);
export type CrmProvider = z.infer<typeof crmProviderSchema>;

export const crmConnectionStatusSchema = z.enum([
  'pending',
  'connected',
  'syncing',
  'error',
  'disconnected',
]);
export type CrmConnectionStatus = z.infer<typeof crmConnectionStatusSchema>;

export const crmMembershipStatusSchema = z.enum([
  'active',
  'expired',
  'paused',
  'cancelled',
  'pending',
]);
export type CrmMembershipStatus = z.infer<typeof crmMembershipStatusSchema>;

export const crmMemberSchema = z.object({
  externalId: z.string(),
  provider: crmProviderSchema,
  fullName: z.string(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  membershipStatus: crmMembershipStatusSchema,
  membershipExpiresAt: z.date().nullable(),
  lastCheckinAt: z.date().nullable(),
  joinedAt: z.date(),
  raw: z.unknown(),
});
export type CrmMember = z.infer<typeof crmMemberSchema>;

export const crmVisitSchema = z.object({
  externalId: z.string(),
  provider: crmProviderSchema,
  memberExternalId: z.string(),
  occurredAt: z.date(),
  source: z.enum(['checkin', 'class', 'access', 'unknown']),
  raw: z.unknown(),
});
export type CrmVisit = z.infer<typeof crmVisitSchema>;

export const crmPageRequestSchema = z.object({
  cursor: z.string().optional(),
  since: z.date().optional(),
  limit: z.number().int().positive().max(500).default(100),
});
export type CrmPageRequest = z.infer<typeof crmPageRequestSchema>;

export interface CrmPageResult<T> {
  items: T[];
  nextCursor?: string;
}
