import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

/* ─── Helpers ─── */

const isApiRoute = (req: Request) => {
  const pathname = new URL(req.url).pathname;
  return pathname.startsWith('/api') && pathname !== '/api/health';
};

const DASHBOARD_ROUTES = new Set([
  '/overview', '/members', '/memberships', '/classes', '/checkins',
  '/pos', '/staff', '/billing', '/messages',
]);

const isDashboardRoute = (pathname: string) => {
  const top = '/' + (pathname.split('/')[1] ?? '');
  return DASHBOARD_ROUTES.has(top);
};

const isMobileBrowser = (req: Request) => {
  const ua = req.headers.get('user-agent') ?? '';
  return /Mobi/.test(ua);
};

// E2E test mode: bypasses Clerk for browser-based E2E testing.
// API routes still require auth (tested separately).
const isE2ETestMode = () => process.env.E2E_TEST_MODE === 'true';

/* ─── Middleware ─── */

export default clerkMiddleware(async (auth, req) => {
  const { pathname } = new URL(req.url);

  // E2E test mode: bypass Clerk for page routes, keep API auth
  if (isE2ETestMode()) {
    if (isApiRoute(req)) return NextResponse.next();
    return NextResponse.next();
  }

  if (isApiRoute(req)) {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ message: 'Unauthenticated' }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Redirect mobile browsers away from dashboard routes
  if (pathname !== '/desktop-only' && isDashboardRoute(pathname) && isMobileBrowser(req)) {
    return NextResponse.redirect(new URL('/desktop-only', req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
