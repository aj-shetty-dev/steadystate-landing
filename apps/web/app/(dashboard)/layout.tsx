import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getSessionUser } from '../../lib/session';
import { prisma } from '../../lib/prisma';
import { Sidebar } from './sidebar';
import DatabaseWakeUp from '../../components/DatabaseWakeUp';

async function isDatabaseAvailable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in');

  const dbAvailable = await isDatabaseAvailable();
  if (!dbAvailable) {
    return <DatabaseWakeUp />;
  }

  return (
    <div className="flex h-screen">
      <Sidebar user={user} />
      <main className="flex-1 px-8 py-8 flex flex-col overflow-hidden">{children}</main>
    </div>
  );
}
