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

interface SeedPlan {
  code: PlanCode;
  type: 'school' | 'teacher_premium';
  durationMonths: 1 | 6 | 12;
  priceSAR: number;     // excl. VAT
  nameEn: string;
  nameAr: string;
}

const PLANS: SeedPlan[] = [
  // ── School plan — 3 durations (SSD §2.1) ─────────────────────────
  { code: 'school_monthly', type: 'school', durationMonths: 1,
    priceSAR: 1300,
    nameEn: 'School Plan — Monthly',
    nameAr: 'باقة المدرسة — شهرية' },
  { code: 'school_6month',  type: 'school', durationMonths: 6,
    priceSAR: 7300,
    nameEn: 'School Plan — 6 Months',
    nameAr: 'باقة المدرسة — 6 أشهر' },
  { code: 'school_annual',  type: 'school', durationMonths: 12,
    priceSAR: 13000,
    nameEn: 'School Plan — Annual',
    nameAr: 'باقة المدرسة — سنوية' },

  // ── Teacher Premium — 3 durations (SSD §1.3) ─────────────────────
  { code: 'teacher_premium_monthly', type: 'teacher_premium', durationMonths: 1,
    priceSAR: 60,
    nameEn: 'Premium Teacher — Monthly',
    nameAr: 'معلم مميز — شهري' },
  { code: 'teacher_premium_6month',  type: 'teacher_premium', durationMonths: 6,
    priceSAR: 300,
    nameEn: 'Premium Teacher — 6 Months',
    nameAr: 'معلم مميز — 6 أشهر' },
  { code: 'teacher_premium_annual',  type: 'teacher_premium', durationMonths: 12,
    priceSAR: 480,
    nameEn: 'Premium Teacher — Annual',
    nameAr: 'معلم مميز — سنوي' },
];

async function run() {
  if (process.env.NODE_ENV === 'production' && process.argv.indexOf('--allow-prod') === -1) {
    console.error('Refusing to seed prod without --allow-prod flag');
    process.exit(1);
  }

  await mongoose.connect(config.mongodbUri);
  console.log('Connected to', config.mongodbUri);

  let created = 0;
  let updated = 0;
  for (const plan of PLANS) {
    const existing = await PricingPlan.findOne({ code: plan.code });
    const priceHalala = sarToHalala(plan.priceSAR);
    if (existing) {
      const changed =
        existing.priceHalala !== priceHalala ||
        existing.nameEn !== plan.nameEn ||
        existing.nameAr !== plan.nameAr ||
        existing.durationMonths !== plan.durationMonths ||
        existing.type !== plan.type;
      if (changed) {
        existing.priceHalala = priceHalala;
        existing.nameEn = plan.nameEn;
        existing.nameAr = plan.nameAr;
        existing.durationMonths = plan.durationMonths;
        existing.type = plan.type;
        await existing.save();
        updated++;
        console.log(`updated  ${plan.code.padEnd(28)} ${plan.priceSAR} SAR`);
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
        isActive: true,
        effectiveFrom: new Date(),
      });
      created++;
      console.log(`created  ${plan.code.padEnd(28)} ${plan.priceSAR} SAR`);
    }
  }

  console.log(`\nDone. created=${created} updated=${updated} total=${PLANS.length}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
