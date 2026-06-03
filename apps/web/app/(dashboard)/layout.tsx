import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { auth } from '@clerk/nextjs/server';
import { getSessionUser } from '../../lib/session';
import { prisma } from '../../lib/prisma';
import { Sidebar } from './sidebar';
import DatabaseWakeUp from '../../components/DatabaseWakeUp';

async function isDatabaseAvailable(): Promise<boolean> {
  try {
    // Time out after 3s — if Supabase is sleeping, we want to show the wake-up screen fast
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB_CHECK_TIMEOUT')), 3000)),
    ]);
    return true;
  } catch {
    return false;
  }
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) {
    // If the user has a Clerk session but no tenant metadata, they need onboarding
    const { userId } = await auth();
    if (userId) redirect('/onboarding');
    redirect('/sign-in');
  }

  const dbAvailable = await isDatabaseAvailable();
  if (!dbAvailable) {
    return <DatabaseWakeUp />;
  }

  return (
    <div className="flex h-dvh">
      <Sidebar user={user} />
      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 flex flex-col overflow-auto">{children}</main>
    </div>
  );
}
