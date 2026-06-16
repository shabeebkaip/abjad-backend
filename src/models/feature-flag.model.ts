import mongoose, { Document, Schema } from 'mongoose';

/**
 * Minimal feature-flag store backed by Mongo.
 *
 * Used initially for two gates:
 *  - 'teacher_premium_enabled' — auto-flips to true when verified-teacher count
 *    reaches 30 (SRD §1.3 activation prerequisite). Admin can also toggle manually.
 *  - 'school_paywall_enabled' — flips on at the launch of paid plans; existing
 *    accounts are grandfathered separately via a per-user `legacyAccess` flag
 *    set at flip time.
 *
 * Schema is intentionally generic so new flags don't need migrations.
 */
export interface IFeatureFlag extends Document {
  key: string;
  value: boolean;
  description?: string;
  updatedBy?: mongoose.Types.ObjectId;     // admin who last toggled
  createdAt: Date;
  updatedAt: Date;
}

const featureFlagSchema = new Schema<IFeatureFlag>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: Boolean, required: true, default: false },
    description: { type: String, maxlength: 500 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export const FeatureFlag = mongoose.model<IFeatureFlag>('FeatureFlag', featureFlagSchema);
