import User from '../../models/user.model';
import { PricingPlan, IPricingPlan } from '../../models/pricing-plan.model';
import { PricingPageContent, IPricingPageContent } from '../../models/pricing-page-content.model';
import { PRICING_PAGE_DEFAULTS } from '../../utils/pricing-page-defaults';
import {
  ENTITLEMENTS_BY_AUDIENCE,
  TRIAL_VALUES,
  type EntitlementRegistryEntry,
  type EntitlementBag,
  defaultEntitlementsFor,
} from '../../utils/entitlement-registry';

// Website Billing Pass — pricingPageService.getPayload(locale).
//
// Aggregates everything the public /pricing page needs into a single JSON
// response. The frontend issues one fetch per locale and renders top-to-
// bottom. Sources:
//
//   - PricingPageContent (per-locale doc) → hero, trust strip logos,
//     whyAbjad, testimonials, faq, paymentMethods, footerLegal
//   - PricingPlan (live) → plans grouped by audience and duration, with
//     computed savings vs the monthly equivalent
//   - ENTITLEMENT_REGISTRY → comparison rows (Free Trial vs Paid Plan)
//   - User collection counts → live trust strip counts
//
// Returns a stable JSON shape that the frontend types against. Adding new
// fields here is additive; renaming is a frontend coordination change.

export type PricingLocale = 'en' | 'ar';

// ── Output types ─────────────────────────────────────────────────────────

export interface PricingPagePlan {
  code: string;
  audience: 'school' | 'teacher_premium';
  durationMonths: 1 | 6 | 12;
  durationLabel: string;
  priceHalala: number;
  effectiveMonthlyHalala: number;
  savings: null | { vsMonthlyHalala: number; percent: number };
  name: string;
  description?: string;
  ctaText?: string;
  bullets: string[];
  isHighlighted: boolean;
  displayOrder: number;
  entitlements: EntitlementBag;
}

export interface PricingPageComparisonRow {
  key: string;
  label: string;
  description?: string;
  values: [string, string];   // [free, paid]
}

export interface PricingPageComparisonGroup {
  label: string;
  rows: PricingPageComparisonRow[];
}

export interface PricingPagePayload {
  locale: PricingLocale;
  generatedAt: string;
  hero: IPricingPageContent['hero'];
  trustStrip: {
    schoolCount: number;
    teacherCount: number;
    logos: { name: string; logoUrl?: string }[];
  };
  whyAbjad: IPricingPageContent['whyAbjad'];
  plans: {
    school: PricingPagePlan[];
    teacher: PricingPagePlan[];
  };
  comparison: {
    columns: [string, string];          // [Free Trial label, Paid label]
    groups: PricingPageComparisonGroup[];
  };
  testimonials: IPricingPageContent['testimonials'];
  faq: IPricingPageContent['faq'];
  paymentMethods: IPricingPageContent['paymentMethods'];
  footerLegal: IPricingPageContent['footerLegal'];
}

// ── Helpers ──────────────────────────────────────────────────────────────

function localeFor(s: string | undefined): PricingLocale {
  return s === 'ar' ? 'ar' : 'en';
}

function durationLabel(months: 1 | 6 | 12, locale: PricingLocale): string {
  if (locale === 'ar') {
    if (months === 1) return 'شهري';
    if (months === 6) return 'كل 6 أشهر';
    return 'سنوي';
  }
  if (months === 1) return 'Monthly';
  if (months === 6) return '6 Months';
  return 'Annual';
}

function describeEntitlement(
  entry: EntitlementRegistryEntry,
  value: number | boolean | null | undefined,
  locale: PricingLocale,
): string {
  const yes = locale === 'ar' ? 'نعم' : 'Yes';
  const no  = locale === 'ar' ? '—' : '—';
  const unlimited = locale === 'ar' ? 'غير محدود' : 'Unlimited';
  if (entry.kind === 'boolean') return value === true ? yes : no;
  if (entry.kind === 'integerOrNull') {
    if (value === null) return unlimited;
    return String(value ?? 0);
  }
  return String(value ?? 0);
}

