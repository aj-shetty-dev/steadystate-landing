import { z } from 'zod';

// Source: https://api.virtuagym.com (Pro API v0). REST + bearer token (api_key + login_token).
// Snake_case fields, page-based pagination with `page` query param.

export const virtuagymMemberStatusSchema = z.enum(['active', 'inactive', 'frozen', 'pending']);
export type VirtuagymMemberStatus = z.infer<typeof virtuagymMemberStatusSchema>;

export const virtuagymMemberSchema = z.object({
  user_id: z.number().int(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  email: z.string().nullable(),
  mobile: z.string().nullable(),
  member_since: z.string(), // ISO date
  status: virtuagymMemberStatusSchema,
  membership_end: z.string().nullable(),
  last_visit: z.string().nullable(),
});
export type VirtuagymMember = z.infer<typeof virtuagymMemberSchema>;

export const virtuagymMembersResponseSchema = z.object({
  result: z.array(virtuagymMemberSchema),
  next_page: z.number().int().nullable().optional(),
});
export type VirtuagymMembersResponse = z.infer<typeof virtuagymMembersResponseSchema>;

export const virtuagymVisitSchema = z.object({
  visit_id: z.number().int(),
  user_id: z.number().int(),
  timestamp: z.string(),
  source: z.enum(['app', 'access_gate', 'manual']).default('access_gate'),
});
export type VirtuagymVisit = z.infer<typeof virtuagymVisitSchema>;

export const virtuagymVisitsResponseSchema = z.object({
  result: z.array(virtuagymVisitSchema),
  next_page: z.number().int().nullable().optional(),
});
export type VirtuagymVisitsResponse = z.infer<typeof virtuagymVisitsResponseSchema>;

export const virtuagymCredentialsSchema = z.object({
  clubId: z.string(),
  apiKey: z.string(),
  loginToken: z.string(),
});
export type VirtuagymCredentials = z.infer<typeof virtuagymCredentialsSchema>;
