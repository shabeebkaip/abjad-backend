/**
 * Client feedback R1 §8.2–8.3: no pricing, plans or payments until the
 * business is ready to charge. While billing is not enforced, every school
 * is treated like a grandfathered (legacy) account: no job cap, no CV cap.
 * The frontend hides all billing UI behind BILLING_UI_ENABLED to match.
 *
 * Default OFF so a deploy without the variable keeps schools unblocked.
 * Set BILLING_ENFORCED=true (and flip BILLING_UI_ENABLED) to turn billing on.
 */
export const isBillingEnforced = (): boolean => process.env.BILLING_ENFORCED === 'true';
