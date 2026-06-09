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

// Accepts both ISO 8601 datetime strings AND date-only YYYY-MM-DD strings
// (CalendarPopover sends dates as "2025-06-09", not full ISO datetimes).
// Ensures the value is a real calendar date.
const dateField = z.string().refine(
  (val) => {
    // Must start with YYYY-MM-DD pattern, optionally followed by time portion
    if (!/^\d{4}-\d{2}-\d{2}/.test(val)) return false;
    const d = new Date(val);
    return !isNaN(d.getTime());
  },
  { message: 'Invalid date. Use YYYY-MM-DD format (e.g. 2025-06-09).' },
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

// Aligned with Prisma Gender enum: MALE | FEMALE | OTHER | UNSPECIFIED
const GENDERS = ['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED'] as const;

export const createMemberSchema = z.object({
  fullName: z.string().trim().min(1, 'Full name is required.').max(200, 'Full name must be 200 characters or fewer.'),
  phone: phoneSchema,
  email: z.string().email('Please enter a valid email.').optional().nullable(),
  membershipStatus: z.enum(MEMBERSHIP_STATUSES).default('ACTIVE'),
  joinedAt: dateField.optional(),
  preferredLocale: z.enum(['EN', 'AR']).default('EN'),
  gender: z.enum(GENDERS).optional().nullable(),
  dateOfBirth: dateField.optional().nullable(),
  medicalNotes: z.string().max(1000, 'Medical notes must be 1000 characters or fewer.').optional().nullable(),
  emergencyContact: z.any().optional().nullable(),
  assignedTrainerId: z.string().optional().nullable(),
});

export const updateMemberSchema = createMemberSchema.partial().extend({
  membershipExpiresAt: dateField.optional().nullable(),
});
