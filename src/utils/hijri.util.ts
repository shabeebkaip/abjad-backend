/**
 * Hijri date snapshot utility.
 *
 * ZATCA requires both Gregorian and Hijri dates on every invoice. We snapshot
 * the Hijri value at the time of invoice creation and persist it — never compute
 * on read. This keeps historical invoices stable even if the conversion library's
 * data tables change in a future moment-hijri release.
 */
import momentHijri from 'moment-hijri';

/**
 * Convert a JS Date (or now) to an iHijri YYYY-MM-DD string.
 * Example: 2026-04-08 → "1447-10-10"
 */
export function toHijriString(d: Date = new Date()): string {
  return momentHijri(d).format('iYYYY-iMM-iDD');
}

/**
 * Convert Hijri YYYY-MM-DD back to a JS Date (Gregorian).
 * Only used in admin tooling / reports — not on the hot path.
 */
export function fromHijriString(hijri: string): Date {
  const m = momentHijri(hijri, 'iYYYY-iMM-iDD');
  if (!m.isValid()) throw new Error(`Invalid Hijri date: ${hijri}`);
  return m.toDate();
}
