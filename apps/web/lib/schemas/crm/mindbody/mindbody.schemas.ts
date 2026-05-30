import { z } from 'zod';

// Source: https://developers.mindbodyonline.com/PublicDocumentation/V6
// Endpoints used:
//   GET /public/v6/client/clients
//   GET /public/v6/client/clientvisits
// Mindbody returns PascalCase fields, ISO datetimes, and pagination metadata.

export const mindbodyPaginationSchema = z.object({
  RequestedLimit: z.number(),
  RequestedOffset: z.number(),
  PageSize: z.number(),
  TotalResults: z.number(),
});
export type MindbodyPagination = z.infer<typeof mindbodyPaginationSchema>;

export const mindbodyClientSchema = z.object({
  Id: z.string(),
  UniqueId: z.number().optional(),
  FirstName: z.string().nullable(),
  LastName: z.string().nullable(),
  Email: z.string().nullable(),
  MobilePhone: z.string().nullable(),
  HomePhone: z.string().nullable().optional(),
  Status: z.enum(['Active', 'Inactive', 'Declined', 'Non-Member']).nullable(),
  CreationDate: z.string(),
  MembershipIcon: z.number().nullable().optional(),
  LastFormulaNotes: z.string().nullable().optional(),
  ActiveContracts: z
    .array(
      z.object({
        Id: z.number(),
        ContractName: z.string(),
        EndDate: z.string().nullable(),
      }),
    )
    .optional(),
});
export type MindbodyClient = z.infer<typeof mindbodyClientSchema>;

export const mindbodyClientsResponseSchema = z.object({
  PaginationResponse: mindbodyPaginationSchema,
  Clients: z.array(mindbodyClientSchema),
});
export type MindbodyClientsResponse = z.infer<typeof mindbodyClientsResponseSchema>;

export const mindbodyVisitSchema = z.object({
  Id: z.number(),
  ClientId: z.string(),
  StartDateTime: z.string(),
  EndDateTime: z.string().nullable().optional(),
  SignedIn: z.boolean(),
  Name: z.string().nullable().optional(),
});
export type MindbodyVisit = z.infer<typeof mindbodyVisitSchema>;

export const mindbodyVisitsResponseSchema = z.object({
  PaginationResponse: mindbodyPaginationSchema,
  Visits: z.array(mindbodyVisitSchema),
});
export type MindbodyVisitsResponse = z.infer<typeof mindbodyVisitsResponseSchema>;

export const mindbodyCredentialsSchema = z.object({
  siteId: z.string(),
  apiKey: z.string(),
  staffUsername: z.string(),
  staffPassword: z.string(),
});
export type MindbodyCredentials = z.infer<typeof mindbodyCredentialsSchema>;
