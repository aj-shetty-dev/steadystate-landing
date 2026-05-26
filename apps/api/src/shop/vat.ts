export interface VatInput {
  unitPriceAed: number; // in fils (1 AED = 100 fils)
  quantity: number;
  vatRate: number; // percent, e.g. 5
}

export interface VatLine {
  subtotalAed: number;
  vatAed: number;
  totalAed: number;
}

// VAT is computed per line then summed — matches UAE FTA invoice rounding rules.
export function computeLineVat({ unitPriceAed, quantity, vatRate }: VatInput): VatLine {
  if (quantity <= 0 || unitPriceAed < 0) throw new Error('invalid line');
  const subtotal = unitPriceAed * quantity;
  const vat = Math.round((subtotal * vatRate) / 100);
  return { subtotalAed: subtotal, vatAed: vat, totalAed: subtotal + vat };
}

export function sumLines(lines: VatLine[]): VatLine {
  return lines.reduce<VatLine>(
    (acc, l) => ({
      subtotalAed: acc.subtotalAed + l.subtotalAed,
      vatAed: acc.vatAed + l.vatAed,
      totalAed: acc.totalAed + l.totalAed,
    }),
    { subtotalAed: 0, vatAed: 0, totalAed: 0 },
  );
}
