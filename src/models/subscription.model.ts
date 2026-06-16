import mongoose, { Document, Schema } from 'mongoose';

export type SubscriptionOwnerType = 'school' | 'teacher';
export type SubscriptionStatus =
  | 'trialing'   // school during the 5-day free trial
  | 'active'    // paid and within current period
  | 'past_due'  // renewal payment failed; grace period
  | 'cancelled' // user opted out; still has access until currentPeriodEnd
  | 'expired';  // currentPeriodEnd in the past, no renewal

export interface ISubscription extends Document {
  ownerType: SubscriptionOwnerType;
  ownerId: mongoose.Types.ObjectId;       // ref User (school owner or teacher)
  planCode: string;                       // ref PricingPlan.code at signup
  // Snapshotted at signup. Plan price can change later via admin; this stays as
  // the signed contract amount for this subscription.
  pricePerPeriodHalala: number;
  durationMonths: 1 | 6 | 12;
  status: SubscriptionStatus;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
  autoRenew: boolean;
  trialEndsAt?: Date;                     // null when not in trial
  // Moyasar provider attribution. Filled in Phase D; nullable for Phase A.
  moyasarCustomerId?: string;
  moyasarSourceId?: string;               // saved card token
  // Soft cancellation reason for analytics
  cancellationReason?: string;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionSchema = new Schema<ISubscription>(
  {
    ownerType: { type: String, required: true, enum: ['school', 'teacher'] },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    planCode: { type: String, required: true },
    pricePerPeriodHalala: { type: Number, required: true, min: 0 },
    durationMonths: { type: Number, required: true, enum: [1, 6, 12] },
    status: {
      type: String,
      required: true,
      enum: ['trialing', 'active', 'past_due', 'cancelled', 'expired'],
      default: 'trialing',
    },
    currentPeriodStart: { type: Date },
    currentPeriodEnd: { type: Date },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    autoRenew: { type: Boolean, default: true },
    trialEndsAt: { type: Date },
    moyasarCustomerId: { type: String },
    moyasarSourceId: { type: String },
    cancellationReason: { type: String, maxlength: 500 },
    cancelledAt: { type: Date },
  },
  { timestamps: true },
);

// One active subscription per owner at a time (sparse partial index — expired/cancelled
// don't count so renewals can chain).
subscriptionSchema.index(
  { ownerId: 1, status: 1 },
  { partialFilterExpression: { status: { $in: ['trialing', 'active', 'past_due'] } } },
);
subscriptionSchema.index({ currentPeriodEnd: 1 });

export const Subscription = mongoose.model<ISubscription>('Subscription', subscriptionSchema);
