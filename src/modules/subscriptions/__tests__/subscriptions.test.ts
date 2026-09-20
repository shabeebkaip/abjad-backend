/**
 * Subscriptions module — Phase B integration tests.
 *
 * Uses the same in-memory Mongo as the auth test suite (jest.setup.js).
 */
import mongoose from 'mongoose';
import User from '../../../models/user.model';
import { Subscription } from '../../../models/subscription.model';
import { PricingPlan } from '../../../models/pricing-plan.model';
import { subscriptionsService, TRIAL_DAYS } from '../subscriptions.service';
import { getSchoolEntitlement } from '../../../utils/entitlement.util';

// Seed the active school_monthly plan once per test file.
async function seedPlans() {
  await PricingPlan.deleteMany({});
  await PricingPlan.create({
    code: 'school_monthly', type: 'school', durationMonths: 1,
    priceHalala: 130_000, nameEn: 'School Plan — Monthly', nameAr: 'باقة المدرسة — شهرية',
    isActive: true, effectiveFrom: new Date(),
  });
  await PricingPlan.create({
    code: 'school_annual', type: 'school', durationMonths: 12,
    priceHalala: 1_300_000, nameEn: 'School Plan — Annual', nameAr: 'باقة المدرسة — سنوية',
    isActive: true, effectiveFrom: new Date(),
  });
  await PricingPlan.create({
    code: 'teacher_premium_monthly', type: 'teacher_premium', durationMonths: 1,
    priceHalala: 6_000, nameEn: 'Premium Teacher — Monthly', nameAr: 'معلم مميز — شهري',
    isActive: true, effectiveFrom: new Date(),
  });
}

async function makeSchool(): Promise<string> {
  const u = await User.create({
    email: `school-${Date.now()}-${Math.random()}@test.com`,
    role: 'school',
    status: 'active',
    schoolName: 'Test School',
  });
  return (u._id as { toString(): string }).toString();
}

async function makeTeacher(): Promise<string> {
  const u = await User.create({
    email: `teacher-${Date.now()}-${Math.random()}@test.com`,
    role: 'teacher',
    status: 'active',
    firstName: 'Test',
    lastName: 'Teacher',
  });
  return (u._id as { toString(): string }).toString();
}

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    throw new Error('Mongo connection not initialised — check jest.setup.js');
  }
  await seedPlans();
});

beforeEach(async () => {
  await Subscription.deleteMany({});
  await User.deleteMany({ role: { $in: ['school', 'teacher'] } });
});

