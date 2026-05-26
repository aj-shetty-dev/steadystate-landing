import { getAccessToken } from './session';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  revalidate?: number,
): Promise<T> {
  return apiFetchOnce<T>(path, init, revalidate, true);
}

function friendlyNetworkMessage(err: unknown): string {
  const msg = (err as { message?: string }).message ?? '';
  const lower = msg.toLowerCase();
  if (lower.includes('fetch failed') || lower.includes('failed to fetch')) {
    return 'Unable to connect to the server. Please try again.';
  }
  if (lower.includes('connect') && (lower.includes('refused') || lower.includes('econnrefused'))) {
    return 'The server is not running. Please try again shortly.';
  }
  if (lower.includes('timeout') || lower.includes('abort')) {
    return 'The request timed out. Please try again.';
  }
  return 'A network error occurred. Please check your connection and try again.';
}

async function apiFetchOnce<T>(
  path: string,
  init: RequestInit,
  revalidate: number | undefined,
  allowRetry: boolean,
): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const cacheInit: RequestInit & { next?: { revalidate: number } } =
    revalidate !== undefined ? { next: { revalidate } } : { cache: 'no-store' };

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1${path}`, {
      ...init,
      headers,
      ...cacheInit,
    });
  } catch (err) {
    throw new ApiError(0, friendlyNetworkMessage(err));
  }

  if (!res.ok) {
    const method = (init.method ?? 'GET').toUpperCase();
    if (allowRetry && res.status >= 500 && (method === 'GET' || method === 'HEAD')) {
      await new Promise((r) => setTimeout(r, 300));
      return apiFetchOnce<T>(path, init, revalidate, false);
    }
    let message = res.statusText;
    try {
      const body = (await res.json()) as { message?: string };
      message = body.message ?? message;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OverviewStats {
  members: { total: number; active: number };
  signals30d: { pending: number; nudged: number; dismissed: number; failed: number };
  messages30d: { total: number; sent: number; failed: number };
  leadsOpen: number;
  classesToday: number;
  revenueMtdAed: number;
}

export interface MemberRow {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  membershipStatus: string;
  provider: string;
  lastCheckinAt: string | null;
  joinedAt: string;
  activePlanNames: string[];
}

export interface MessageRow {
  id: string;
  to: string;
  body: string;
  status: string;
  templateName: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface SignalRow {
  id: string;
  detectedAt: string;
  daysSinceLastCheckin: number;
  status: string;
  nudgedAt: string | null;
  errorMessage: string | null;
  member: { id: string; fullName: string; phone: string | null };
}

export interface InvoiceRow {
  id: string;
  memberId: string;
  amountAed: number;
  vatAed: number;
  currency: string;
  dueDate: string;
  status: string;
  description: string | null;
  createdAt: string;
  member: { id: string; fullName: string; phone: string | null };
}

export interface ProductRow {
  id: string;
  sku: string;
  nameEn: string;
  nameAr: string | null;
  descriptionEn: string | null;
  descriptionAr: string | null;
  priceAed: number;
  vatRate: number;
  imageUrl: string | null;
  active: boolean;
  createdAt: string;
}

export interface OrderRow {
  id: string;
  memberId: string;
  status: string;
  subtotalAed: number;
  vatAed: number;
  totalAed: number;
  currency: string;
  createdAt: string;
  member: { id: string; fullName: string };
  lines: Array<{ id: string; productId: string; quantity: number; unitPriceAed: number; vatAed: number }>;
}

export interface DoorEventRow {
  id: string;
  source: string;
  direction: 'IN' | 'OUT';
  occurredAt: string;
  externalRef: string | null;
  member: { id: string; fullName: string } | null;
}

export interface DoorSignalRow {
  id: string;
  kind: string;
  detail: string | null;
  detectedAt: string;
  member: { id: string; fullName: string } | null;
}

export interface SubscriptionRow {
  id: string;
  plan: string;
  status: string;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  provider: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

export interface MembershipPlanRow {
  id: string;
  nameEn: string;
  nameAr: string | null;
  description: string | null;
  priceAed: number;
  vatRate: number;
  durationDays: number;
  includesClasses: boolean;
  maxFreezeDays: number;
  active: boolean;
  createdAt: string;
}

export interface MembershipRow {
  id: string;
  memberId: string;
  planId: string;
  status: string;
  startDate: string;
  endDate: string;
  frozenUntil: string | null;
  cancellationReason: string | null;
  createdAt: string;
  member: { id: string; fullName: string; phone: string | null };
  plan: { id: string; nameEn: string; durationDays: number; priceAed: number };
}

export interface UpcomingRenewalRow {
  id: string;
  memberId: string;
  planId: string;
  status: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  member: { id: string; fullName: string; phone: string | null };
  plan: { id: string; nameEn: string; priceAed: number; durationDays: number };
}

export interface ClassSessionRow {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  room: string | null;
  notes: string | null;
  capacityOverride: number | null;
  classType: { id: string; nameEn: string; nameAr: string | null; capacity: number; color: string };
  instructor: { id: string; fullName: string } | null;
  _count: { bookings: number };
}

export interface ClassTypeRow {
  id: string;
  nameEn: string;
  nameAr: string | null;
  description: string | null;
  durationMin: number;
  capacity: number;
  color: string;
  requiresEquipment: boolean;
  dropInPriceAed: number | null;
  active: boolean;
  createdAt: string;
}

export interface ClassRecurrenceRow {
  id: string;
  classTypeId: string;
  instructorId: string | null;
  daysOfWeek: number[];
  startTime: string;
  durationMin: number;
  room: string | null;
  validFrom: string;
  validUntil: string | null;
  active: boolean;
  createdAt: string;
  classType: { id: string; nameEn: string };
  instructor: { id: string; fullName: string } | null;
}

export interface ClassBookingRow {
  id: string;
  sessionId: string;
  memberId: string;
  status: string;
  bookedAt: string;
  checkedInAt: string | null;
  cancelledAt: string | null;
  position: number | null;
  member: { id: string; fullName: string; phone: string | null; membershipStatus: string };
  session?: {
    id: string;
    startsAt: string;
    endsAt: string;
    status: string;
    room: string | null;
    classType: { id: string; nameEn: string; color: string };
    instructor: { id: string; fullName: string } | null;
  };
}

export interface LeadRow {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  source: string;
  stage: string;
  notes: string | null;
  assignedToUserId: string | null;
  convertedMemberId: string | null;
  nextFollowUpAt: string | null;
  createdAt: string;
  updatedAt: string;
  activities?: LeadActivityRow[];
}

export interface LeadActivityRow {
  id: string;
  type: string;
  summary: string;
  createdByUserId: string | null;
  createdAt: string;
}

export interface SaleRow {
  id: string;
  type: string;
  memberId: string | null;
  staffId: string | null;
  subtotalAed: number;
  vatAed: number;
  totalAed: number;
  currency: string;
  paymentStatus: string;
  createdAt: string;
  lines: Array<{ id: string; kind: string; nameSnapshot: string; quantity: number; totalAed: number }>;
}

export interface StaffRow {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: string;
  active: boolean;
  hiredAt: string;
  hourlyRateAed: number | null;
  commissionPercent: number | null;
  color: string;
  userId: string | null;
  terminatedAt: string | null;
  pinHash: string | null;
}

export interface MemberDetail extends MemberRow {
  externalId: string;
  preferredLocale: string;
  medicalNotes: string | null;
  membershipExpiresAt: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  source: string;
}

export interface CheckinRow {
  id: string;
  memberId: string;
  source: string;
  checkedInAt: string;
  staffId: string | null;
  sessionId: string | null;
}

export interface RevenueReport {
  range: { from: string; to: string };
  sales: { count: number; subtotalAed: number; vatAed: number; totalAed: number };
  invoices: { count: number; totalAed: number };
  grandTotalAed: number;
}

export interface MemberGrowthReport {
  range: { from: string; to: string };
  newMembers: number;
  churnedMembers: number;
  netGrowth: number;
  currentActive: number;
}

export interface ClassUtilizationReport {
  range: { from: string; to: string };
  classes: Array<{
    classTypeId: string;
    nameEn: string;
    sessions: number;
    capacity: number;
    booked: number;
    checkedIn: number;
    fillRate: number;
    attendanceRate: number;
  }>;
}

export interface StaffCommissionReport {
  range: { from: string; to: string };
  staff: Array<{ id: string; name: string; role: string; salesCount: number; totalAed: number }>;
}
