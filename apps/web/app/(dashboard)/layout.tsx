import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getSessionUser } from '../../lib/session';
import { Sidebar } from './sidebar';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/onboarding');

  return (
    <div className="flex min-h-screen">
      <Sidebar user={user} />
      <main className="flex-1 px-8 py-8 overflow-x-auto">{children}</main>
    </div>
  );
}
