import { ShoppingBag } from 'lucide-react';
import { Alert } from '../../../components/ui/alert';
import { EmptyState } from '../../../components/ui/empty-state';
import { PageHeader } from '../../../components/ui/page-header';
import { StatusBadge } from '../../../components/ui/status-badge';
import { apiFetch, type ProductRow, type OrderRow } from '../../../lib/api';

export const dynamic = 'force-dynamic';

export default async function ShopPage() {
  let products: ProductRow[] = [];
  let orders: OrderRow[] = [];
  let err: string | null = null;
  try {
    const [prods, ordersPage] = await Promise.all([
      apiFetch<ProductRow[]>('/shop/products'),
      apiFetch<{ items: OrderRow[] }>('/shop/orders'),
    ]);
    products = prods;
    orders = ordersPage.items;
  } catch (e) {
    err = (e as { message?: string }).message ?? 'failed to load';
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-4">
      <PageHeader title="Shop" description="In-app supplement store with VAT-aware pricing." />
      {err && <Alert>{err}</Alert>}

      <section>
        <h2 className="text-base font-semibold tracking-tight text-text mb-3">Products</h2>
        {products.length === 0 ? (
          <div className="bg-surface border border-border rounded-lg">
            <EmptyState
              icon={ShoppingBag}
              title="No products yet"
              description="Add a product via API to surface it in the member shop."
            />
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {products.map((p) => (
              <div key={p.id} className="bg-surface border border-border rounded-lg p-4 hover:border-text3/40 transition-colors">
                <div className="text-text font-medium">{p.nameEn}</div>
                <div className="text-xs text-text3 font-mono">{p.sku}</div>
                <div className="mt-3 text-text font-semibold tabular-nums">AED {p.priceAed.toFixed(2)}</div>
                <div className="text-xs text-text2">VAT {p.vatRate}%</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold tracking-tight text-text mb-3">Recent orders</h2>
        <div className="bg-surface border border-border rounded-lg overflow-y-auto overflow-x-auto flex-1 min-h-0">
          <table className="w-full text-sm">
            <thead className="bg-surface2 sticky top-0 z-10 text-text3 text-[11px] font-medium uppercase tracking-wider border-b border-border">
              <tr>
                <th className="text-left px-4 py-3">Order</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Total</th>
                <th className="text-left px-4 py-3">Placed</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-text3">No orders yet.</td>
                </tr>
              )}
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-border hover:bg-surface2/60 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-text2">{o.id.slice(0, 8)}</td>
                  <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                  <td className="px-4 py-3 text-text font-medium tabular-nums">AED {o.totalAed.toFixed(2)}</td>
                  <td className="px-4 py-3 text-text2 tabular-nums">{new Date(o.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
