import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isProtectedPage = createRouteMatcher([
  '/overview(.*)',
  '/members(.*)',
  '/connections(.*)',
  '/automation(.*)',
  '/messages(.*)',
  '/billing(.*)',
  '/shop(.*)',
  '/door(.*)',
  '/subscription(.*)',
  '/admin(.*)',
  '/onboarding(.*)',
]);

const isApiRoute = createRouteMatcher(['/api(.*)']);

export default clerkMiddleware(
  async (auth, req) => {
    if (isApiRoute(req)) {
      const { userId } = await auth();
      if (!userId) {
        return NextResponse.json({ message: 'Unauthenticated' }, { status: 401 });
      }
      return NextResponse.next();
    }

    if (isProtectedPage(req)) {
      const { userId } = await auth();
      if (!userId) {
        const signInUrl = new URL('/sign-in', req.url);
        signInUrl.searchParams.set('redirect_url', req.url);
        return NextResponse.redirect(signInUrl);
      }
    }

    return NextResponse.next();
  },
  {
    publicRoutes: [
      '/',
      '/sign-in(.*)',
      '/sign-up(.*)',
      '/signup(.*)',
      '/login(.*)',
      '/pricing(.*)',
    ],
  },
);

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
