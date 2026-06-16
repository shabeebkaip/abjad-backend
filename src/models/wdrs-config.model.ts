import mongoose, { Document, Schema } from 'mongoose';

/**
 * Singleton WDRS config — one document with the four factor weights + the
 * per-tier subscription points. Admin-editable from the dashboard per SSD §1.5
 * ("Admin can adjust WDRS weights from the Admin Panel without code changes").
 *
 * Defaults match SSD §1.2 (4-factor table, Decision #1 confirmed 2026-06-17):
 *   curriculum 35 + qualifications 35 + subscription 20 + activity 10 = 100
 */
export interface IWDRSConfig extends Document {
  // Max points contributable by each factor (must sum to 100).
  curriculumMax: number;
  qualificationsMax: number;
  subscriptionMax: number;
  activityMax: number;

  // Subscription-tier breakdown (subset of subscriptionMax).
  // Default annual=20, 6-month=14, monthly=8, none=0.
  tierAnnual: number;
  tier6Month: number;
  tierMonthly: number;
  tierFree: number;

  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const wdrsConfigSchema = new Schema<IWDRSConfig>(
  {
    curriculumMax:     { type: Number, required: true, min: 0, max: 100, default: 35 },
    qualificationsMax: { type: Number, required: true, min: 0, max: 100, default: 35 },
    subscriptionMax:   { type: Number, required: true, min: 0, max: 100, default: 20 },
    activityMax:       { type: Number, required: true, min: 0, max: 100, default: 10 },

    tierAnnual:   { type: Number, required: true, min: 0, default: 20 },
    tier6Month:   { type: Number, required: true, min: 0, default: 14 },
    tierMonthly:  { type: Number, required: true, min: 0, default: 8 },
    tierFree:     { type: Number, required: true, min: 0, default: 0 },

    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export const WDRSConfig = mongoose.model<IWDRSConfig>('WDRSConfig', wdrsConfigSchema);

/**
 * In-memory default — used when no DB row exists yet. Don't read this directly
 * from business code; call `getWDRSConfig()` from ranking.service.
 */
export const DEFAULT_WDRS_CONFIG = {
  curriculumMax: 35,
  qualificationsMax: 35,
  subscriptionMax: 20,
  activityMax: 10,
  tierAnnual: 20,
  tier6Month: 14,
  tierMonthly: 8,
  tierFree: 0,
} as const;
