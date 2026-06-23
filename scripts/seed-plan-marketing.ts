/**
 * Seeds marketing copy (description + feature bullets) for all 6 pricing plans.
 *
 * Usage:
 *   pnpm exec ts-node scripts/seed-plan-marketing.ts
 *
 * Re-running is safe — each plan is updated by code. Bullets are replaced, not appended.
 * If you want to reset to these defaults after an admin edit, re-run the script.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { config } from '../src/config';
import { PricingPlan } from '../src/models/pricing-plan.model';

interface PlanMarketing {
  code: string;
  displayOrder: number;
  isHighlighted: boolean;
  descriptionEn: string;
  descriptionAr: string;
  marketingBulletsEn: string[];
  marketingBulletsAr: string[];
}

const MARKETING: PlanMarketing[] = [
  // ── Teacher Premium ───────────────────────────────────────────────────────

  {
    code: 'teacher_premium_monthly',
    displayOrder: 1,
    isHighlighted: false,
    descriptionEn: 'Start with a monthly commitment — upgrade or cancel anytime.',
    descriptionAr: 'ابدأ بالتزام شهري — يمكنك الترقية أو الإلغاء في أي وقت.',
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
    code: 'teacher_premium_6month',
    displayOrder: 2,
    isHighlighted: false,
    descriptionEn: 'Commit for 6 months and save compared to paying monthly.',
    descriptionAr: 'التزم لمدة 6 أشهر ووفّر مقارنةً بالدفع شهرياً.',
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
    code: 'teacher_premium_annual',
    displayOrder: 3,
    isHighlighted: true, // Most Popular
    descriptionEn: 'Best value — get the full year at the lowest monthly rate.',
    descriptionAr: 'أفضل قيمة — احصل على السنة الكاملة بأقل سعر شهري.',
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

  // ── School Plans ──────────────────────────────────────────────────────────

  {
    code: 'school_monthly',
    displayOrder: 1,
    isHighlighted: false,
    descriptionEn: 'Full platform access month by month — no long-term commitment.',
    descriptionAr: 'وصول كامل للمنصة شهراً بشهر — بدون التزام طويل الأمد.',
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
    code: 'school_6month',
    displayOrder: 2,
    isHighlighted: false,
    descriptionEn: 'Six months of full access at a reduced rate — ideal for a full hiring season.',
    descriptionAr: 'ستة أشهر من الوصول الكامل بسعر مخفض — مثالي لموسم توظيف كامل.',
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
    code: 'school_annual',
    displayOrder: 3,
    isHighlighted: true, // Most Popular
    descriptionEn: 'Best value for schools — full year of hiring at the lowest monthly cost.',
    descriptionAr: 'أفضل قيمة للمدارس — سنة كاملة من التوظيف بأقل تكلفة شهرية.',
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
];

async function run() {
  await mongoose.connect(config.mongodb.uri);
  console.log('Connected to', config.mongodb.uri);

  for (const m of MARKETING) {
    const plan = await PricingPlan.findOne({ code: m.code });
    if (!plan) {
      console.warn(`⚠️  Plan not found: ${m.code} — skipping`);
      continue;
    }

    plan.displayOrder       = m.displayOrder;
    plan.isHighlighted      = m.isHighlighted;
    plan.descriptionEn      = m.descriptionEn;
    plan.descriptionAr      = m.descriptionAr;
    plan.marketingBulletsEn = m.marketingBulletsEn;
    plan.marketingBulletsAr = m.marketingBulletsAr;
    await plan.save();

    console.log(`✅  ${m.code.padEnd(30)} ${m.isHighlighted ? '⭐ highlighted' : ''}`);
  }

  console.log('\nDone. All plan marketing copy seeded.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
