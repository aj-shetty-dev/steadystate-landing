const API_URL = '';

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
  return apiFetchOnce<T>(path, init, revalidate, true, 1);
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

/**
 * Forward browser cookies from the incoming request to the server-side fetch.
 * This is needed because Server Components make server-to-server HTTP calls
 * to API routes, but those internal calls don't automatically carry cookies.
 */
async function getServerCookies(): Promise<string | null> {
  try {
    const { cookies } = await import('next/headers');
    const store = await cookies();
    const all = store.getAll();
    if (all.length === 0) return null;
    return all.map((c) => `${c.name}=${c.value}`).join('; ');
  } catch {
    return null; // Not in a request context (e.g. build time)
  }
}

/**
 * Returns the base URL to use for server-side API calls.
 * Uses VERCEL_URL in production; reads the host header from the
 * incoming request in dev so the port always matches.
 */
async function getServerBaseUrl(): Promise<string> {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  try {
    const { headers } = await import('next/headers');
    const h = await headers();
    const host = h.get('host') || h.get('x-forwarded-host');
    if (host) {
      const protocol = h.get('x-forwarded-proto') || 'http';
      return `${protocol}://${host}`;
    }
  } catch {
    // Not in a request context
  }
  return 'http://localhost:3000';
}

async function apiFetchOnce<T>(
  path: string,
  init: RequestInit,
  revalidate: number | undefined,
  allowRetry: boolean,
  attempt: number,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');

  const cacheInit: RequestInit & { next?: { revalidate: number } } =
    revalidate !== undefined ? { next: { revalidate } } : { cache: 'no-store' };

  const url = `${API_URL}/api${path}`;
  const isServer = typeof window === 'undefined';

  let res: Response;
  try {
    let fetchUrl = url;
    if (isServer) {
      const base = await getServerBaseUrl();
      fetchUrl = `${base}${url}`;
    }
    const fetchInit: RequestInit = {
      ...init,
      headers,
      ...cacheInit,
    };
    if (isServer) {
      // Forward browser cookies to the internal API call so Clerk auth works
      const cookieHeader = await getServerCookies();
      if (cookieHeader) {
        fetchInit.headers = { ...fetchInit.headers, Cookie: cookieHeader };
      }
    } else {
      fetchInit.credentials = 'include';
    }
    res = await fetch(fetchUrl, fetchInit);
  } catch (err) {
    console.error(`[apiFetch] ❌ fetch threw:`, err);
    // On the client, retry much longer — Supabase cold starts can take 10-60s
    // On the server, fail faster so the error boundary can take over with auto-retry
    const maxAttempts = isServer ? 3 : 5;
    const baseDelay = isServer ? 300 : 2000;
    if (allowRetry && attempt < maxAttempts) {
      const delay = baseDelay * Math.pow(isServer ? 3 : 2, attempt - 1);
      console.warn(`[apiFetch] Retrying (attempt ${attempt + 1}/${maxAttempts}) in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
      return apiFetchOnce<T>(path, init, revalidate, true, attempt + 1);
    }
    throw new ApiError(0, friendlyNetworkMessage(err));
  }

  if (!res.ok) {
    const method = (init.method ?? 'GET').toUpperCase();
    const isRetryable =
      res.status === 0 ||
      res.status >= 500 ||
      res.status === 408 ||
      res.status === 429;
    const maxAttempts = isServer ? 3 : 5;
    const baseDelay = isServer ? 300 : 2000;
    if (allowRetry && isRetryable && (method === 'GET' || method === 'HEAD') && attempt < maxAttempts) {
      const delay = baseDelay * Math.pow(isServer ? 3 : 2, attempt - 1);
      console.warn(`[apiFetch] Retrying (attempt ${attempt + 1}/${maxAttempts}) in ${delay}ms (status ${res.status})...`);
      await new Promise((r) => setTimeout(r, delay));
      return apiFetchOnce<T>(path, init, revalidate, true, attempt + 1);
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
  emergencyContact: unknown;
  assignedTrainerId: string | null;
}

export interface CheckinRow {
  id: string;
  memberId: string;
  source: string;
  checkedInAt: string;
  staffId: string | null;
  sessionId: string | null;
  member?: { id: string; fullName: string } | null;
}

