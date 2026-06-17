import mongoose, { Document, Schema } from 'mongoose';

// Website Billing Pass — Public pricing page content (per locale).
//
// Holds the editable copy blocks that drive abjad-frontend's /pricing page:
// hero, trust strip, "why Abjad" reasons, testimonials, FAQ, payment marks,
// and the footer legal block (VAT / CR / address).
//
// Plans + comparison rows are NOT stored here — they're computed live from
// the PricingPlan collection and the entitlement registry by
// pricingPageService.getPayload(). Storing them here would duplicate the
// admin/billing/plans editor and create stale data the moment marketing
// edits a plan name in one place but not the other.
//
// One document per locale. The pricingPageService reads by locale and
// merges with sensible defaults if a locale is missing.

export type PricingPaymentMethod = 'mada' | 'apple_pay' | 'stcpay' | 'moyasar_card' | 'bank_transfer';

export interface IPricingHero {
  eyebrow: string;
  headline: string;
  subheadline: string;
  primaryCtaText: string;
  primaryCtaHref: string;
  secondaryCtaText: string;
  secondaryCtaHref: string;
  reassurance: string;
}

export interface IPricingTrustLogo {
  name: string;
  logoUrl?: string;
}

export interface IPricingTrustStrip {
  // Optional admin override of the live aggregated count. Useful before
  // launch when the real numbers are too small; admin can set a target.
  schoolCountOverride?: number;
  teacherCountOverride?: number;
  logos: IPricingTrustLogo[];
}

export interface IPricingWhyReason {
  icon: string;        // lucide name (Clock, ShieldCheck, ...)
  title: string;
  body: string;
}

export interface IPricingTestimonial {
  kind: 'anchor' | 'short';
  name: string;
  role: string;
  school: string;
  city?: string;
  outcome?: string;    // optional bold outcome for anchor testimonials
  photoUrl?: string;
  quote: string;
}

export interface IPricingFaqItem {
  q: string;
  a: string;
}

export interface IPricingFooterLegal {
  vatNumber: string;
  crNumber: string;
  address: string;
}

export interface IPricingPageContent extends Document {
  locale: 'en' | 'ar';
  hero: IPricingHero;
  trustStrip: IPricingTrustStrip;
  whyAbjad: IPricingWhyReason[];
  testimonials: IPricingTestimonial[];
  faq: IPricingFaqItem[];
  paymentMethods: PricingPaymentMethod[];
  footerLegal: IPricingFooterLegal;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const heroSchema = new Schema<IPricingHero>(
  {
    eyebrow: { type: String, default: '', maxlength: 200 },
    headline: { type: String, default: '', maxlength: 200 },
    subheadline: { type: String, default: '', maxlength: 500 },
    primaryCtaText: { type: String, default: '', maxlength: 60 },
    primaryCtaHref: { type: String, default: '', maxlength: 500 },
    secondaryCtaText: { type: String, default: '', maxlength: 60 },
    secondaryCtaHref: { type: String, default: '', maxlength: 500 },
    reassurance: { type: String, default: '', maxlength: 300 },
  },
  { _id: false },
);

const trustLogoSchema = new Schema<IPricingTrustLogo>(
  {
    name: { type: String, required: true, maxlength: 200 },
    logoUrl: { type: String, maxlength: 500 },
  },
  { _id: false },
);

const trustStripSchema = new Schema<IPricingTrustStrip>(
  {
    schoolCountOverride: { type: Number, min: 0 },
    teacherCountOverride: { type: Number, min: 0 },
    logos: { type: [trustLogoSchema], default: [] },
  },
  { _id: false },
);

const whyReasonSchema = new Schema<IPricingWhyReason>(
  {
    icon: { type: String, default: 'Sparkles', maxlength: 60 },
    title: { type: String, default: '', maxlength: 200 },
    body: { type: String, default: '', maxlength: 500 },
  },
  { _id: false },
);

const testimonialSchema = new Schema<IPricingTestimonial>(
  {
    kind: { type: String, enum: ['anchor', 'short'], default: 'short' },
    name: { type: String, default: '', maxlength: 200 },
    role: { type: String, default: '', maxlength: 200 },
    school: { type: String, default: '', maxlength: 200 },
    city: { type: String, maxlength: 100 },
    outcome: { type: String, maxlength: 400 },
    photoUrl: { type: String, maxlength: 500 },
    quote: { type: String, default: '', maxlength: 1000 },
  },
  { _id: false },
);

const faqItemSchema = new Schema<IPricingFaqItem>(
  {
    q: { type: String, default: '', maxlength: 300 },
    a: { type: String, default: '', maxlength: 2000 },
  },
  { _id: false },
);

const footerLegalSchema = new Schema<IPricingFooterLegal>(
  {
    vatNumber: { type: String, default: '', maxlength: 30 },
    crNumber: { type: String, default: '', maxlength: 30 },
    address: { type: String, default: '', maxlength: 400 },
  },
  { _id: false },
);

const pricingPageContentSchema = new Schema<IPricingPageContent>(
  {
    locale: {
      type: String,
      required: true,
      unique: true,
      enum: ['en', 'ar'],
    },
    hero: { type: heroSchema, default: () => ({}) },
    trustStrip: { type: trustStripSchema, default: () => ({ logos: [] }) },
    whyAbjad: { type: [whyReasonSchema], default: [] },
    testimonials: { type: [testimonialSchema], default: [] },
    faq: { type: [faqItemSchema], default: [] },
    paymentMethods: {
      type: [String],
      enum: ['mada', 'apple_pay', 'stcpay', 'moyasar_card', 'bank_transfer'],
      default: ['mada', 'apple_pay', 'stcpay', 'moyasar_card', 'bank_transfer'],
    },
    footerLegal: { type: footerLegalSchema, default: () => ({}) },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, minimize: false },
);

export const PricingPageContent = mongoose.model<IPricingPageContent>(
  'PricingPageContent',
  pricingPageContentSchema,
);