// Trial-side cell for the comparison table — represents what a 5-day
// trial gives. Pulled from the same TRIAL_VALUES table that the runtime
// entitlements gate uses, so the public page and the actual cap can't drift.
function trialValueFor(entry: EntitlementRegistryEntry): number | boolean | null {
  if (Object.prototype.hasOwnProperty.call(TRIAL_VALUES, entry.key)) {
    return TRIAL_VALUES[entry.key]!;
  }
  if (entry.kind === 'boolean') return false;
  if (entry.kind === 'integerOrNull') return 0;
  return 0;
}

const GROUP_FOR_KEY: Record<string, string> = {
  // School
  maxActiveJobs:       'sourcing',
  maxCvViewsPerMonth:  'sourcing',
  bestMatchSort:       'sourcing',
  bulkCandidateExport: 'screening',
  teamSeats:           'team',
  prioritySupport:     'support',
  analyticsAccess:     'analytics',
  trialDays:           'trial',
  // Teacher
  premiumRanking:      'visibility',
  verifiedBadge:       'visibility',
  applicationLimit:    'usage',
  monthlyJobAlerts:    'usage',
};

const GROUP_LABELS_EN: Record<string, string> = {
  sourcing:   'Sourcing & Search',
  screening:  'Screening & Pipeline',
  team:       'Team & Roles',
  support:    'Support',
  analytics:  'Analytics & Reporting',
  trial:      'Trial',
  visibility: 'Visibility',
  usage:      'Usage',
};
const GROUP_LABELS_AR: Record<string, string> = {
  sourcing:   'البحث والتوظيف',
  screening:  'الفرز والتقييم',
  team:       'الفريق والصلاحيات',
  support:    'الدعم',
  analytics:  'التحليلات والتقارير',
  trial:      'التجربة',
  visibility: 'الظهور',
  usage:      'الاستخدام',
};

// ── Plan transform ───────────────────────────────────────────────────────

function planFromDoc(
  doc: IPricingPlan,
  monthlyEquivalent: number | null,
  locale: PricingLocale,
): PricingPagePlan {
  const months = doc.durationMonths;
  const effectiveMonthlyHalala = Math.round(doc.priceHalala / months);

  let savings: PricingPagePlan['savings'] = null;
  if (monthlyEquivalent != null && months > 1) {
    const yearlyAtMonthly = monthlyEquivalent * 12;
    const yearlyAtThisPlan = doc.priceHalala * (12 / months);
    const vsMonthlyHalala = Math.round(yearlyAtMonthly - yearlyAtThisPlan);
    if (vsMonthlyHalala > 0) {
      const percent = Math.round((vsMonthlyHalala / yearlyAtMonthly) * 100);
      savings = { vsMonthlyHalala, percent };
    }
  }

  return {
    code: doc.code,
    audience: doc.type,
    durationMonths: months,
    durationLabel: durationLabel(months, locale),
    priceHalala: doc.priceHalala,
    effectiveMonthlyHalala,
    savings,
    name: locale === 'ar' ? doc.nameAr : doc.nameEn,
    description: (locale === 'ar' ? doc.descriptionAr : doc.descriptionEn) ?? undefined,
    ctaText: (locale === 'ar' ? doc.ctaTextAr : doc.ctaTextEn) ?? undefined,
    bullets: locale === 'ar' ? (doc.marketingBulletsAr ?? []) : (doc.marketingBulletsEn ?? []),
    isHighlighted: !!doc.isHighlighted,
    displayOrder: doc.displayOrder ?? 0,
    entitlements: (doc.entitlements as EntitlementBag) ?? defaultEntitlementsFor(doc.type),
  };
}

// ── Content fallback ─────────────────────────────────────────────────────

