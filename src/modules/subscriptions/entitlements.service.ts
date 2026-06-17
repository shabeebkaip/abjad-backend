import { subscriptionsRepository } from './subscriptions.repository';
import User from '../../models/user.model';
import { PricingPlan } from '../../models/pricing-plan.model';
import {
  mergeWithRegistryDefaults,
  defaultEntitlementsFor,
  ENTITLEMENT_REGISTRY,
  TRIAL_VALUES,
  type EntitlementBag,
} from '../../utils/entitlement-registry';

// Step 1 of the entitlement registry rollout (post-launch billing pass).
//
// One read path that takes a userId and returns a flat bag of resolved
// entitlement values. Code that gates on entitlements imports this and
// reads from the bag rather than hardcoding constants. The bag's *shape*
// (which keys exist) is defined by `ENTITLEMENT_REGISTRY`; the *values*
// come from the user's active subscription's plan, with three fallback
// rules:
//
//   1. Active subscription → merge plan.entitlements with registry defaults.
//   2. Legacy / grandfathered access → top-tier (registry defaults already
//      reflect the premium values for the audience).
//   3. No subscription and not legacy → free-tier bag (booleans → false,
//      integers → 0, integerOrNull → 0). Keeps gates safe by default.

export type EntitlementSource = 'plan' | 'legacy' | 'free';

export interface ResolvedEntitlements {
  source: EntitlementSource;
  audience: 'school' | 'teacher_premium' | null;
  bag: EntitlementBag;
}

function freeBagFor(audience: 'school' | 'teacher_premium'): EntitlementBag {
  const bag: EntitlementBag = {};
  for (const e of ENTITLEMENT_REGISTRY) {
    if (e.audience !== audience) continue;
    if (e.kind === 'boolean')             bag[e.key] = false;
    else if (e.kind === 'integer')        bag[e.key] = 0;
    else                                  bag[e.key] = 0; // integerOrNull → 0 (capped)
  }
  return bag;
}

class EntitlementsService {
  async getForUser(userId: string): Promise<ResolvedEntitlements> {
    const user = await User.findById(userId).select('role legacyAccess').lean<{ role?: string; legacyAccess?: boolean } | null>();
    if (!user) {
      return { source: 'free', audience: null, bag: {} };
    }

    const audience: 'school' | 'teacher_premium' | null =
      user.role === 'school' ? 'school'
      : user.role === 'teacher' ? 'teacher_premium'
      : null;
    if (!audience) return { source: 'free', audience: null, bag: {} };

    // Grandfathered accounts always get the top-tier defaults.
    if (user.legacyAccess) {
      return { source: 'legacy', audience, bag: defaultEntitlementsFor(audience) };
    }

    const sub = await subscriptionsRepository.findActiveByOwner(userId);
    if (!sub || (sub.status !== 'active' && sub.status !== 'trialing')) {
      return { source: 'free', audience, bag: freeBagFor(audience) };
    }

    const plan = await PricingPlan.findOne({ code: sub.planCode }).lean();
    if (!plan) {
      // Active subscription points at a plan that's gone — should be impossible
      // because plan codes are a closed enum and the seed is idempotent. Be
      // defensive: fall back to the audience's free bag rather than crash.
      return { source: 'free', audience, bag: freeBagFor(audience) };
    }

    const planBag = mergeWithRegistryDefaults(audience, plan.entitlements as EntitlementBag | undefined);

    // Trial users get the plan as a taste — not the full thing. Overlay the
    // documented trial caps from the registry so a trialing school sees
    // maxActiveJobs=1 / bulkCandidateExport=false / etc., regardless of what
    // the school_monthly plan stores.
    if (sub.status === 'trialing') {
      const overlaid: EntitlementBag = { ...planBag };
      for (const e of ENTITLEMENT_REGISTRY) {
        if (e.audience !== audience) continue;
        if (Object.prototype.hasOwnProperty.call(TRIAL_VALUES, e.key)) {
          overlaid[e.key] = TRIAL_VALUES[e.key]!;
        }
      }
      return { source: 'plan', audience, bag: overlaid };
    }

    return {
      source: 'plan',
      audience,
      bag: planBag,
    };
  }

  /**
   * Convenience for "what's the trial length for a school?" — read at trial
   * start time so it reflects the latest admin edits. Falls back to the
   * registry default so an unseeded environment still functions.
   */
  async getTrialDaysFor(planCode: string): Promise<number> {
    const plan = await PricingPlan.findOne({ code: planCode }).lean();
    const stored = plan?.entitlements?.trialDays;
    if (typeof stored === 'number' && stored >= 0) return stored;
    return Number(defaultEntitlementsFor('school').trialDays ?? 0);
  }
}

export const entitlementsService = new EntitlementsService();