describe('subscriptions.service', () => {
  describe('startSchoolTrial', () => {
    it('creates a trialing subscription with 5-day trialEndsAt', async () => {
      const userId = await makeSchool();
      const before = Date.now();
      const sub = await subscriptionsService.startSchoolTrial(userId);
      const after = Date.now();

      expect(sub.status).toBe('trialing');
      expect(sub.planCode).toBe('school_monthly');
      expect(sub.trialEndsAt).toBeDefined();
      const expectedMs = TRIAL_DAYS * 24 * 60 * 60 * 1000;
      expect(sub.trialEndsAt!.getTime()).toBeGreaterThanOrEqual(before + expectedMs - 1000);
      expect(sub.trialEndsAt!.getTime()).toBeLessThanOrEqual(after + expectedMs + 1000);
    });

    it('also stamps trialStartedAt + trialEndsAt on the User', async () => {
      const userId = await makeSchool();
      await subscriptionsService.startSchoolTrial(userId);
      const user = await User.findById(userId);
      expect(user?.trialStartedAt).toBeDefined();
      expect(user?.trialEndsAt).toBeDefined();
    });

    it('rejects teachers', async () => {
      const userId = await makeTeacher();
      await expect(subscriptionsService.startSchoolTrial(userId)).rejects.toThrow(/Only schools/);
    });

    it('rejects starting a second trial while one exists', async () => {
      const userId = await makeSchool();
      await subscriptionsService.startSchoolTrial(userId);
      await expect(subscriptionsService.startSchoolTrial(userId)).rejects.toThrow(/already exists/i);
    });
  });

  describe('startSubscription', () => {
    it('creates an active school annual subscription', async () => {
      const userId = await makeSchool();
      const sub = await subscriptionsService.startSubscription({ userId, planCode: 'school_annual' });
      expect(sub.status).toBe('active');
      expect(sub.planCode).toBe('school_annual');
      expect(sub.durationMonths).toBe(12);
      expect(sub.currentPeriodStart).toBeDefined();
      expect(sub.currentPeriodEnd).toBeDefined();
    });

    it('rejects teacher trying to buy a school plan', async () => {
      const userId = await makeTeacher();
      await expect(
        subscriptionsService.startSubscription({ userId, planCode: 'school_annual' }),
      ).rejects.toThrow(/school plan/i);
    });

    it('rejects school trying to buy a teacher plan', async () => {
      const userId = await makeSchool();
      await expect(
        subscriptionsService.startSubscription({ userId, planCode: 'teacher_premium_monthly' }),
      ).rejects.toThrow(/teacher premium/i);
    });

    it('snapshots the plan price at signup', async () => {
      const userId = await makeSchool();
      const sub = await subscriptionsService.startSubscription({ userId, planCode: 'school_annual' });
      expect(sub.pricePerPeriodHalala).toBe(1_300_000);

      // Bump the plan price — existing sub stays the same.
      await PricingPlan.updateOne({ code: 'school_annual' }, { priceHalala: 9_999_999 });
      const fresh = await Subscription.findById(sub._id);
      expect(fresh?.pricePerPeriodHalala).toBe(1_300_000);
    });
  });

  describe('cancelSubscription', () => {
    it('immediately tears down a trial', async () => {
      const userId = await makeSchool();
      await subscriptionsService.startSchoolTrial(userId);
      const cancelled = await subscriptionsService.cancelSubscription(userId, 'changed mind');
      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.cancelledAt).toBeDefined();
      const user = await User.findById(userId);
      expect(user?.trialEndsAt).toBeUndefined();
    });

    it('cancel-at-period-end for active subs (no immediate teardown)', async () => {
      const userId = await makeSchool();
      const sub = await subscriptionsService.startSubscription({ userId, planCode: 'school_annual' });
      const cancelled = await subscriptionsService.cancelSubscription(userId);
      expect(cancelled.status).toBe('active');           // stays active
      expect(cancelled.cancelAtPeriodEnd).toBe(true);
      expect(cancelled.autoRenew).toBe(false);
      // currentPeriodEnd unchanged
      expect(cancelled.currentPeriodEnd?.getTime()).toBe(sub.currentPeriodEnd?.getTime());
    });

    it('rejects cancel when no subscription exists', async () => {
      const userId = await makeSchool();
      await expect(subscriptionsService.cancelSubscription(userId))
        .rejects.toThrow(/no active subscription/i);
    });
  });

  describe('getCurrent — lazy expiry on read', () => {
    it('flips trial → expired when trialEndsAt is in the past', async () => {
      const userId = await makeSchool();
      const sub = await subscriptionsService.startSchoolTrial(userId);
      // Force the trial into the past.
      await Subscription.updateOne(
        { _id: sub._id },
        { trialEndsAt: new Date(Date.now() - 1000) },
      );
      const current = await subscriptionsService.getCurrent(userId);
      // The returned record reflects the lazy transition — useful for UI
      // ("your trial ended X days ago"). The flags signal "no longer active".
      expect(current.isTrialing).toBe(false);
      expect(current.isPaid).toBe(false);
      expect(current.subscription?.status).toBe('expired');
      // And the underlying record is now persisted as expired.
      const fresh = await Subscription.findById(sub._id);
      expect(fresh?.status).toBe('expired');
    });
  });

  describe('grandfatherAllExistingAccounts', () => {
    it('sets legacyAccess=true on every user without it', async () => {
      await makeSchool();
      await makeSchool();
      await makeTeacher();
      const r = await subscriptionsService.grandfatherAllExistingAccounts();
      expect(r.updated).toBeGreaterThanOrEqual(3);
      const all = await User.find({ role: { $in: ['school', 'teacher'] } });
      for (const u of all) expect(u.legacyAccess).toBe(true);
    });

    it('is idempotent (no-op on second run)', async () => {
      await makeSchool();
      await subscriptionsService.grandfatherAllExistingAccounts();
      const r2 = await subscriptionsService.grandfatherAllExistingAccounts();
      expect(r2.updated).toBe(0);
    });
  });
});

describe('getSchoolEntitlement', () => {
  it('returns legacy access for grandfathered school', async () => {
    const userId = await makeSchool();
    await User.findByIdAndUpdate(userId, { legacyAccess: true });
    const ent = await getSchoolEntitlement(userId);
    expect(ent.hasAccess).toBe(true);
    expect(ent.source).toBe('legacy');
    expect(ent.cvCap).toBeNull();
    expect(ent.canContactTeachers).toBe(true);
  });

  it('returns trial access with cvCap=3 during trial', async () => {
    const userId = await makeSchool();
    await subscriptionsService.startSchoolTrial(userId);
    const ent = await getSchoolEntitlement(userId);
    expect(ent.hasAccess).toBe(true);
    expect(ent.source).toBe('trial');
    expect(ent.cvCap).toBe(3);
    expect(ent.canPostJobs).toBe(true);         // Decision #4
    expect(ent.canContactTeachers).toBe(false); // SSD §2.1.5
    expect(ent.canAccessFullAdmin).toBe(false);
  });

  it('returns paid access (no cap) after subscription', async () => {
    const userId = await makeSchool();
    await subscriptionsService.startSubscription({ userId, planCode: 'school_annual' });
    const ent = await getSchoolEntitlement(userId);
    expect(ent.source).toBe('paid');
    expect(ent.cvCap).toBeNull();
    expect(ent.canContactTeachers).toBe(true);
  });

  it('returns no access for a school without sub or legacy', async () => {
    const userId = await makeSchool();
    const ent = await getSchoolEntitlement(userId);
    expect(ent.hasAccess).toBe(false);
    expect(ent.source).toBe('none');
    expect(ent.cvCap).toBe(0);
  });

  it('returns no access for non-school roles', async () => {
    const userId = await makeTeacher();
    const ent = await getSchoolEntitlement(userId);
    expect(ent.hasAccess).toBe(false);
  });
});
