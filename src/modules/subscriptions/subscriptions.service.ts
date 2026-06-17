import { subscriptionsRepository } from './subscriptions.repository';
import { entitlementsService } from './entitlements.service';
import { ISubscription } from '../../models/subscription.model';
import User from '../../models/user.model';
import { AppError } from '../../utils/app-error.util';

/**
 * Default trial length per SSD §2.1.5 — 5 days from sign-up.
 * Only applies to schools.
 *
 * NOTE — Post-launch billing pass: this constant is now a FALLBACK only.
 * The runtime value comes from `plan.entitlements.trialDays`, edited in the
 * admin Pricing Plans page. The constant survives for tests / fixtures and
 * for the case where the plan record is somehow missing entitlements.
 */
export const TRIAL_DAYS = 5;
/**
 * Max CVs visible during a school's trial (SSD §2.1.5).
 */
export const TRIAL_CV_CAP = 3;

export class SubscriptionsService {
  /**
   * Schools start a free 5-day trial on demand (e.g. after sign-up).
   * Trial uses the monthly school plan as the "intended" plan reference —
   * pricing snapshot lets us bill them at conversion without re-quoting.
   */
  async startSchoolTrial(userId: string): Promise<ISubscription> {
    await this.assertCanStartNewSubscription(userId);

    const user = await User.findById(userId);
    if (!user) throw AppError.notFound('User not found');
    if (user.role !== 'school') {
      throw AppError.badRequest('Only schools can start a trial');
    }

    const plan = await subscriptionsRepository.findActivePlan('school_monthly');
    if (!plan) throw AppError.internalError('School monthly plan not configured');

    // Read trial duration from the plan's entitlement bag — admin can edit
    // via /billing/plans. Falls back to the SSD default if the bag is empty.
    const trialDays = await entitlementsService.getTrialDaysFor(plan.code);

    // Snapshot trial start on the user too (denormalised for fast entitlement checks).
    user.trialStartedAt = new Date();
    user.trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
    await user.save();

    return subscriptionsRepository.createTrial({
      ownerType: 'school',
      ownerId: userId,
      durationMonths: 1,
      pricePerPeriodHalala: plan.priceHalala,
      planCode: plan.code,
      trialDays,
    });
  }

  /**
   * Start a paid subscription. In Phase B this just creates the record —
   * the actual Moyasar charge happens via the payments service in Phase D,
   * which calls this AFTER a successful charge.
   */
  async startSubscription(params: {
    userId: string;
    planCode: string;
    moyasarCustomerId?: string;
    moyasarSourceId?: string;
  }): Promise<ISubscription> {
    await this.assertCanStartNewSubscription(params.userId);

    const user = await User.findById(params.userId);
    if (!user) throw AppError.notFound('User not found');

    const plan = await subscriptionsRepository.findActivePlan(params.planCode);
    if (!plan) throw AppError.badRequest(`Plan not available: ${params.planCode}`);

    // Sanity: plan type must match user role
    if (plan.type === 'school' && user.role !== 'school') {
      throw AppError.badRequest('School plan can only be purchased by school accounts');
    }
    if (plan.type === 'teacher_premium' && user.role !== 'teacher') {
      throw AppError.badRequest('Teacher Premium can only be purchased by teacher accounts');
    }

    return subscriptionsRepository.createActive({
      ownerType: user.role === 'school' ? 'school' : 'teacher',
      ownerId: params.userId,
      durationMonths: plan.durationMonths,
      pricePerPeriodHalala: plan.priceHalala,
      planCode: plan.code,
      moyasarCustomerId: params.moyasarCustomerId,
      moyasarSourceId: params.moyasarSourceId,
    });
  }

  /**
   * Cancel-at-period-end: subscription stays active until currentPeriodEnd,
   * then transitions to expired by the lazy check or the future cron.
   * No refunds (per SSD §3.7).
   */
  async cancelSubscription(userId: string, reason?: string): Promise<ISubscription> {
    const sub = await subscriptionsRepository.findActiveByOwner(userId);
    if (!sub) throw AppError.notFound('No active subscription found');

    if (sub.status === 'trialing') {
      // Trial cancellation = immediate teardown; no period to honour.
      sub.status = 'cancelled';
      sub.cancelledAt = new Date();
      sub.cancellationReason = reason;
      await sub.save();
      // Also clear trial denormalised fields on the user.
      await User.findByIdAndUpdate(userId, { $unset: { trialEndsAt: 1, trialStartedAt: 1 } });
      return sub;
    }

    sub.cancelAtPeriodEnd = true;
    sub.autoRenew = false;
    sub.cancellationReason = reason;
    sub.cancelledAt = new Date();
    await sub.save();
    return sub;
  }

  /**
   * "Where am I?" — public read endpoint. Returns the user's current
   * subscription state with lazy-on-read expiry so we don't depend on a cron.
   */
  async getCurrent(userId: string): Promise<{
    subscription: ISubscription | null;
    isTrialing: boolean;
    isPaid: boolean;
    isLegacy: boolean;
  }> {
    const user = await User.findById(userId);
    if (!user) throw AppError.notFound('User not found');

    let subscription = await subscriptionsRepository.findActiveByOwner(userId);

    // Lazy expiry: if we read a stale trialing/active record, transition it now.
    if (subscription) {
      subscription = await this.lazyExpire(subscription);
    }

    return {
      subscription,
      isTrialing: subscription?.status === 'trialing',
      isPaid: subscription?.status === 'active' || subscription?.status === 'past_due',
      isLegacy: !!user.legacyAccess,
    };
  }

  /**
   * Lazy-on-read state machine transitions. Avoids needing the cron to be live
   * for correctness — the cron is a backup, not the source of truth.
   */
  private async lazyExpire(sub: ISubscription): Promise<ISubscription> {
    const now = new Date();
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
    return sub;
  }

  /**
   * Reject if the user already has any non-terminal subscription.
   * Used by both startTrial and startSubscription.
   */
  private async assertCanStartNewSubscription(userId: string): Promise<void> {
    const existing = await subscriptionsRepository.findActiveByOwner(userId);
    if (existing) {
      throw AppError.conflict('An active or trialing subscription already exists');
    }
  }

  /**
   * One-shot helper for the "paywall flip on" day — marks all currently
   * existing user accounts with legacyAccess=true so they keep full access
   * forever without paying. Idempotent.
   *
   * Wire to a one-off admin endpoint or a script. NOT auto-fired.
   */
  async grandfatherAllExistingAccounts(): Promise<{ updated: number }> {
    const res = await User.updateMany(
      { legacyAccess: { $ne: true } },
      { $set: { legacyAccess: true } },
    );
    return { updated: res.modifiedCount ?? 0 };
  }
}

export const subscriptionsService = new SubscriptionsService();
