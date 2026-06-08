import { z } from 'zod';

export const phoneSchema = z.preprocess(
  (val) => {
    if (typeof val === 'string') return val.replace(/[\s\-\(\)\.]/g, '');
    return val; // pass null / undefined through
  },
  z
    .string()
    .regex(
      /^\+[1-9]\d{6,14}$/,
      'Phone must be E.164 format (e.g. +971501234567). Remove spaces or dashes.',
    )
    .nullable()
    .optional(),
);

// Aligned with Prisma MembershipStatus enum
const MEMBERSHIP_STATUSES = [
  'ACTIVE',
  'EXPIRED',
  'PAUSED',
  'FROZEN',
  'CANCELLED',
  'PENDING',
  'PENDING_PAYMENT',
] as const;

export const createMemberSchema = z.object({
  fullName: z.string().min(1).max(200).trim(),
  phone: phoneSchema,
  email: z.string().email().optional().nullable(),
  membershipStatus: z.enum(MEMBERSHIP_STATUSES).default('ACTIVE'),
  joinedAt: z.string().datetime().optional(),
  preferredLocale: z.enum(['EN', 'AR']).default('EN'),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional().nullable(),
  dateOfBirth: z.string().datetime().optional().nullable(),
  medicalNotes: z.string().max(1000).optional().nullable(),
  emergencyContact: z.any().optional().nullable(),
  assignedTrainerId: z.string().optional().nullable(),
});

export const updateMemberSchema = createMemberSchema.partial().extend({
  membershipExpiresAt: z.string().datetime().optional().nullable(),
});
