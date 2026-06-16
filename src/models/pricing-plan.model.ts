import mongoose, { Document, Schema } from 'mongoose';

export type PlanType = 'school' | 'teacher_premium';
export type PlanCode =
  | 'school_monthly' | 'school_6month' | 'school_annual'
  | 'teacher_premium_monthly' | 'teacher_premium_6month' | 'teacher_premium_annual';

export interface IPricingPlan extends Document {
  code: PlanCode;
  type: PlanType;
  durationMonths: 1 | 6 | 12;
  // Price excluding VAT, stored as integer halala. Admin can edit via /api/admin/pricing-plans.
  priceHalala: number;
  // Admin-editable display labels (Arabic + English).
  nameEn: string;
  nameAr: string;
  isActive: boolean;
  // When this version of the plan came into effect. Historical invoices reference
  // the price at issue time, not whatever the plan reads now.
  effectiveFrom: Date;
  createdAt: Date;
  updatedAt: Date;
}

const pricingPlanSchema = new Schema<IPricingPlan>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      enum: [
        'school_monthly', 'school_6month', 'school_annual',
        'teacher_premium_monthly', 'teacher_premium_6month', 'teacher_premium_annual',
      ],
    },
    type: { type: String, required: true, enum: ['school', 'teacher_premium'] },
    durationMonths: { type: Number, required: true, enum: [1, 6, 12] },
    priceHalala: { type: Number, required: true, min: 0 },
    nameEn: { type: String, required: true, trim: true },
    nameAr: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    effectiveFrom: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

pricingPlanSchema.index({ type: 1, isActive: 1 });

export const PricingPlan = mongoose.model<IPricingPlan>('PricingPlan', pricingPlanSchema);
