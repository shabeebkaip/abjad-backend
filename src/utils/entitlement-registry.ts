// Tier 2 (post-launch billing pass) — Entitlement registry.
//
// The contract between code that reads entitlements and the values an admin
// can edit on a PricingPlan. Engineering owns the key set; admins own the
// values per plan. A key existing in the registry does NOT imply the gate
// is wired — see `wiredInCode` flag below to know which keys are enforced
// today vs which ship as data-only until a follow-up wires the gate.
//
// Adding a new entitlement is a 4-step change:
//   1. Add it here with a default
//   2. Backfill PricingPlan documents (`mergeWithRegistryDefaults` does this lazily)
//   3. Surface it in the admin editor (the UI reads from /admin/entitlement-registry)
//   4. Add the gate that reads `entitlementsService.getForUser(...).<yourKey>`
//
// Renaming is a data migration — avoid. Prefer adding a new key + leaving
// the old one in place until usage drops to zero.

export type EntitlementKind = 'boolean' | 'integer' | 'integerOrNull';

export interface EntitlementRegistryEntry {
  key: string;
  name: string;
  description: string;
  kind: EntitlementKind;
  audience: 'school' | 'teacher_premium';
  // Sensible default per plan type. Step 1 ships these as the seed values;
  // the admin can override after the fact.
  defaultValue: number | boolean | null;
  // True when at least one code path enforces this entitlement today.
  // False = the value is editable in admin but doesn't affect runtime yet.
  wiredInCode: boolean;
}

// School entitlements
const SCHOOL: EntitlementRegistryEntry[] = [
  {
    key: 'maxActiveJobs',
    name: 'Max active job posts',
    description: 'Concurrent open job postings allowed. Leave Unlimited for premium tiers.',
    kind: 'integerOrNull',
    audience: 'school',
    defaultValue: null,
    wiredInCode: false,
  },
  {
    key: 'maxCvViewsPerMonth',
    name: 'CV views per month',
    description: 'How many full-detail candidate profiles can be viewed per billing period.',
    kind: 'integerOrNull',
    audience: 'school',
    defaultValue: null,
    wiredInCode: false,
  },
  {
    key: 'teamSeats',
    name: 'Team seats',
    description: 'Number of team members the school can invite (Admin / Recruiter / Interviewer / Viewer).',
    kind: 'integer',
    audience: 'school',
    defaultValue: 3,
    wiredInCode: false,
  },
  {
    key: 'trialDays',
    name: 'Trial duration (days)',
    description: 'Initial trial window when a school first subscribes. 0 = no trial.',
    kind: 'integer',
    audience: 'school',
    defaultValue: 5,
    wiredInCode: true,
  },
  {
    key: 'bulkCandidateExport',
    name: 'Bulk candidate export',
    description: 'Allow multi-select + PDF export from the candidate search page.',
    kind: 'boolean',
    audience: 'school',
    defaultValue: true,
    wiredInCode: false,
  },
  {
    key: 'prioritySupport',
    name: 'Priority support',
    description: 'Marks tickets as high priority and surfaces a "Priority" badge in the school UI.',
    kind: 'boolean',
    audience: 'school',
    defaultValue: false,
    wiredInCode: false,
  },
  {
    key: 'analyticsAccess',
    name: 'Hiring analytics',
    description: 'Access to the future hiring analytics dashboard (Tier 3 #21).',
    kind: 'boolean',
    audience: 'school',
    defaultValue: false,
    wiredInCode: false,
  },
  {
    key: 'bestMatchSort',
    name: 'Best Match sort',
    description: 'Enable WDRS-powered Best Match sort on candidate search.',
    kind: 'boolean',
    audience: 'school',
    defaultValue: true,
    wiredInCode: false,
  },
];

// Teacher premium entitlements
const TEACHER: EntitlementRegistryEntry[] = [
  {
    key: 'premiumRanking',
    name: 'Premium ranking pool',
    description: 'Placement in the WDRS premium pool — surfaces this teacher above non-premium in search.',
    kind: 'boolean',
    audience: 'teacher_premium',
    defaultValue: true,
    wiredInCode: true,
  },
  {
    key: 'verifiedBadge',
    name: 'Premium Teacher badge',
    description: 'Shows the "Premium Teacher" badge on profile and candidate cards.',
    kind: 'boolean',
    audience: 'teacher_premium',
    defaultValue: true,
    wiredInCode: false,
  },
  {
    key: 'applicationLimit',
    name: 'Daily applications',
    description: 'How many job applications a teacher can submit per day. Leave Unlimited for premium.',
    kind: 'integerOrNull',
    audience: 'teacher_premium',
    defaultValue: null,
    wiredInCode: false,
  },
  {
    key: 'monthlyJobAlerts',
    name: 'Monthly job match alerts',
    description: 'How many proactive job-match email alerts to send per month. Leave Unlimited for premium.',
    kind: 'integerOrNull',
    audience: 'teacher_premium',
    defaultValue: null,
    wiredInCode: false,
  },
];

export const ENTITLEMENT_REGISTRY: EntitlementRegistryEntry[] = [...SCHOOL, ...TEACHER];

export const ENTITLEMENTS_BY_AUDIENCE: Record<'school' | 'teacher_premium', EntitlementRegistryEntry[]> = {
  school: SCHOOL,
  teacher_premium: TEACHER,
};

// ── Helpers ──────────────────────────────────────────────────────────────

export type EntitlementValue = number | boolean | null;
export type EntitlementBag = Record<string, EntitlementValue>;

/**
 * Default entitlement bag for a plan audience. Used by:
 *  - the seed script to populate new plans
 *  - the merge helper to backfill missing keys on existing plans
 */
export function defaultEntitlementsFor(audience: 'school' | 'teacher_premium'): EntitlementBag {
  const bag: EntitlementBag = {};
  for (const e of ENTITLEMENTS_BY_AUDIENCE[audience]) bag[e.key] = e.defaultValue;
  return bag;
}

/**
 * Merge a plan's stored entitlements bag with registry defaults. Lets us add
 * a new key to the registry without backfilling every PricingPlan document —
 * missing keys read as the default at runtime.
 *
 * Storage value wins over default; nothing in the bag that the registry
 * doesn't know about is silently dropped — code reading entitlements always
 * sees a closed set.
 */
export function mergeWithRegistryDefaults(audience: 'school' | 'teacher_premium', stored?: EntitlementBag | null): EntitlementBag {
  const defaults = defaultEntitlementsFor(audience);
  if (!stored) return defaults;
  for (const key of Object.keys(defaults)) {
    if (Object.prototype.hasOwnProperty.call(stored, key)) defaults[key] = stored[key]!;
  }
  return defaults;
}

/**
 * Validate that a value the admin sent matches the kind the registry expects.
 * Throws on bad shape so the controller can return a 400.
 */
export function validateEntitlementValue(entry: EntitlementRegistryEntry, value: unknown): EntitlementValue {
  switch (entry.kind) {
    case 'boolean':
      if (typeof value !== 'boolean') throw new Error(`${entry.key} must be a boolean`);
      return value;
    case 'integer':
      if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
        throw new Error(`${entry.key} must be a non-negative integer`);
      }
      return value;
    case 'integerOrNull':
      if (value === null) return null;
      if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
        throw new Error(`${entry.key} must be a non-negative integer or null (unlimited)`);
      }
      return value;
  }
}
