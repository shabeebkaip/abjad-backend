import mongoose from 'mongoose';
import { nextInvoiceNumber } from '../invoice-number.util';
import { Counter } from '../../models/counter.model';

describe('invoice-number.util', () => {
  beforeEach(async () => {
    await Counter.deleteMany({});
  });

  it('starts the year at INV-YYYY-00001', async () => {
    const year = new Date().getUTCFullYear();
    const n = await nextInvoiceNumber();
    expect(n).toBe(`INV-${year}-00001`);
  });

  it('produces sequential numbers within the same year', async () => {
    const a = await nextInvoiceNumber();
    const b = await nextInvoiceNumber();
    const c = await nextInvoiceNumber();
    const year = new Date().getUTCFullYear();
    expect(a).toBe(`INV-${year}-00001`);
    expect(b).toBe(`INV-${year}-00002`);
    expect(c).toBe(`INV-${year}-00003`);
  });

  it('uses a separate sequence per year', async () => {
    const a = await nextInvoiceNumber(new Date(Date.UTC(2026, 0, 1)));
    const b = await nextInvoiceNumber(new Date(Date.UTC(2027, 0, 1)));
    expect(a).toBe('INV-2026-00001');
    expect(b).toBe('INV-2027-00001');
  });

  it('is race-safe under parallel allocation', async () => {
    // Allocate 50 numbers concurrently. Every result must be unique.
    const promises = Array.from({ length: 50 }).map(() => nextInvoiceNumber());
    const numbers = await Promise.all(promises);
    const unique = new Set(numbers);
    expect(unique.size).toBe(50);
    // And they should be exactly 00001..00050 (in some order).
    const year = new Date().getUTCFullYear();
    for (let i = 1; i <= 50; i++) {
      expect(unique.has(`INV-${year}-${String(i).padStart(5, '0')}`)).toBe(true);
    }
  });

  it('zero-pads to 5 digits', async () => {
    // Pre-set the counter so the next call returns the padded form we want to inspect.
    await Counter.create({ key: `invoice-${new Date().getUTCFullYear()}`, seq: 41 });
    const n = await nextInvoiceNumber();
    expect(n).toMatch(/-00042$/);
  });
});

// Helper to share the same in-memory mongo as the auth test suite (jest.setup.js).
// If the global setup hasn't run, ensure connection here.
beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    // jest.setup.js is expected to provide the URL; bail with a clear error if missing.
    throw new Error('Mongo connection not initialised — check jest.setup.js');
  }
});
