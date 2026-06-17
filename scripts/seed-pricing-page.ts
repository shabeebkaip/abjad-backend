/**
 * Idempotent seed: PricingPageContent documents for `en` and `ar`.
 *
 * On a fresh DB the public /pricing page falls back to the defaults in
 * `src/utils/pricing-page-defaults.ts`. This seed materialises those
 * defaults into actual rows so the admin editor (`/admin/pricing-page`)
 * has something to edit on first load.
 *
 * Usage:
 *   pnpm seed:pricing-page                 # populate / no-op if exists
 *   pnpm seed:pricing-page --force         # overwrite existing rows
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { config } from '../src/config';
import { PricingPageContent } from '../src/models/pricing-page-content.model';
import { PRICING_PAGE_DEFAULTS } from '../src/utils/pricing-page-defaults';

async function run() {
  if (process.env.NODE_ENV === 'production' && process.argv.indexOf('--allow-prod') === -1) {
    console.error('Refusing to seed prod without --allow-prod flag');
    process.exit(1);
  }

  const force = process.argv.includes('--force');

  await mongoose.connect(config.mongodb.uri);
  console.log('Connected to', config.mongodb.uri.replace(/:[^@]+@/, ':***@'));

  let created = 0;
  let skipped = 0;
  let overwritten = 0;

  for (const locale of ['en', 'ar'] as const) {
    const existing = await PricingPageContent.findOne({ locale });
    const defaults = PRICING_PAGE_DEFAULTS[locale];

    if (existing && !force) {
      skipped++;
      console.log(`skipped ${locale} (already exists; pass --force to overwrite)`);
      continue;
    }

    const payload = {
      locale,
      hero: defaults.hero,
      trustStrip: defaults.trustStrip,
      whyAbjad: defaults.whyAbjad,
      testimonials: defaults.testimonials,
      faq: defaults.faq,
      paymentMethods: defaults.paymentMethods,
      footerLegal: defaults.footerLegal,
    };

    if (existing) {
      Object.assign(existing, payload);
      await existing.save();
      overwritten++;
      console.log(`overwrote ${locale}`);
    } else {
      await PricingPageContent.create(payload);
      created++;
      console.log(`created  ${locale}`);
    }
  }

  console.log(`\nDone. created=${created} overwritten=${overwritten} skipped=${skipped}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
