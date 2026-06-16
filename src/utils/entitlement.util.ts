/**
 * School entitlement resolver.
 *
 * One place computes "what can this school user do right now?" — services
 * call this and apply the limits in-band. Keeps subscription state from
 * leaking into every service implementation.
 *
 * Decision tree per the 2026-06-17 product confirmation:
 *   legacyAccess === true   → unlimited, no caps  (grandfathered)
 *   active paid subscription → unlimited, no caps
 *   trialing                → access with cvCap = TRIAL_CV_CAP (3)
 *   anything else           → no access (must subscribe)
 */
import User, { UserDocument } from '../models/user.model';
import { subscriptionsRepository } from '../modules/subscriptions/subscriptions.repository';
import { TRIAL_CV_CAP } from '../modules/subscriptions/subscriptions.service';

export type EntitlementSource = 'paid' | 'trial' | 'legacy' | 'none';

export interface SchoolEntitlement {
  hasAccess: boolean;
  source: EntitlementSource;
  cvCap: number | null;          // null = unlimited; number = max distinct teacher profiles visible
  canPostJobs: boolean;          // trial allows posting per Decision #4 (2026-06-17)
  canContactTeachers: boolean;   // trial blocks per SSD §2.1.5 "limited access to candidates"
  canAccessFullAdmin: boolean;   // trial blocks per SSD §2.1.5
  trialEndsAt?: Date;
  subscriptionId?: string;
}

export async function getSchoolEntitlement(userId: string): Promise<SchoolEntitlement> {
  const user = await User.findById(userId);
  if (!user) return denied();
  if (user.role !== 'school') return denied();

  // 1. Grandfathered legacy account — bypass everything.
  if (user.legacyAccess) {
    return {
      hasAccess: true,
      source: 'legacy',
      cvCap: null,
      canPostJobs: true,
      canContactTeachers: true,
      canAccessFullAdmin: true,
    };
  }

  // 2. Active subscription record.
  const sub = await subscriptionsRepository.findActiveByOwner(userId);
  if (sub) {
    const now = new Date();

    // Lazy expiry of stale records — same logic as the service, kept here so
    // entitlement reads stay consistent even if the user just hit the gate.
    if (sub.status === 'trialing' && sub.trialEndsAt && sub.trialEndsAt <= now) {
      sub.status = 'expired';
      await sub.save();
    } else if (
      (sub.status === 'active' || sub.status === 'past_due') &&
      sub.currentPeriodEnd && sub.currentPeriodEnd <= now
    ) {
      sub.status = sub.cancelAtPeriodEnd ? 'expired' : 'past_due';
      await sub.save();
    }

    if (sub.status === 'trialing') {
      return {
        hasAccess: true,
        source: 'trial',
        cvCap: TRIAL_CV_CAP,
        canPostJobs: true,        // Decision #4 — allowed during trial
        canContactTeachers: false,// SSD §2.1.5 — locked
        canAccessFullAdmin: false,
        trialEndsAt: sub.trialEndsAt,
        subscriptionId: (sub._id as { toString(): string }).toString(),
      };
    }
    if (sub.status === 'active' || sub.status === 'past_due') {
      return {
        hasAccess: true,
        source: 'paid',
        cvCap: null,
        canPostJobs: true,
        canContactTeachers: true,
        canAccessFullAdmin: true,
        subscriptionId: (sub._id as { toString(): string }).toString(),
      };
    }
  }

  // 3. No active subscription, not legacy → denied (must subscribe).
  return denied();
}

function denied(): SchoolEntitlement {
  return {
    hasAccess: false,
    source: 'none',
    cvCap: 0,
    canPostJobs: false,
    canContactTeachers: false,
    canAccessFullAdmin: false,
  };
}

/**
 * Convenience helper for User documents we already loaded — saves a lookup.
 */
export async function getSchoolEntitlementForUser(user: UserDocument): Promise<SchoolEntitlement> {
  return getSchoolEntitlement((user._id as { toString(): string }).toString());
}
