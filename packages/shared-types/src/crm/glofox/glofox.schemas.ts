import { z } from 'zod';

// Source: https://developer.glofox.com (v2 partner API).
// Glofox API uses snake_case fields. Pagination is cursor-based via `next_cursor`.

export const glofoxMembershipStatusSchema = z.enum([
  'active',
  'paused',
  'cancelled',
  'expired',
  'pending',
]);
export type GlofoxMembershipStatus = z.infer<typeof glofoxMembershipStatusSchema>;

export const glofoxMemberSchema = z.object({
  id: z.string(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  joined_at: z.string(),
  membership_status: glofoxMembershipStatusSchema,
  membership_expires_at: z.string().nullable(),
  last_check_in_at: z.string().nullable(),
});
export type GlofoxMember = z.infer<typeof glofoxMemberSchema>;

export const glofoxMembersResponseSchema = z.object({
  data: z.array(glofoxMemberSchema),
  next_cursor: z.string().nullable().optional(),
});
export type GlofoxMembersResponse = z.infer<typeof glofoxMembersResponseSchema>;

export const glofoxCheckinSchema = z.object({
  id: z.string(),
  member_id: z.string(),
  occurred_at: z.string(),
  source: z.enum(['app', 'kiosk', 'access_control', 'manual']),
});
export type GlofoxCheckin = z.infer<typeof glofoxCheckinSchema>;

export const glofoxCheckinsResponseSchema = z.object({
  data: z.array(glofoxCheckinSchema),
  next_cursor: z.string().nullable().optional(),
});
export type GlofoxCheckinsResponse = z.infer<typeof glofoxCheckinsResponseSchema>;

export const glofoxCredentialsSchema = z.object({
  branchId: z.string(),
  apiKey: z.string(),
});
export type GlofoxCredentials = z.infer<typeof glofoxCredentialsSchema>;
