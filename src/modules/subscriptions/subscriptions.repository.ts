import mongoose from 'mongoose';
import { Subscription, ISubscription, SubscriptionStatus } from '../../models/subscription.model';
import { PricingPlan, IPricingPlan, PlanCode } from '../../models/pricing-plan.model';

export class SubscriptionsRepository {
  async findActiveByOwner(ownerId: string): Promise<ISubscription | null> {
    return Subscription.findOne({
      ownerId: new mongoose.Types.ObjectId(ownerId),
      status: { $in: ['trialing', 'active', 'past_due'] },
    });
  }

  async findCurrentByOwner(ownerId: string): Promise<ISubscription | null> {
    // Most recent regardless of status — used for "what plan are you on?" display
    return Subscription.findOne({
      ownerId: new mongoose.Types.ObjectId(ownerId),
    }).sort({ createdAt: -1 });
  }

  async findByIdAndOwner(id: string, ownerId: string): Promise<ISubscription | null> {
    return Subscription.findOne({
      _id: new mongoose.Types.ObjectId(id),
      ownerId: new mongoose.Types.ObjectId(ownerId),
    });
  }

  async createTrial(params: {
    ownerType: 'school' | 'teacher';
    ownerId: string;
    durationMonths: 1 | 6 | 12;
    pricePerPeriodHalala: number;
    planCode: string;
    trialDays: number;
  }): Promise<ISubscription> {
    const now = new Date();
    const trialEnds = new Date(now.getTime() + params.trialDays * 24 * 60 * 60 * 1000);
    return Subscription.create({
      ownerType: params.ownerType,
      ownerId: new mongoose.Types.ObjectId(params.ownerId),
      planCode: params.planCode,
      pricePerPeriodHalala: params.pricePerPeriodHalala,
      durationMonths: params.durationMonths,
      status: 'trialing',
      trialEndsAt: trialEnds,
    });
  }

  async createActive(params: {
    ownerType: 'school' | 'teacher';
    ownerId: string;
    durationMonths: 1 | 6 | 12;
    pricePerPeriodHalala: number;
    planCode: string;
    moyasarCustomerId?: string;
    moyasarSourceId?: string;
  }): Promise<ISubscription> {
    const now = new Date();
    const end = addMonths(now, params.durationMonths);
    return Subscription.create({
      ownerType: params.ownerType,
      ownerId: new mongoose.Types.ObjectId(params.ownerId),
      planCode: params.planCode,
      pricePerPeriodHalala: params.pricePerPeriodHalala,
      durationMonths: params.durationMonths,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: end,
      autoRenew: true,
      moyasarCustomerId: params.moyasarCustomerId,
      moyasarSourceId: params.moyasarSourceId,
    });
  }

  async setStatus(id: string, status: SubscriptionStatus, extra?: Partial<ISubscription>): Promise<ISubscription | null> {
    return Subscription.findByIdAndUpdate(id, { $set: { status, ...(extra ?? {}) } }, { new: true });
  }

  async findExpiringTrials(now: Date = new Date()): Promise<ISubscription[]> {
    return Subscription.find({
      status: 'trialing',
      trialEndsAt: { $lte: now },
    });
  }

  async findExpiringSubscriptions(now: Date = new Date()): Promise<ISubscription[]> {
    return Subscription.find({
      status: { $in: ['active', 'past_due'] },
      currentPeriodEnd: { $lte: now },
    });
  }

  async findActivePlan(planCode: string): Promise<IPricingPlan | null> {
    return PricingPlan.findOne({ code: planCode as PlanCode, isActive: true });
  }
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export const subscriptionsRepository = new SubscriptionsRepository();
