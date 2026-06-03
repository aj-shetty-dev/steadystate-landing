import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

/* ─── Helpers ─── */

const isApiRoute = (req: Request) => {
  const pathname = new URL(req.url).pathname;
  return pathname.startsWith('/api') && pathname !== '/api/health';
};

const DASHBOARD_ROUTES = new Set([
  '/overview',
  '/members',
  '/memberships',
  '/classes',
  '/checkins',
  '/pos',
  '/staff',
  '/billing',
  '/messages',
]);

const isDashboardRoute = (pathname: string) => {
  // Match exact route or sub-routes (e.g. /members/123, /classes/sessions/abc)
  const top = '/' + (pathname.split('/')[1] ?? '');
  return DASHBOARD_ROUTES.has(top);
};

const isMobileBrowser = (req: Request) => {
  const ua = req.headers.get('user-agent') ?? '';
  // "Mobi" matches iPhone, Android (with "Mobile"), and older iPads.
  // iPadOS ≥13 reports as desktop-class Safari so it passes through.
  return /Mobi/.test(ua);
};

/* ─── Middleware ─── */

export default clerkMiddleware(async (auth, req) => {
  if (isApiRoute(req)) {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ message: 'Unauthenticated' }, { status: 401 });
    }
    return NextResponse.next();
  }

  const { pathname } = new URL(req.url);

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