function defaultContentFor(locale: PricingLocale): IPricingPageContent {
  const d = PRICING_PAGE_DEFAULTS[locale];
  return {
    locale,
    hero: d.hero,
    trustStrip: d.trustStrip,
    whyAbjad: d.whyAbjad,
    testimonials: d.testimonials,
    faq: d.faq,
    paymentMethods: d.paymentMethods,
    footerLegal: d.footerLegal,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as IPricingPageContent;
}

// ── Service ──────────────────────────────────────────────────────────────

class PricingPageService {
  async getPayload(localeInput: string | undefined): Promise<PricingPagePayload> {
    const locale = localeFor(localeInput);

    const [contentDoc, planDocs, schoolCount, teacherCount] = await Promise.all([
      PricingPageContent.findOne({ locale }).lean<IPricingPageContent | null>(),
      PricingPlan.find({ isActive: true })
        .sort({ type: 1, displayOrder: 1, durationMonths: 1 })
        .lean<IPricingPlan[]>(),
      User.countDocuments({ role: 'school' }),
      User.countDocuments({ role: 'teacher' }),
    ]);

    const content = contentDoc ?? defaultContentFor(locale);

    // Group plans by audience; identify monthly per audience for savings calc.
    const schoolPlans = planDocs.filter((p) => p.type === 'school');
    const teacherPlans = planDocs.filter((p) => p.type === 'teacher_premium');

    const monthlySchool  = schoolPlans.find((p) => p.durationMonths === 1)?.priceHalala ?? null;
    const monthlyTeacher = teacherPlans.find((p) => p.durationMonths === 1)?.priceHalala ?? null;

    const school = schoolPlans.map((p) => planFromDoc(p, monthlySchool, locale));
    const teacher = teacherPlans.map((p) => planFromDoc(p, monthlyTeacher, locale));

    // Build comparison rows from the school registry — the audience the
    // public pricing page is anchored to.
    const groupLabels = locale === 'ar' ? GROUP_LABELS_AR : GROUP_LABELS_EN;
    const trialColLabel = locale === 'ar' ? 'تجربة مجانية' : 'Free Trial (5 days)';
    const paidColLabel  = locale === 'ar' ? 'باقة مدفوعة' : 'Paid Plan';

    // Pull paid values from the school_monthly plan (any school duration would
    // work since features are identical; monthly is the safest default).
    const paidValuesPlan = schoolPlans.find((p) => p.durationMonths === 1)
                       ?? schoolPlans[0];
    const paidValues = (paidValuesPlan?.entitlements as EntitlementBag | undefined)
                    ?? defaultEntitlementsFor('school');

    const groupedRows = new Map<string, PricingPageComparisonRow[]>();
    for (const entry of ENTITLEMENTS_BY_AUDIENCE['school']) {
      const groupKey = GROUP_FOR_KEY[entry.key] ?? 'support';
      const trialVal = trialValueFor(entry);
      const row: PricingPageComparisonRow = {
        key: entry.key,
        label: entry.name,
        description: entry.description,
        values: [
          describeEntitlement(entry, trialVal, locale),
          describeEntitlement(entry, paidValues[entry.key], locale),
        ],
      };
      const list = groupedRows.get(groupKey) ?? [];
      list.push(row);
      groupedRows.set(groupKey, list);
    }

    const comparisonGroups: PricingPageComparisonGroup[] = [];
    for (const key of ['sourcing', 'screening', 'team', 'support', 'analytics', 'trial']) {
      const rows = groupedRows.get(key);
      if (rows && rows.length > 0) comparisonGroups.push({ label: groupLabels[key] ?? key, rows });
    }

    return {
      locale,
      generatedAt: new Date().toISOString(),
      hero: content.hero,
      trustStrip: {
        schoolCount: content.trustStrip.schoolCountOverride ?? schoolCount,
        teacherCount: content.trustStrip.teacherCountOverride ?? teacherCount,
        logos: content.trustStrip.logos,
      },
      whyAbjad: content.whyAbjad,
      plans: { school, teacher },
      comparison: {
        columns: [trialColLabel, paidColLabel],
        groups: comparisonGroups,
      },
      testimonials: content.testimonials,
      faq: content.faq,
      paymentMethods: content.paymentMethods,
      footerLegal: content.footerLegal,
    };
  }

  // ── Admin surface ──────────────────────────────────────────────────────

  async getContentForAdmin(localeInput: string | undefined): Promise<IPricingPageContent> {
    const locale = localeFor(localeInput);
    const doc = await PricingPageContent.findOne({ locale });
    if (doc) return doc.toObject();
    // Return the defaults shape so admin UI has something to edit.
    return defaultContentFor(locale);
  }

  async upsertContent(
    localeInput: string | undefined,
    payload: Partial<Omit<IPricingPageContent, 'locale' | '_id' | 'createdAt' | 'updatedAt' | 'updatedBy'>>,
    adminUserId: string,
  ): Promise<IPricingPageContent> {
    const locale = localeFor(localeInput);
    const doc = await PricingPageContent.findOneAndUpdate(
      { locale },
      { $set: { ...payload, locale, updatedBy: adminUserId } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return doc.toObject();
  }
}

export const pricingPageService = new PricingPageService();
