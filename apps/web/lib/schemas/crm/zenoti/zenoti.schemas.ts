import { z } from 'zod';

// Source: https://docs.zenoti.com (Public API v1).
// Zenoti uses snake_case, nested personal_info, and page_info-based pagination.

export const zenotiGuestSchema = z.object({
  id: z.string(),
  code: z.string().nullable().optional(),
  personal_info: z.object({
    first_name: z.string().nullable(),
    last_name: z.string().nullable(),
    email: z.string().nullable(),
    mobile_phone: z
      .object({
        country_code: z.number().nullable().optional(),
        number: z.string().nullable(),
      })
      .nullable(),
    date_of_birth: z.string().nullable().optional(),
  }),
  created_date: z.string(),
  membership: z
    .object({
      name: z.string().nullable(),
      status: z.enum(['Active', 'Expired', 'Suspended', 'Cancelled', 'Pending']).nullable(),
      expiry_date: z.string().nullable(),
    })
    .nullable()
    .optional(),
  last_visit_date: z.string().nullable().optional(),
});
export type ZenotiGuest = z.infer<typeof zenotiGuestSchema>;

export const zenotiGuestsResponseSchema = z.object({
  guests: z.array(zenotiGuestSchema),
  page_info: z.object({
    total: z.number(),
    page: z.number(),
    size: z.number(),
  }),
});
export type ZenotiGuestsResponse = z.infer<typeof zenotiGuestsResponseSchema>;

export const zenotiAppointmentSchema = z.object({
  id: z.string(),
  guest_id: z.string(),
  start_time: z.string(),
  end_time: z.string().nullable().optional(),
  status: z.string(),
});
export type ZenotiAppointment = z.infer<typeof zenotiAppointmentSchema>;

export const zenotiAppointmentsResponseSchema = z.object({
  appointments: z.array(zenotiAppointmentSchema),
  page_info: z.object({
    total: z.number(),
    page: z.number(),
    size: z.number(),
  }),
});
export type ZenotiAppointmentsResponse = z.infer<typeof zenotiAppointmentsResponseSchema>;

export const zenotiCredentialsSchema = z.object({
  apiKey: z.string(),
  centerId: z.string(),
});
export type ZenotiCredentials = z.infer<typeof zenotiCredentialsSchema>;
