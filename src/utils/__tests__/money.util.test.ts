import {
  sarToHalala, halalaToSAR, formatHalala,
  vatHalala, breakdownFromSubtotal, breakdownFromTotal,
  VAT_RATE_BPS,
} from '../money.util';

describe('money.util', () => {
  describe('VAT rate constant', () => {
    it('is 15.00% in basis points', () => {
      expect(VAT_RATE_BPS).toBe(1500);
    });
  });

  describe('sarToHalala / halalaToSAR', () => {
    it('round-trips integer SAR values', () => {
      expect(sarToHalala(100)).toBe(10_000);
      expect(halalaToSAR(10_000)).toBe(100);
    });

    it('rounds typical 2-decimal inputs correctly', () => {
      // Real inputs from admin pricing pages are whole or 2-decimal SAR.
      expect(sarToHalala(60)).toBe(6000);
      expect(sarToHalala(13000)).toBe(1_300_000);
      expect(sarToHalala(0.50)).toBe(50);
      expect(sarToHalala(99.99)).toBe(9999);
    });

    it('handles the canonical floating-point trap (0.1 + 0.2)', () => {
      // In integer halala this is exact — no 0.30000000000000004 bug.
      const a = sarToHalala(0.10);
      const b = sarToHalala(0.20);
      expect(a + b).toBe(30);
      expect(halalaToSAR(a + b)).toBe(0.30);
    });

    it('rejects negative and non-finite SAR', () => {
      expect(() => sarToHalala(-1)).toThrow();
      expect(() => sarToHalala(NaN)).toThrow();
      expect(() => sarToHalala(Infinity)).toThrow();
    });

    it('rejects non-integer halala', () => {
      expect(() => halalaToSAR(10.5)).toThrow();
    });
  });

  describe('formatHalala', () => {
    it('renders 2-decimal SAR string', () => {
      expect(formatHalala(10_050)).toBe('100.50');
      expect(formatHalala(0)).toBe('0.00');
      expect(formatHalala(99)).toBe('0.99');
      expect(formatHalala(1)).toBe('0.01');
    });
  });

  describe('vatHalala (15%)', () => {
    it('1,300 SAR subtotal → 195 SAR VAT', () => {
      // 130_000 halala * 0.15 = 19_500 halala
      expect(vatHalala(130_000)).toBe(19_500);
    });

    it('60 SAR subtotal → 9 SAR VAT', () => {
      expect(vatHalala(6_000)).toBe(900);
    });

    it('rounds half-up on awkward subtotals', () => {
      // 33 halala * 0.15 = 4.95 halala → rounds to 5
      expect(vatHalala(33)).toBe(5);
    });

    it('zero subtotal → zero VAT', () => {
      expect(vatHalala(0)).toBe(0);
    });

    it('rejects negative or non-integer subtotal', () => {
      expect(() => vatHalala(-1)).toThrow();
      expect(() => vatHalala(10.5)).toThrow();
    });
  });

  describe('breakdownFromSubtotal', () => {
    it('produces the school annual line — 13,000 SAR + 1,950 SAR VAT = 14,950 SAR', () => {
      const b = breakdownFromSubtotal(1_300_000);
      expect(b.subtotalHalala).toBe(1_300_000);
      expect(b.vatHalala).toBe(195_000);
      expect(b.totalHalala).toBe(1_495_000);
    });

    it('produces the teacher monthly line — 60 SAR + 9 SAR VAT = 69 SAR', () => {
      const b = breakdownFromSubtotal(6_000);
      expect(b).toEqual({ subtotalHalala: 6_000, vatHalala: 900, totalHalala: 6_900 });
    });
  });

  describe('breakdownFromTotal', () => {
    it('reverses breakdownFromSubtotal for the school annual line', () => {
      const fromSubtotal = breakdownFromSubtotal(1_300_000);
      const fromTotal = breakdownFromTotal(fromSubtotal.totalHalala);
      expect(fromTotal).toEqual(fromSubtotal);
    });

    it('reverses for the teacher monthly line', () => {
      const fromSubtotal = breakdownFromSubtotal(6_000);
      const fromTotal = breakdownFromTotal(fromSubtotal.totalHalala);
      expect(fromTotal).toEqual(fromSubtotal);
    });
  });
});
