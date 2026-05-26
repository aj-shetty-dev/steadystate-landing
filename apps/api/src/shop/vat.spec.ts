import { describe, expect, it } from 'vitest';
import { computeLineVat, sumLines } from './vat';

describe('vat', () => {
  it('computes 5% VAT correctly', () => {
    expect(computeLineVat({ unitPriceAed: 10000, quantity: 1, vatRate: 5 })).toEqual({
      subtotalAed: 10000,
      vatAed: 500,
      totalAed: 10500,
    });
  });

  it('rounds half-up to nearest fils', () => {
    expect(computeLineVat({ unitPriceAed: 333, quantity: 1, vatRate: 5 })).toEqual({
      subtotalAed: 333,
      vatAed: 17, // 16.65 → 17
      totalAed: 350,
    });
  });

  it('multiplies by quantity before VAT', () => {
    const line = computeLineVat({ unitPriceAed: 5000, quantity: 3, vatRate: 5 });
    expect(line).toEqual({ subtotalAed: 15000, vatAed: 750, totalAed: 15750 });
  });

  it('rejects invalid input', () => {
    expect(() => computeLineVat({ unitPriceAed: -1, quantity: 1, vatRate: 5 })).toThrow();
    expect(() => computeLineVat({ unitPriceAed: 1, quantity: 0, vatRate: 5 })).toThrow();
  });

  it('sums lines deterministically', () => {
    const a = computeLineVat({ unitPriceAed: 1000, quantity: 1, vatRate: 5 });
    const b = computeLineVat({ unitPriceAed: 500, quantity: 2, vatRate: 5 });
    expect(sumLines([a, b])).toEqual({ subtotalAed: 2000, vatAed: 100, totalAed: 2100 });
  });
});
