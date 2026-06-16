/**
 * Money utilities for Abjad subscription billing.
 *
 * Policy: every amount is stored and computed as integer halala (1 SAR = 100 halala)
 * to eliminate floating-point rounding bugs in VAT and totals. SAR display is a
 * formatting concern at render time only.
 */

// SRD 3.1 — VAT 15% is hardcoded per spec to prevent calculation errors.
// If KSA ever changes the rate, this is a one-line policy change.
export const VAT_RATE_BPS = 1500; // basis points: 15.00%
export const BPS_DIVISOR  = 10_000;

export const HALALA_PER_SAR = 100;

export function sarToHalala(sar: number): number {
  if (!Number.isFinite(sar) || sar < 0) {
    throw new Error(`Invalid SAR amount: ${sar}`);
  }
  // Round to nearest halala to avoid floor() losing 1 halala on inputs like 1.005
  return Math.round(sar * HALALA_PER_SAR);
}

export function halalaToSAR(halala: number): number {
  if (!Number.isInteger(halala)) {
    throw new Error(`Halala must be an integer: ${halala}`);
  }
  return halala / HALALA_PER_SAR;
}

/**
 * Format a halala amount as a SAR string with 2 decimals, no symbol.
 * Use the symbol/locale in the caller (UI may want "ر.س" or "SAR").
 */
export function formatHalala(halala: number): string {
  return halalaToSAR(halala).toFixed(2);
}

/**
 * VAT amount in halala for a given subtotal.
 * Banker's rounding is avoided — Math.round() is half-up, which is what KSA
 * tax authorities expect for invoice amounts.
 */
export function vatHalala(subtotalHalala: number): number {
  if (!Number.isInteger(subtotalHalala) || subtotalHalala < 0) {
    throw new Error(`Subtotal must be a non-negative integer halala: ${subtotalHalala}`);
  }
  return Math.round((subtotalHalala * VAT_RATE_BPS) / BPS_DIVISOR);
}

/**
 * Convenience: compute the full invoice money breakdown from a subtotal.
 * All return values are integer halala.
 */
export function breakdownFromSubtotal(subtotalHalala: number): {
  subtotalHalala: number;
  vatHalala: number;
  totalHalala: number;
} {
  const vat = vatHalala(subtotalHalala);
  return {
    subtotalHalala,
    vatHalala: vat,
    totalHalala: subtotalHalala + vat,
  };
}

/**
 * Reverse: from a VAT-inclusive total, derive subtotal and VAT.
 * Useful when a payment provider returns the total but we need to record
 * the split on the invoice.
 */
export function breakdownFromTotal(totalHalala: number): {
  subtotalHalala: number;
  vatHalala: number;
  totalHalala: number;
} {
  if (!Number.isInteger(totalHalala) || totalHalala < 0) {
    throw new Error(`Total must be a non-negative integer halala: ${totalHalala}`);
  }
  // total = subtotal * (1 + vat) => subtotal = total / (1 + vat)
  // In bps: subtotal = total * BPS_DIVISOR / (BPS_DIVISOR + VAT_RATE_BPS)
  const subtotal = Math.round(
    (totalHalala * BPS_DIVISOR) / (BPS_DIVISOR + VAT_RATE_BPS),
  );
  return {
    subtotalHalala: subtotal,
    vatHalala: totalHalala - subtotal,
    totalHalala,
  };
}
