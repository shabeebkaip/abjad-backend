import mongoose, { Document, Schema } from 'mongoose';
import type { EntitlementBag } from '../utils/entitlement-registry';

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

  // ── Entitlements bag — admin-editable values, keys defined by registry ──
  // Stored as a plain object; registry validates shape on write and merges
  // defaults on read so missing keys don't break runtime gates.
  entitlements: EntitlementBag;

  // ── Marketing copy — drives the public /pricing page on abjad-frontend ──
  descriptionEn?: string;
  descriptionAr?: string;
  marketingBulletsEn: string[];
  marketingBulletsAr: string[];
  displayOrder: number;        // ordering on the pricing page (lower = first)
  isHighlighted: boolean;      // "Most Popular" badge
  ctaTextEn?: string;          // "Start Free Trial" / "Subscribe Now" / etc.
  ctaTextAr?: string;

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

    // Mixed because the registry owns the shape; Mongoose validators can't
    // express "depends on type". Validation happens in admin-pricing.service.
    entitlements: { type: Schema.Types.Mixed, default: () => ({}) },

    descriptionEn: { type: String, trim: true, maxlength: 1000 },
    descriptionAr: { type: String, trim: true, maxlength: 1000 },
    marketingBulletsEn: { type: [String], default: [] },
    marketingBulletsAr: { type: [String], default: [] },
    displayOrder: { type: Number, default: 0 },
    isHighlighted: { type: Boolean, default: false },
    ctaTextEn: { type: String, trim: true, maxlength: 60 },
    ctaTextAr: { type: String, trim: true, maxlength: 60 },
  },
  { timestamps: true, minimize: false },
);

pricingPlanSchema.index({ type: 1, isActive: 1 });
pricingPlanSchema.index({ type: 1, displayOrder: 1 });

export const PricingPlan = mongoose.model<IPricingPlan>('PricingPlan', pricingPlanSchema);
