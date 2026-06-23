/**
 * Idempotent seed for Abjad subscription pricing plans (SSD v1.0 §1.3 + §2.1).
 *
 * Usage:
 *   pnpm exec ts-node scripts/seed-pricing-plans.ts
 *
 * Re-running is safe — each plan is upserted by `code`. To update a price, edit
 * the table below and re-run; existing subscriptions keep their snapshotted
 * pricePerPeriodHalala (in subscription.model.ts) so historical contracts stay valid.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { config } from '../src/config';
import { PricingPlan, PlanCode } from '../src/models/pricing-plan.model';
import { sarToHalala } from '../src/utils/money.util';
import { defaultEntitlementsFor } from '../src/utils/entitlement-registry';

interface SeedPlan {
  code: PlanCode;
  type: 'school' | 'teacher_premium';
  durationMonths: 1 | 6 | 12;
  priceSAR: number;     // excl. VAT
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  displayOrder: number;
  isHighlighted: boolean;
  marketingBulletsEn: string[];
  marketingBulletsAr: string[];
}

const PLANS: SeedPlan[] = [
  // ── School plan — 3 durations (SSD §2.1) ─────────────────────────
  {
    code: 'school_monthly', type: 'school', durationMonths: 1,
    priceSAR: 1300,
    nameEn: 'School Plan — Monthly',
    nameAr: 'باقة المدرسة — شهرية',
    descriptionEn: 'Full platform access month by month — no long-term commitment.',
    descriptionAr: 'وصول كامل للمنصة شهراً بشهر — بدون التزام طويل الأمد.',
    displayOrder: 1,
    isHighlighted: false,
    marketingBulletsEn: [
      'Unlimited job postings — no cap on active listings',
      'Full access to the teacher database with advanced search filters',
      'AI-powered candidate matching and ranked recommendations per job',
      'Bulk candidate export to PDF for team review',
      'Interview scheduling, calendar management, and feedback tools',
      'Team access — invite Admin, Recruiter, Interviewer, and Viewer roles',
      'Dedicated school profile page visible to all teachers on the platform',
      'Priority support — responses within 24 hours',
    ],
    marketingBulletsAr: [
      'إعلانات وظائف غير محدودة — لا حد أقصى على القوائم النشطة',
      'وصول كامل لقاعدة بيانات المعلمين مع فلاتر بحث متقدمة',
      'مطابقة مرشحين بالذكاء الاصطناعي وتوصيات مرتبة لكل وظيفة',
      'تصدير مجمّع للمرشحين إلى PDF لمراجعة الفريق',
      'جدولة المقابلات وإدارة التقويم وأدوات التغذية الراجعة',
      'وصول الفريق — دعوة أدوار الإدارة والمجنّد والمحاور والمشاهد',
      'صفحة ملف مدرسة مخصصة مرئية لجميع المعلمين على المنصة',
      'دعم بأولوية — ردود خلال 24 ساعة',
    ],
  },
  {
    code: 'school_6month', type: 'school', durationMonths: 6,
    priceSAR: 7300,
    nameEn: 'School Plan — 6 Months',
    nameAr: 'باقة المدرسة — 6 أشهر',
    descriptionEn: 'Six months of full access at a reduced rate — ideal for a full hiring season.',
    descriptionAr: 'ستة أشهر من الوصول الكامل بسعر مخفض — مثالي لموسم توظيف كامل.',
    displayOrder: 2,
    isHighlighted: false,
    marketingBulletsEn: [
      'Unlimited job postings — no cap on active listings',
      'Full access to the teacher database with advanced search filters',
      'AI-powered candidate matching and ranked recommendations per job',
      'Bulk candidate export to PDF for team review',
      'Interview scheduling, calendar management, and feedback tools',
      'Team access — invite Admin, Recruiter, Interviewer, and Viewer roles',
      'Dedicated school profile page visible to all teachers on the platform',
      'Priority support — responses within 24 hours',
      'Save vs monthly — locked-in rate for the full 6 months',
    ],
    marketingBulletsAr: [
      'إعلانات وظائف غير محدودة — لا حد أقصى على القوائم النشطة',
      'وصول كامل لقاعدة بيانات المعلمين مع فلاتر بحث متقدمة',
      'مطابقة مرشحين بالذكاء الاصطناعي وتوصيات مرتبة لكل وظيفة',
      'تصدير مجمّع للمرشحين إلى PDF لمراجعة الفريق',
      'جدولة المقابلات وإدارة التقويم وأدوات التغذية الراجعة',
      'وصول الفريق — دعوة أدوار الإدارة والمجنّد والمحاور والمشاهد',
      'صفحة ملف مدرسة مخصصة مرئية لجميع المعلمين على المنصة',
      'دعم بأولوية — ردود خلال 24 ساعة',
      'توفير مقارنةً بالشهري — سعر مثبّت طوال 6 أشهر',
    ],
  },
  {
    code: 'school_annual', type: 'school', durationMonths: 12,
    priceSAR: 13000,
    nameEn: 'School Plan — Annual',
    nameAr: 'باقة المدرسة — سنوية',
    descriptionEn: 'Best value for schools — full year of hiring at the lowest monthly cost.',
    descriptionAr: 'أفضل قيمة للمدارس — سنة كاملة من التوظيف بأقل تكلفة شهرية.',
    displayOrder: 3,
    isHighlighted: true,
    marketingBulletsEn: [
      'Unlimited job postings — no cap on active listings',
      'Full access to the teacher database with advanced search filters',
      'AI-powered candidate matching and ranked recommendations per job',
      'Bulk candidate export to PDF for team review',
      'Interview scheduling, calendar management, and feedback tools',
      'Team access — invite Admin, Recruiter, Interviewer, and Viewer roles',
      'Dedicated school profile page visible to all teachers on the platform',
      'Priority support — responses within 24 hours',
      'Best value — lowest monthly cost, billed once a year',
    ],
    marketingBulletsAr: [
      'إعلانات وظائف غير محدودة — لا حد أقصى على القوائم النشطة',
      'وصول كامل لقاعدة بيانات المعلمين مع فلاتر بحث متقدمة',
      'مطابقة مرشحين بالذكاء الاصطناعي وتوصيات مرتبة لكل وظيفة',
      'تصدير مجمّع للمرشحين إلى PDF لمراجعة الفريق',
      'جدولة المقابلات وإدارة التقويم وأدوات التغذية الراجعة',
      'وصول الفريق — دعوة أدوار الإدارة والمجنّد والمحاور والمشاهد',
      'صفحة ملف مدرسة مخصصة مرئية لجميع المعلمين على المنصة',
      'دعم بأولوية — ردود خلال 24 ساعة',
      'أفضل قيمة — أقل تكلفة شهرية، يُفوتر مرة واحدة سنوياً',
    ],
  },

  // ── Teacher Premium — 3 durations (SSD §1.3) ─────────────────────
  {
    code: 'teacher_premium_monthly', type: 'teacher_premium', durationMonths: 1,
    priceSAR: 60,
    nameEn: 'Premium Teacher — Monthly',
    nameAr: 'معلم مميز — شهري',
    descriptionEn: 'Start with a monthly commitment — upgrade or cancel anytime.',
    descriptionAr: 'ابدأ بالتزام شهري — يمكنك الترقية أو الإلغاء في أي وقت.',
    displayOrder: 1,
    isHighlighted: false,
    marketingBulletsEn: [
      'Priority placement in school searches — appear before non-premium teachers',
      'Verified Premium Teacher badge on your public profile',
      'Up to 3× more profile views from actively hiring schools',
      'Get shortlisted and contacted faster by schools',
      'Access to all application tools and interview management',
      'Priority support — responses within 24 hours',
      'Cancel anytime — no long-term commitment',
    ],
    marketingBulletsAr: [
      'ظهور أولوي في نتائج بحث المدارس — تظهر قبل المعلمين غير المميزين',
      'شارة معلم مميز موثّقة على ملفك الشخصي العام',
      'ما يصل إلى 3× مشاهدات أكثر لملفك من المدارس الناشطة',
      'يتم اختيارك والتواصل معك بشكل أسرع من المدارس',
      'وصول كامل لأدوات التقديم وإدارة المقابلات',
      'دعم بأولوية — ردود خلال 24 ساعة',
      'إلغاء في أي وقت — لا التزام طويل الأمد',
    ],
  },
  {
    code: 'teacher_premium_6month', type: 'teacher_premium', durationMonths: 6,
    priceSAR: 300,
    nameEn: 'Premium Teacher — 6 Months',
    nameAr: 'معلم مميز — 6 أشهر',
    descriptionEn: 'Commit for 6 months and save compared to paying monthly.',
    descriptionAr: 'التزم لمدة 6 أشهر ووفّر مقارنةً بالدفع شهرياً.',
    displayOrder: 2,
    isHighlighted: false,
    marketingBulletsEn: [
      'Priority placement in school searches — appear before non-premium teachers',
      'Verified Premium Teacher badge on your public profile',
      'Up to 3× more profile views from actively hiring schools',
      'Get shortlisted and contacted faster by schools',
      'Access to all application tools and interview management',
      'Priority support — responses within 24 hours',
      'Save vs monthly — locked-in price for 6 months',
    ],
    marketingBulletsAr: [
      'ظهور أولوي في نتائج بحث المدارس — تظهر قبل المعلمين غير المميزين',
      'شارة معلم مميز موثّقة على ملفك الشخصي العام',
      'ما يصل إلى 3× مشاهدات أكثر لملفك من المدارس الناشطة',
      'يتم اختيارك والتواصل معك بشكل أسرع من المدارس',
      'وصول كامل لأدوات التقديم وإدارة المقابلات',
      'دعم بأولوية — ردود خلال 24 ساعة',
      'توفير مقارنةً بالشهري — سعر مثبّت لمدة 6 أشهر',
    ],
  },
  {
    code: 'teacher_premium_annual', type: 'teacher_premium', durationMonths: 12,
    priceSAR: 480,
    nameEn: 'Premium Teacher — Annual',
    nameAr: 'معلم مميز — سنوي',
    descriptionEn: 'Best value — get the full year at the lowest monthly rate.',
    descriptionAr: 'أفضل قيمة — احصل على السنة الكاملة بأقل سعر شهري.',
    displayOrder: 3,
    isHighlighted: true,
    marketingBulletsEn: [
      'Priority placement in school searches — appear before non-premium teachers',
      'Verified Premium Teacher badge on your public profile',
      'Up to 3× more profile views from actively hiring schools',
      'Get shortlisted and contacted faster by schools',
      'Access to all application tools and interview management',
      'Priority support — responses within 24 hours',
      'Best value — lowest price per month, billed once a year',
    ],
    marketingBulletsAr: [
      'ظهور أولوي في نتائج بحث المدارس — تظهر قبل المعلمين غير المميزين',
      'شارة معلم مميز موثّقة على ملفك الشخصي العام',
      'ما يصل إلى 3× مشاهدات أكثر لملفك من المدارس الناشطة',
      'يتم اختيارك والتواصل معك بشكل أسرع من المدارس',
      'وصول كامل لأدوات التقديم وإدارة المقابلات',
      'دعم بأولوية — ردود خلال 24 ساعة',
      'أفضل قيمة — أقل سعر شهري، يُفوتر مرة واحدة سنوياً',
    ],
  },
];

async function run() {
  if (process.env.NODE_ENV === 'production' && process.argv.indexOf('--allow-prod') === -1) {
    console.error('Refusing to seed prod without --allow-prod flag');
    process.exit(1);
  }

  await mongoose.connect(config.mongodb.uri);
  console.log('Connected to', config.mongodb.uri);

  let created = 0;
  let updated = 0;
  for (const plan of PLANS) {
    const existing = await PricingPlan.findOne({ code: plan.code });
    const priceHalala = sarToHalala(plan.priceSAR);
    if (existing) {
      const bulletsEmpty = !existing.marketingBulletsEn?.length;
      const changed =
        existing.priceHalala !== priceHalala ||
        existing.nameEn !== plan.nameEn ||
        existing.nameAr !== plan.nameAr ||
        existing.durationMonths !== plan.durationMonths ||
        existing.type !== plan.type ||
        bulletsEmpty;
      if (changed) {
        existing.priceHalala = priceHalala;
        existing.nameEn = plan.nameEn;
        existing.nameAr = plan.nameAr;
        existing.durationMonths = plan.durationMonths;
        existing.type = plan.type;
        existing.displayOrder = plan.displayOrder;
        existing.isHighlighted = plan.isHighlighted;
        existing.descriptionEn = plan.descriptionEn;
        existing.descriptionAr = plan.descriptionAr;
        // Only backfill bullets when empty so admin edits are preserved.
        if (bulletsEmpty) {
          existing.marketingBulletsEn = plan.marketingBulletsEn;
          existing.marketingBulletsAr = plan.marketingBulletsAr;
        }
        await existing.save();
        updated++;
        console.log(`updated  ${plan.code.padEnd(28)} ${plan.priceSAR} SAR${bulletsEmpty ? ' (bullets backfilled)' : ''}`);
      } else {
        console.log(`unchanged ${plan.code.padEnd(28)} ${plan.priceSAR} SAR`);
      }
    } else {
      await PricingPlan.create({
        code: plan.code,
        type: plan.type,
        durationMonths: plan.durationMonths,
        priceHalala,
        nameEn: plan.nameEn,
        nameAr: plan.nameAr,
        descriptionEn: plan.descriptionEn,
        descriptionAr: plan.descriptionAr,
        isActive: true,
        effectiveFrom: new Date(),
        entitlements: defaultEntitlementsFor(plan.type),
        marketingBulletsEn: plan.marketingBulletsEn,
        marketingBulletsAr: plan.marketingBulletsAr,
        displayOrder: plan.displayOrder,
        isHighlighted: plan.isHighlighted,
      });
      created++;
      console.log(`created  ${plan.code.padEnd(28)} ${plan.priceSAR} SAR`);
    }
  }

  // Backfill: any existing plans missing the entitlements bag get the
  // audience default. Idempotent and only writes when truly missing.
  const missingEntitlements = await PricingPlan.find({
    $or: [
      { entitlements: { $exists: false } },
      { entitlements: null },
      { entitlements: {} },
    ],
  });
  for (const p of missingEntitlements) {
    p.entitlements = defaultEntitlementsFor(p.type);
    await p.save();
    console.log(`backfilled entitlements on ${p.code}`);
  }

  console.log(`\nDone. created=${created} updated=${updated} total=${PLANS.length}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
