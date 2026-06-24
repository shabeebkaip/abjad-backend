/**
 * Seeds marketingBulletsEn / marketingBulletsAr on all PricingPlan docs.
 *
 * Safe to re-run — only touches bullet fields, never prices or entitlements.
 * Teacher plans are skipped if bullets already exist (won't overwrite
 * anything set via the admin editor). School plans are always written so
 * this script fixes the empty-bullets bug on the school plans page.
 *
 * Usage:
 *   pnpm seed:bullets
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { config } from '../src/config';
import { PricingPlan } from '../src/models/pricing-plan.model';

// ── School plans ──────────────────────────────────────────────────────────
const SCHOOL_EN = [
  'Post unlimited job listings',
  'Search verified teacher profiles',
  'AI-powered "Best Match" candidate ranking',
  'Full application pipeline management',
  'Interview scheduling & coordination',
  'Shortlist folders & candidate tracking',
  'Team accounts with role-based permissions',
  'Analytics & hiring performance reports',
  'Bulk candidate export to PDF',
  'Priority customer support',
  'ZATCA-compliant invoices',
];

const SCHOOL_AR = [
  'نشر إعلانات وظيفية غير محدودة',
  'البحث في قاعدة المعلمين المعتمدين',
  'ترتيب الأنسب بالذكاء الاصطناعي',
  'إدارة مسار الطلبات بالكامل',
  'جدولة المقابلات وتنسيقها',
  'قوائم المرشحين المفضلين والتتبع',
  'حسابات الفريق مع صلاحيات الأدوار',
  'تحليلات وتقارير التوظيف',
  'تصدير المرشحين مجمعاً (PDF)',
  'دعم ذو أولوية',
  'فواتير متوافقة مع هيئة الزكاة',
];

// ── Teacher Premium plans ─────────────────────────────────────────────────
const TEACHER_EN = [
  'Priority placement in school searches',
  'Premium Teacher badge on your profile',
  'Unlimited job applications',
  'CV visible to all verified schools',
  'Monthly job-match alerts',
  'Early access to new job postings',
  'Dedicated premium support',
  'ZATCA-compliant invoices',
];

const TEACHER_AR = [
  'ظهور أولوي في بحث المدارس',
  'شارة معلم مميز على ملفك الشخصي',
  'تقديم غير محدود على الوظائف',
  'سيرتك الذاتية ظاهرة لجميع المدارس المعتمدة',
  'تنبيهات شهرية بالوظائف المناسبة',
  'وصول مبكر للوظائف الجديدة',
  'دعم مميز متخصص',
  'فواتير متوافقة مع هيئة الزكاة',
];

async function run() {
  if (process.env['NODE_ENV'] === 'production' && !process.argv.includes('--allow-prod')) {
    console.error('Refusing to seed prod without --allow-prod flag');
    process.exit(1);
  }

  await mongoose.connect(config.mongodb.uri);
  console.log('Connected.\n');

  const plans = await PricingPlan.find({});
  let updated = 0;
  let skipped = 0;

  for (const plan of plans) {
    const isSchool   = plan.type === 'school';
    const isTeacher  = plan.type === 'teacher_premium';

    // Teacher: skip if bullets already set (preserve admin-edited copy)
    if (isTeacher && plan.marketingBulletsEn?.length) {
      console.log(`  –  ${plan.code.padEnd(30)} (teacher — already has bullets, skipping)`);
      skipped++;
      continue;
    }

    plan.marketingBulletsEn = isSchool ? SCHOOL_EN : TEACHER_EN;
    plan.marketingBulletsAr = isSchool ? SCHOOL_AR : TEACHER_AR;
    await plan.save();
    console.log(`  ✓  ${plan.code}`);
    updated++;
  }

  console.log(`\nDone. updated=${updated} skipped=${skipped}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
