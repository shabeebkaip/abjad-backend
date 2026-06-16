/**
 * Atomic per-year sequential invoice numbering.
 * Format: INV-YYYY-NNNNN (5-digit zero-padded; rolls over per calendar year).
 *
 * Concurrency: backed by Mongo's `findOneAndUpdate` with `$inc` + upsert,
 * which is atomic at the document level. Two parallel callers will get two
 * distinct sequence values — no race.
 */
import { Counter } from '../models/counter.model';

const PAD_WIDTH = 5;
const MAX_PER_YEAR = 10 ** PAD_WIDTH - 1; // 99,999 invoices/year before we need to widen

export async function nextInvoiceNumber(date: Date = new Date()): Promise<string> {
  const year = date.getUTCFullYear();
  const key = `invoice-${year}`;

  const doc = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  if (!doc) {
    // Defensive — findOneAndUpdate with upsert+new should never return null.
    throw new Error('Failed to allocate invoice number');
  }

  if (doc.seq > MAX_PER_YEAR) {
    throw new Error(
      `Invoice sequence overflow for ${year}: ${doc.seq} > ${MAX_PER_YEAR}. Widen PAD_WIDTH in invoice-number.util.ts.`,
    );
  }

  const padded = String(doc.seq).padStart(PAD_WIDTH, '0');
  return `INV-${year}-${padded}`;
}
