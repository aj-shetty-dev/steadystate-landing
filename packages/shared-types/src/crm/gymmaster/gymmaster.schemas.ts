import { z } from 'zod';

// Source: https://www.gymmaster.com/api/v1 — JSON over HTTPS, session token auth.
// camelCase fields. Pagination via offset/limit.

export const gymmasterMemberStatusSchema = z.enum(['Active', 'Suspended', 'Cancelled', 'Expired', 'Pending']);
export type GymmasterMemberStatus = z.infer<typeof gymmasterMemberStatusSchema>;

export const gymmasterMemberSchema = z.object({
  id: z.string(),
  firstname: z.string().nullable(),
  surname: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  joinDate: z.string(),
  status: gymmasterMemberStatusSchema,
  membershipExpiry: z.string().nullable(),
  lastVisit: z.string().nullable(),
});
export type GymmasterMember = z.infer<typeof gymmasterMemberSchema>;

export const gymmasterMembersResponseSchema = z.object({
  members: z.array(gymmasterMemberSchema),
  total: z.number().int(),
  offset: z.number().int(),
  limit: z.number().int(),
});
export type GymmasterMembersResponse = z.infer<typeof gymmasterMembersResponseSchema>;

export const gymmasterVisitSchema = z.object({
  visitId: z.string(),
  memberId: z.string(),
  visitDate: z.string(),
  channel: z.enum(['door', 'app', 'reception']).default('door'),
});
export type GymmasterVisit = z.infer<typeof gymmasterVisitSchema>;

export const gymmasterVisitsResponseSchema = z.object({
  visits: z.array(gymmasterVisitSchema),
  total: z.number().int(),
  offset: z.number().int(),
  limit: z.number().int(),
});
export type GymmasterVisitsResponse = z.infer<typeof gymmasterVisitsResponseSchema>;

export const gymmasterCredentialsSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string(),
});
export type GymmasterCredentials = z.infer<typeof gymmasterCredentialsSchema>;
