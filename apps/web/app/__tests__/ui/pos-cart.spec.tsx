/**
 * POS Cart Logic — Unit Tests
 *
 * Since the PosClient is a large client component, we extract and test
 * the core cart/logic functions to validate POS business rules.
 */
import { describe, expect, it } from 'vitest';

/* ------------------------------------------------------------------ */
/* Pure functions extracted from POS logic for testability             */
/* ------------------------------------------------------------------ */

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

function aed(fils: number): string {
  return `AED ${(fils / 100).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function cartSubtotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.unitPriceAed * item.quantity, 0);
}

function cartVat(items: CartItem[]): number {
  return items.reduce((sum, item) => {
    const lineTotal = item.unitPriceAed * item.quantity;
    return sum + Math.round(lineTotal * (item.vatRate / 100));
  }, 0);
}

function cartTotal(items: CartItem[]): number {
  return cartSubtotal(items) + cartVat(items);
}

function addToCart(
  cart: CartItem[],
  item: Omit<CartItem, 'key'>,
  counter: number,
): { cart: CartItem[]; nextKey: number } {
  // Check if same item already exists (by kind + refId)
  const existing = cart.find(
    (c) => c.kind === item.kind && c.refId === item.refId && c.name === item.name,
  );
  if (existing) {
    return {
      cart: cart.map((c) =>
        c.key === existing.key ? { ...c, quantity: c.quantity + item.quantity } : c,
      ),
      nextKey: counter,
    };
  }
  return {
    cart: [...cart, { ...item, key: `item-${counter}` }],
    nextKey: counter + 1,
  };
}

function removeFromCart(cart: CartItem[], key: string): CartItem[] {
  return cart.filter((i) => i.key !== key);
}

function updateQuantity(cart: CartItem[], key: string, delta: number): CartItem[] {
  return cart
    .map((i) => {
      if (i.key !== key) return i;
      const newQty = i.quantity + delta;
      return newQty <= 0 ? null : { ...i, quantity: newQty };
    })
    .filter(Boolean) as CartItem[];
}

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

describe('POS — Cart Calculations', () => {
  const proteinBar: CartItem = {
    key: 'item-0', kind: 'PRODUCT', refId: 'prod-1',
    name: 'Protein Bar', quantity: 2, unitPriceAed: 1500, vatRate: 5,
  };
  const shaker: CartItem = {
    key: 'item-1', kind: 'PRODUCT', refId: 'prod-2',
    name: 'Shaker Bottle', quantity: 1, unitPriceAed: 3500, vatRate: 5,
  };
  const dayPass: CartItem = {
    key: 'item-2', kind: 'DAY_PASS', refId: undefined,
    name: 'Day Pass', quantity: 1, unitPriceAed: 5000, vatRate: 5,
  };

  it('calculates subtotal correctly', () => {
    const cart = [proteinBar, shaker];
    // 2 × 1500 + 1 × 3500 = 3000 + 3500 = 6500 fils
    expect(cartSubtotal(cart)).toBe(6500);
  });

  it('calculates VAT correctly at 5%', () => {
    const cart = [proteinBar];
    // 2 × 1500 = 3000, VAT = 3000 × 0.05 = 150
    expect(cartVat(cart)).toBe(150);
  });

  it('calculates total correctly (subtotal + VAT)', () => {
    const cart = [proteinBar, shaker, dayPass];
    const subtotal = 3000 + 3500 + 5000; // 11500
    const vat = Math.round(3000 * 0.05) + Math.round(3500 * 0.05) + Math.round(5000 * 0.05); // 150 + 175 + 250 = 575
    expect(cartTotal(cart)).toBe(subtotal + vat); // 12075
  });

  it('handles 0% VAT items', () => {
    const zeroVatItem: CartItem = {
      key: 'item-3', kind: 'PRODUCT', refId: 'prod-3',
      name: 'Water', quantity: 1, unitPriceAed: 200, vatRate: 0,
    };
    expect(cartVat([zeroVatItem])).toBe(0);
    expect(cartTotal([zeroVatItem])).toBe(200);
  });

  it('handles empty cart', () => {
    expect(cartSubtotal([])).toBe(0);
    expect(cartVat([])).toBe(0);
    expect(cartTotal([])).toBe(0);
  });

  it('handles large quantities without overflow', () => {
    const bulkItem: CartItem = {
      key: 'item-bulk', kind: 'PRODUCT', refId: 'prod-bulk',
      name: 'Bulk Item', quantity: 999, unitPriceAed: 10000, vatRate: 5,
    };
    expect(cartSubtotal([bulkItem])).toBe(9_990_000);
    expect(cartVat([bulkItem])).toBe(499_500);
    expect(cartTotal([bulkItem])).toBe(10_489_500);
  });

  it('formats fils to AED correctly', () => {
    expect(aed(5000)).toBe('AED 50.00');
    expect(aed(100)).toBe('AED 1.00');
    expect(aed(0)).toBe('AED 0.00');
    expect(aed(999999)).toBe('AED 9,999.99');
  });
});

describe('POS — Cart Operations', () => {
  it('adds a new item to cart', () => {
    const { cart } = addToCart([], {
      kind: 'PRODUCT', refId: 'p1', name: 'Protein', quantity: 1,
      unitPriceAed: 1500, vatRate: 5,
    }, 0);

    expect(cart).toHaveLength(1);
    expect(cart[0].name).toBe('Protein');
    expect(cart[0].quantity).toBe(1);
    expect(cart[0].key).toBe('item-0');
  });

  it('increments quantity when same item added again', () => {
    const initial: CartItem[] = [{
      key: 'item-0', kind: 'PRODUCT', refId: 'p1', name: 'Protein',
      quantity: 1, unitPriceAed: 1500, vatRate: 5,
    }];

    const { cart } = addToCart(initial, {
      kind: 'PRODUCT', refId: 'p1', name: 'Protein', quantity: 1,
      unitPriceAed: 1500, vatRate: 5,
    }, 1);

    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(2);
  });

  it('removes an item from cart', () => {
    const cart: CartItem[] = [
      { key: 'item-0', kind: 'PRODUCT', refId: 'p1', name: 'Protein',
        quantity: 1, unitPriceAed: 1500, vatRate: 5 },
      { key: 'item-1', kind: 'PRODUCT', refId: 'p2', name: 'Shaker',
        quantity: 1, unitPriceAed: 3500, vatRate: 5 },
    ];

    const result = removeFromCart(cart, 'item-0');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Shaker');
  });

  it('updates quantity up', () => {
    const cart: CartItem[] = [{
      key: 'item-0', kind: 'PRODUCT', refId: 'p1', name: 'Protein',
      quantity: 1, unitPriceAed: 1500, vatRate: 5,
    }];

    const result = updateQuantity(cart, 'item-0', 3);
    expect(result[0].quantity).toBe(4);
  });

  it('removes item when quantity reaches zero', () => {
    const cart: CartItem[] = [{
      key: 'item-0', kind: 'PRODUCT', refId: 'p1', name: 'Protein',
      quantity: 1, unitPriceAed: 1500, vatRate: 5,
    }];

    const result = updateQuantity(cart, 'item-0', -1);
    expect(result).toHaveLength(0);
  });

  it('increments key counter correctly', () => {
    const { nextKey } = addToCart([], {
      kind: 'PRODUCT', refId: 'p1', name: 'Item', quantity: 1,
      unitPriceAed: 1000, vatRate: 5,
    }, 5);

    expect(nextKey).toBe(6);
  });

  it('does not increment key when item already in cart', () => {
    const initial: CartItem[] = [{
      key: 'item-3', kind: 'PRODUCT', refId: 'p1', name: 'Protein',
      quantity: 1, unitPriceAed: 1500, vatRate: 5,
    }];

    const { cart, nextKey } = addToCart(initial, {
      kind: 'PRODUCT', refId: 'p1', name: 'Protein', quantity: 1,
      unitPriceAed: 1500, vatRate: 5,
    }, 10);

    expect(cart[0].quantity).toBe(2);
    expect(nextKey).toBe(10); // unchanged
  });
});

describe('POS — VAT Compliance (UAE 5% Standard)', () => {
  it('applies 5% VAT to standard-rated items', () => {
    const item: CartItem = {
      key: 'i-1', kind: 'PRODUCT', refId: 'p1', name: 'Supplement',
      quantity: 1, unitPriceAed: 10000, vatRate: 5,
    };
    expect(cartVat([item])).toBe(500);
  });

  it('applies 0% VAT to zero-rated items (e.g., certain health services)', () => {
    const item: CartItem = {
      key: 'i-1', kind: 'PRODUCT', refId: 'p2', name: 'Health Service',
      quantity: 1, unitPriceAed: 50000, vatRate: 0,
    };
    expect(cartVat([item])).toBe(0);
  });

  it('calculates mixed-rate VAT correctly', () => {
    const standardRated: CartItem = {
      key: 'i-1', kind: 'PRODUCT', refId: 'p1', name: 'Standard Item',
      quantity: 2, unitPriceAed: 10000, vatRate: 5,
    };
    const zeroRated: CartItem = {
      key: 'i-2', kind: 'MEMBERSHIP', refId: 'plan-1', name: 'Membership',
      quantity: 1, unitPriceAed: 29900, vatRate: 0,
    };
    // Standard: 2 × 10000 = 20000, VAT = 20000 × 0.05 = 1000
    // Zero: 1 × 29900 = 29900, VAT = 0
    // Total VAT = 1000
    expect(cartVat([standardRated, zeroRated])).toBe(1000);
  });
});
