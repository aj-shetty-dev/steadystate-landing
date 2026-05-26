import { Skeleton } from '../../../../components/ui/skeleton';

export default function MemberProfileLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-24" />
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-start gap-4">
          <Skeleton className="w-12 h-12 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
      </div>
      {['Membership', 'Recent check-ins', 'Invoices'].map((section) => (
        <section key={section}>
          <Skeleton className="h-5 w-36 mb-3" />
          <div className="bg-surface border border-border rounded-lg p-6 space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </section>
      ))}
    </div>
  );
}
