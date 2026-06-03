'use client';

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle,
  CreditCard,
  History,
  Minus,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  ShoppingCart,
  Tag,
  Trash2,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { Alert } from '../../../components/ui/alert';
import { EmptyState } from '../../../components/ui/empty-state';
import { StatusBadge } from '../../../components/ui/status-badge';
import type { MembershipPlanRow, ProductRow, SaleRow } from '../../../lib/api';
import { apiFetch } from '../../../lib/api';

type ViewMode = 'sell' | 'history';

type LineKind = 'PRODUCT' | 'CLASS_DROPIN' | 'MEMBERSHIP' | 'DAY_PASS';

interface CartItem {
  key: string;
  kind: LineKind;
  refId?: string;
  name: string;
  quantity: number;
  unitPriceAed: number;
  vatRate: number;
}

interface MemberOption {
  id: string;
  fullName: string;
  phone: string | null;
}

interface Props {
  products: ProductRow[];
  recentSales: SaleRow[];
  dailyTotal: number;
  dailyCount: number;
  plans: MembershipPlanRow[];
  initialErrors: string[];
}

function aed(fils: number): string {
  return `AED ${(fils / 100).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDateTime(d: string): string {
  return new Date(d).toISOString().replace('T', ' ').slice(0, 16);
}

const DAY_PASS_PRICE = parseInt(process.env.NEXT_PUBLIC_DAY_PASS_PRICE_FILS ?? '5000', 10); // default 50 AED

export function PosClient({ products, recentSales, dailyTotal, dailyCount, plans, initialErrors }: Props) {
  const router = useRouter();

  // View
  const [view, setView] = useState<ViewMode>('sell');
  const [error, setError] = useState<string | null>(null);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartKey, setCartKey] = useState(0);

  // Product / category search
  const [productSearch, setProductSearch] = useState('');
  const [sellTab, setSellTab] = useState<'products' | 'dropins' | 'plans' | 'daypass'>('products');

  // Member lookup
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState<MemberOption[]>([]);
  const [searchingMember, setSearchingMember] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberOption | null>(null);
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);

  // Checkout
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutSale, setCheckoutSale] = useState<SaleRow | null>(null);
  const [receiptSale, setReceiptSale] = useState<SaleRow | null>(null);

  // History / detail
  const [detailSale, setDetailSale] = useState<SaleRow | null>(null);
  const [refundTarget, setRefundTarget] = useState<SaleRow | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refunding, setRefunding] = useState(false);

  // Cart computations
  const cartTotals = useMemo(() => {
    let subtotal = 0;
    let vat = 0;
    for (const item of cart) {
      const lineSub = item.unitPriceAed * item.quantity;
      subtotal += lineSub;
      vat += Math.round((lineSub * item.vatRate) / 100);
    }
    return { subtotalAed: subtotal, vatAed: vat, totalAed: subtotal + vat };
  }, [cart]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return q
      ? products.filter((p) => p.nameEn.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      : products;
  }, [products, productSearch]);

  const dropinPlans = useMemo(() => plans.filter((p) => p.active), [plans]);

  // ── Cart operations ──

  const addToCart = useCallback((item: Omit<CartItem, 'key'>) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.kind === item.kind && c.refId === item.refId && c.name === item.name);
      if (existing) {
        return prev.map((c) =>
          c.kind === item.kind && c.refId === item.refId && c.name === item.name
            ? { ...c, quantity: c.quantity + 1 }
            : c,
        );
      }
      setCartKey((k) => k + 1);
      return [...prev, { ...item, key: `${item.kind}-${item.refId ?? 'noref'}-${item.name}-${cartKey}` }];
    });
  }, [cartKey]);

  const updateQty = useCallback((key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.key === key ? { ...c, quantity: Math.max(0, c.quantity + delta) } : c))
        .filter((c) => c.quantity > 0),
    );
  }, []);

  const removeItem = useCallback((key: string) => {
    setCart((prev) => prev.filter((c) => c.key !== key));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setSelectedMember(null);
  }, []);

  // ── Member search ──

  const searchMembers = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setMemberResults([]);
      setShowMemberDropdown(false);
      return;
    }
    setSearchingMember(true);
    try {
      const membersRes = await apiFetch<{ items: Array<{ id: string; fullName: string; phone: string | null }> }>(`/members?search=${encodeURIComponent(q)}&pageSize=8`);
                  setMemberResults(membersRes.items ?? []);
      setShowMemberDropdown(true);
    } catch {
      setMemberResults([]);
    } finally {
      setSearchingMember(false);
    }
  }, []);

  // ── Checkout ──

  const handleCheckout = useCallback(async () => {
    if (cart.length === 0) return;
    setCheckingOut(true);
    setError(null);
    try {
      const lines = cart.map((c) => ({
        kind: c.kind,
        refId: c.refId,
        nameSnapshot: c.name,
        quantity: c.quantity,
        unitPriceAed: c.unitPriceAed,
        vatRate: c.vatRate,
      }));

      let saleType = 'MIXED';
      if (cart.length === 1) {
        const k = cart[0].kind;
        if (k === 'PRODUCT') saleType = 'PRODUCT';
        else if (k === 'CLASS_DROPIN') saleType = 'DROP_IN';
        else if (k === 'MEMBERSHIP') saleType = 'MEMBERSHIP_INITIATION';
        else if (k === 'DAY_PASS') saleType = 'DAY_PASS';
      }

      const createResult = await apiFetch<SaleRow>('/pos/sales', {
        method: 'POST',
        body: JSON.stringify({
          type: saleType,
          memberId: selectedMember?.id,
          lines,
        }),
      });
      
      setCheckoutSale(createResult);

      // Create payment intent
      const intent = await apiFetch<{ clientSecret: string | null; paymentIntentId: string }>(`/pos/sales/${createResult.id}/pay`, { method: 'POST' });
      
      
      setCheckoutOpen(true);
      // In a real implementation, this is where we'd use Stripe Elements / card-present SDK
      // For now, we mark it as paid immediately (mock mode)
      if (!intent.clientSecret) {
        // Already paid or idempotent; refresh to get current state
        router.refresh();
        setReceiptSale(createResult);
        setCheckoutOpen(false);
        setCheckoutSale(null);
        clearCart();
      }
      // clientSecret exists — in production, integrate Stripe Elements here
      // For mock mode, simulate immediate payment success:
      setReceiptSale(createResult);
      setCheckoutOpen(false);
      setCheckoutSale(null);
      clearCart();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCheckingOut(false);
    }
  }, [cart, selectedMember, router, clearCart]);

  // ── Refund ──

  const handleRefund = useCallback(async () => {
    if (!refundTarget) return;
    setRefunding(true);
    setError(null);
    try {
      const body = refundAmount.trim() ? { amountAed: Math.round(parseFloat(refundAmount) * 100) } : {};
      await apiFetch(`pos/sales/${refundTarget.id}/refund`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      
      setRefundTarget(null);
      setRefundAmount('');
      setDetailSale(null);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRefunding(false);
    }
  }, [refundTarget, refundAmount, router]);

  // ── Derived data ──

  const cartCount = cart.reduce((sum, c) => sum + c.quantity, 0);

  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-4">
      {/* Header: daily summary + view toggle */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-text">POS</h1>
          <p className="text-sm text-text2">
            Today: <span className="font-medium text-text tabular-nums">{aed(dailyTotal)}</span>
            <span className="mx-1.5 text-text3">·</span>
            <span className="tabular-nums">{dailyCount}</span> transaction{dailyCount !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-1">
          <button
            onClick={() => setView('sell')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              view === 'sell' ? 'bg-green/10 text-green' : 'text-text2 hover:text-text hover:bg-surface2'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            Sell
          </button>
          <button
            onClick={() => setView('history')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              view === 'history' ? 'bg-green/10 text-green' : 'text-text2 hover:text-text hover:bg-surface2'
            }`}
          >
            <History className="w-4 h-4" />
            History
          </button>
        </div>
      </div>

      {/* Errors */}
      {(error || initialErrors.length > 0) && (
        <div className="space-y-1">
          {initialErrors.map((e, i) => (
            <Alert key={`init-${i}`}>{e}</Alert>
          ))}
          {error && (
            <div className="rounded-md bg-error/10 text-error text-sm px-4 py-3 ring-1 ring-error/20 flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="text-error/70 hover:text-error">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══ SELL VIEW ═══ */}
      {view === 'sell' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: Products / items to sell */}
          <div className="lg:col-span-2 space-y-3">
            {/* Sell tabs */}
            <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-1">
              {([
                ['products', 'Products'],
                ['dropins', 'Drop-ins'],
                ['plans', 'Plans'],
                ['daypass', 'Day Pass'],
              ] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setSellTab(k)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    sellTab === k ? 'bg-green/10 text-green' : 'text-text2 hover:text-text hover:bg-surface2'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Products tab */}
            {sellTab === 'products' && (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text3 pointer-events-none" />
                  <input
                    type="search"
                    placeholder="Search products by name or SKU..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-surface2 text-text placeholder-text3 focus:outline-none focus:ring-2 focus:ring-green/40"
                  />
                </div>
                {filteredProducts.length === 0 ? (
                  <EmptyState
                    icon={Tag}
                    title="No products found"
                    description={productSearch ? 'Try a different search term.' : 'Add products in the Shop page to sell them here.'}
                  />
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {filteredProducts.map((p) => (
                      <button
                        key={p.id}
                        onClick={() =>
                          addToCart({
                            kind: 'PRODUCT',
                            refId: p.id,
                            name: p.nameEn,
                            quantity: 1,
                            unitPriceAed: p.priceAed,
                            vatRate: p.vatRate,
                          })
                        }
                        className="text-left p-3 rounded-lg border border-border bg-surface hover:bg-surface2 hover:border-green/30 transition-all group"
                      >
                        <div className="text-sm font-medium text-text group-hover:text-green truncate">
                          {p.nameEn}
                        </div>
                        <div className="text-xs text-text3 mt-0.5">{p.sku}</div>
                        <div className="text-sm font-semibold text-text mt-2 tabular-nums">
                          {aed(p.priceAed)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Drop-ins tab */}
            {sellTab === 'dropins' && (
              <div className="space-y-3">
                <p className="text-sm text-text2">Class drop-ins are available via the Classes page. Select an active plan with drop-in pricing below, or use a free-form Day Pass.</p>
                {/* Show class types would require fetching from Classes API — use Plans tab for membership-based drop-ins */}
                <EmptyState
                  icon={CalendarDays}
                  title="Drop-in via POS"
                  description="Sell a Day Pass for walk-in access, or sell a membership plan from the Plans tab."
                />
              </div>
            )}

            {/* Plans tab */}
            {sellTab === 'plans' && (
              <div className="space-y-3">
                {dropinPlans.length === 0 ? (
                  <EmptyState
                    icon={Wallet}
                    title="No active plans"
                    description="Create membership plans in the Memberships page to sell them here."
                  />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {dropinPlans.map((plan) => (
                      <button
                        key={plan.id}
                        onClick={() =>
                          addToCart({
                            kind: 'MEMBERSHIP',
                            refId: plan.id,
                            name: plan.nameEn,
                            quantity: 1,
                            unitPriceAed: plan.priceAed,
                            vatRate: plan.vatRate,
                          })
                        }
                        className="text-left p-4 rounded-lg border border-border bg-surface hover:bg-surface2 hover:border-green/30 transition-all group"
                      >
                        <div className="text-sm font-medium text-text group-hover:text-green">{plan.nameEn}</div>
                        <div className="text-xs text-text3 mt-0.5">{plan.durationDays} days{plan.includesClasses ? ' · includes classes' : ''}{plan.maxFreezeDays > 0 ? ` · ${plan.maxFreezeDays}d freeze` : ''}</div>
                        <div className="text-lg font-semibold text-text mt-2 tabular-nums">{aed(plan.priceAed)}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Day Pass tab */}
            {sellTab === 'daypass' && (
              <div className="space-y-3">
                <div className="p-4 rounded-lg border border-border bg-surface">
                  <label className="text-sm font-medium text-text">Day Pass Price (AED)</label>
                  <p className="text-xs text-text3 mt-1 mb-3">Default price for a single day of gym access.</p>
                  <button
                    onClick={() =>
                      addToCart({
                        kind: 'DAY_PASS',
                        name: 'Day Pass',
                        quantity: 1,
                        unitPriceAed: DAY_PASS_PRICE,
                        vatRate: 5,
                      })
                    }
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green text-white text-sm font-medium hover:bg-green/90 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Day Pass ({aed(DAY_PASS_PRICE)})
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right: Cart */}
          <div className="lg:col-span-1">
            <div className="sticky top-4 border border-border rounded-lg bg-surface overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-surface2/50">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-text flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4" />
                    Cart
                    {cartCount > 0 && (
                      <span className="text-xs bg-green/15 text-green px-1.5 py-0.5 rounded-full font-medium tabular-nums">
                        {cartCount}
                      </span>
                    )}
                  </h2>
                  {cart.length > 0 && (
                    <button
                      onClick={clearCart}
                      className="text-xs text-text3 hover:text-error transition-colors flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {cart.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <ShoppingCart className="w-8 h-8 text-text3 mx-auto mb-2" />
                  <p className="text-sm text-text3">Cart is empty</p>
                  <p className="text-xs text-text3 mt-0.5">Add products, plans, or day passes</p>
                </div>
              ) : (
                <>
                  {/* Cart items */}
                  <div className="divide-y divide-border max-h-64 overflow-y-auto">
                    {cart.map((item) => (
                      <div key={item.key} className="px-4 py-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-text truncate">{item.name}</div>
                          <div className="text-xs text-text3">
                            {item.kind === 'PRODUCT'
                              ? 'Product'
                              : item.kind === 'MEMBERSHIP'
                                ? 'Plan'
                                : item.kind === 'CLASS_DROPIN'
                                  ? 'Drop-in'
                                  : 'Day Pass'}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => updateQty(item.key, -1)}
                            className="w-6 h-6 rounded-md border border-border flex items-center justify-center hover:bg-surface2 text-text3 hover:text-text transition-colors"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-sm tabular-nums text-text w-6 text-center font-medium">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQty(item.key, 1)}
                            className="w-6 h-6 rounded-md border border-border flex items-center justify-center hover:bg-surface2 text-text3 hover:text-text transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => removeItem(item.key)}
                            className="ml-1 w-6 h-6 rounded-md flex items-center justify-center hover:bg-error/10 text-text3 hover:text-error transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Totals */}
                  <div className="px-4 py-3 border-t border-border space-y-1.5 bg-surface2/30">
                    <div className="flex justify-between text-sm text-text2">
                      <span>Subtotal</span>
                      <span className="tabular-nums">{aed(cartTotals.subtotalAed)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-text2">
                      <span>VAT</span>
                      <span className="tabular-nums">{aed(cartTotals.vatAed)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-semibold text-text pt-1.5 border-t border-border">
                      <span>Total</span>
                      <span className="tabular-nums">{aed(cartTotals.totalAed)}</span>
                    </div>
                  </div>

                  {/* Member lookup */}
                  <div className="px-4 py-3 border-t border-border relative">
                    <label className="text-xs font-medium text-text3 mb-1.5 block">Attach member (optional)</label>
                    {selectedMember ? (
                      <div className="flex items-center justify-between p-2 rounded-md bg-green/5 border border-green/20">
                        <div className="flex items-center gap-2 text-sm">
                          <Users className="w-4 h-4 text-green" />
                          <span className="font-medium text-text">{selectedMember.fullName}</span>
                          {selectedMember.phone && <span className="text-text3 text-xs">{selectedMember.phone}</span>}
                        </div>
                        <button
                          onClick={() => setSelectedMember(null)}
                          className="text-text3 hover:text-error transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text3 pointer-events-none" />
                            <input
                              type="search"
                              placeholder="Search member by name or phone..."
                              value={memberSearch}
                              onChange={(e) => {
                                setMemberSearch(e.target.value);
                                searchMembers(e.target.value);
                              }}
                              onFocus={() => { if (memberResults.length > 0) setShowMemberDropdown(true); }}
                              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-border bg-surface2 text-text placeholder-text3 focus:outline-none focus:ring-2 focus:ring-green/40"
                            />
                          </div>
                          {searchingMember && (
                            <RefreshCw className="w-4 h-4 text-text3 animate-spin flex-shrink-0" />
                          )}
                        </div>
                        {showMemberDropdown && memberResults.length > 0 && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setShowMemberDropdown(false)} />
                            <div className="absolute top-full mt-1 left-0 right-0 z-20 rounded-lg border border-border bg-surface shadow-lg max-h-48 overflow-y-auto">
                              {memberResults.map((m) => (
                                <button
                                  key={m.id}
                                  onClick={() => {
                                    setSelectedMember(m);
                                    setMemberSearch('');
                                    setMemberResults([]);
                                    setShowMemberDropdown(false);
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-surface2 transition-colors flex items-center justify-between"
                                >
                                  <span className="font-medium text-text">{m.fullName}</span>
                                  {m.phone && <span className="text-xs text-text3">{m.phone}</span>}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Checkout button */}
                  <div className="px-4 py-3">
                    <button
                      onClick={handleCheckout}
                      disabled={checkingOut || cart.length === 0}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-green text-white text-sm font-semibold hover:bg-green/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {checkingOut ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4" />
                          Checkout · {aed(cartTotals.totalAed)}
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ HISTORY VIEW ═══ */}
      {view === 'history' && (
        <div className="bg-surface border border-border rounded-lg overflow-y-auto flex-1 min-h-0">
          {recentSales.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No sales yet"
              description="Ring up a product, membership, or day pass to get started."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface2 sticky top-0 z-10 text-text3 text-[11px] font-medium uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3">When</th>
                    <th className="text-left px-4 py-3">Type</th>
                    <th className="text-left px-4 py-3">Items</th>
                    <th className="text-left px-4 py-3">Total</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Refunded</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSales.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => setDetailSale(s)}
                      className="border-t border-border hover:bg-surface2/60 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 text-text2 tabular-nums whitespace-nowrap">
                        {fmtDateTime(s.createdAt)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusBadge status={s.type} />
                      </td>
                      <td className="px-4 py-3 text-text2 max-w-xs truncate">
                        {s.lines.map((l) => `${l.quantity}× ${l.nameSnapshot}`).join(', ')}
                      </td>
                      <td className="px-4 py-3 text-text font-medium tabular-nums whitespace-nowrap">
                        {aed(s.totalAed)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusBadge status={s.paymentStatus} />
                      </td>
                      <td className="px-4 py-3 text-text2 tabular-nums whitespace-nowrap">
                        {(s as SaleRow & { refundedAed?: number }).refundedAed
                          ? aed((s as SaleRow & { refundedAed: number }).refundedAed)
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ MODALS ═══ */}

      {/* Checkout modal (Stripe payment) */}
      {checkoutOpen && checkoutSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCheckoutOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-text">Payment</h3>
              <button onClick={() => setCheckoutOpen(false)} className="text-text3 hover:text-text">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-sm text-text2">
                <span>Sale total</span>
                <span className="font-medium text-text tabular-nums">{aed(checkoutSale.totalAed)}</span>
              </div>
              <p className="text-xs text-text3">
                In production, Stripe Elements or card-present Terminal SDK renders here.
                In mock mode, payment is simulated.
              </p>
              <button
                onClick={() => {
                  setCheckoutOpen(false);
                  setCheckoutSale(null);
                  setReceiptSale(checkoutSale);
                  router.refresh();
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-green text-white text-sm font-semibold hover:bg-green/90 transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                Simulate Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt modal */}
      {receiptSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setReceiptSale(null)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-text flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green" />
                Sale Complete
              </h3>
              <button onClick={() => setReceiptSale(null)} className="text-text3 hover:text-text">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text2">Sale ID</span>
                <span className="text-text font-mono text-xs">{receiptSale.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text2">Date</span>
                <span className="text-text">{fmtDateTime(receiptSale.createdAt)}</span>
              </div>
              <div className="border-t border-border pt-2 mt-2">
                {receiptSale.lines.map((l, i) => (
                  <div key={i} className="flex justify-between text-text2 py-0.5">
                    <span>
                      {l.quantity}× {l.nameSnapshot}
                    </span>
                    <span className="tabular-nums">{aed(l.totalAed)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-border pt-2 space-y-1">
                <div className="flex justify-between text-text2">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{aed(receiptSale.subtotalAed)}</span>
                </div>
                <div className="flex justify-between text-text2">
                  <span>VAT</span>
                  <span className="tabular-nums">{aed(receiptSale.vatAed)}</span>
                </div>
                <div className="flex justify-between font-semibold text-text text-base pt-1 border-t border-border">
                  <span>Total</span>
                  <span className="tabular-nums">{aed(receiptSale.totalAed)}</span>
                </div>
              </div>
              <div className="pt-1">
                <StatusBadge status={receiptSale.paymentStatus} />
              </div>
            </div>
            <button
              onClick={() => setReceiptSale(null)}
              className="mt-4 w-full px-4 py-2 rounded-lg border border-border text-sm font-medium text-text hover:bg-surface2 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Sale detail modal */}
      {detailSale && (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[10vh]">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDetailSale(null)} />
          <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-surface shadow-2xl p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-text">Sale Detail</h3>
              <button onClick={() => setDetailSale(null)} className="text-text3 hover:text-text">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-text2">ID</span>
                <span className="text-text font-mono text-xs">{detailSale.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text2">Date</span>
                <span className="text-text">{fmtDateTime(detailSale.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text2">Type</span>
                <StatusBadge status={detailSale.type} />
              </div>
              <div className="flex justify-between">
                <span className="text-text2">Payment</span>
                <StatusBadge status={detailSale.paymentStatus} />
              </div>
              <div className="border-t border-border pt-2">
                <span className="text-text2 text-xs block mb-2">Line items</span>
                {detailSale.lines.map((l, i) => (
                  <div key={i} className="flex justify-between py-1 text-text2">
                    <span>
                      {l.quantity}× {l.nameSnapshot}
                    </span>
                    <span className="tabular-nums">{aed(l.totalAed)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-border pt-2 space-y-1">
                <div className="flex justify-between text-text2">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{aed(detailSale.subtotalAed)}</span>
                </div>
                <div className="flex justify-between text-text2">
                  <span>VAT</span>
                  <span className="tabular-nums">{aed(detailSale.vatAed)}</span>
                </div>
                <div className="flex justify-between font-semibold text-text">
                  <span>Total</span>
                  <span className="tabular-nums">{aed(detailSale.totalAed)}</span>
                </div>
                {(detailSale as SaleRow & { refundedAed?: number }).refundedAed ? (
                  <div className="flex justify-between text-orange-500 text-sm">
                    <span>Refunded</span>
                    <span className="tabular-nums">
                      {aed((detailSale as SaleRow & { refundedAed: number }).refundedAed)}
                    </span>
                  </div>
                ) : null}
              </div>

              {/* Refund action */}
              {(detailSale.paymentStatus === 'PAID' || detailSale.paymentStatus === 'PARTIALLY_REFUNDED') && (
                <div className="border-t border-border pt-3">
                  <button
                    onClick={() => {
                      setRefundTarget(detailSale);
                      setRefundAmount('');
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-500/10 transition-colors"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    Issue Refund
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Refund confirmation modal */}
      {refundTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setRefundTarget(null); setRefundAmount(''); }} />
          <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-surface shadow-2xl p-6">
            <h3 className="text-base font-semibold text-text mb-1">Issue Refund</h3>
            <p className="text-sm text-text2 mb-4">
              Refund createResult <span className="font-mono text-xs">{refundTarget.id}</span>?
              Total: {aed(refundTarget.totalAed)}
              {(refundTarget as SaleRow & { refundedAed?: number }).refundedAed
                ? ` (${aed((refundTarget as SaleRow & { refundedAed: number }).refundedAed)} already refunded)`
                : ''}
            </p>
            <div className="mb-4">
              <label className="text-xs text-text3 block mb-1">
                Refund amount AED (leave empty for full refund)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder={`${((refundTarget.totalAed - ((refundTarget as SaleRow & { refundedAed?: number }).refundedAed ?? 0)) / 100).toFixed(2)}`}
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface2 text-text placeholder-text3 focus:outline-none focus:ring-2 focus:ring-green/40"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setRefundTarget(null); setRefundAmount(''); }}
                className="px-4 py-2 rounded-lg border border-border text-sm text-text2 hover:bg-surface2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleRefund()}
                disabled={refunding}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors text-white bg-error hover:bg-error/90 disabled:opacity-50"
              >
                {refunding ? 'Refunding...' : 'Confirm Refund'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
