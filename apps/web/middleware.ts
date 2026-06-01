import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isApiRoute = (req: Request) => new URL(req.url).pathname.startsWith('/api');

export default clerkMiddleware(async (auth, req) => {
  if (isApiRoute(req)) {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ message: 'Unauthenticated' }, { status: 401 });
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
