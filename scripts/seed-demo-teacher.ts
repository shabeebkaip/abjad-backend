/**
 * Idempotent demo teacher — used for clicking through the subscription flow.
 * Creates (or refreshes) a teacher with predictable credentials:
 *
 *   email:    demo.teacher@abjad.dev
 *   password: demo@123#
 *
 * Cleans up any prior subscription / invoices / payments for the teacher so
 * the demo always starts from a fresh "no subscription" state.
 *
 * Usage:
 *   pnpm seed:demo-teacher
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { config } from '../src/config';
import User from '../src/models/user.model';
import { Subscription } from '../src/models/subscription.model';
import { Invoice } from '../src/models/invoice.model';
import { Payment } from '../src/models/payment.model';
import { LedgerEntry } from '../src/models/ledger-entry.model';

const DEMO_EMAIL = 'demo.teacher@abjad.dev';
const DEMO_PASSWORD = 'demo@123#';

async function run() {
  if (process.env['NODE_ENV'] === 'production' && process.argv.indexOf('--allow-prod') === -1) {
    console.error('Refusing to seed prod without --allow-prod flag');
    process.exit(1);
  }

  await mongoose.connect(config.mongodb.uri);
  console.log('Connected.\n');

  let user = await User.findOne({ email: DEMO_EMAIL });
  if (!user) {
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
    user = await User.create({
      email: DEMO_EMAIL,
      password: hash,
      role: 'teacher',
      firstName: 'Demo',
      lastName: 'Teacher',
      isEmailVerified: true,
      status: 'active',
    });
    console.log(`✓ created teacher ${DEMO_EMAIL}`);
  } else {
    // Refresh password + clear legacy access flag so the paywall actually fires.
    user.password = await bcrypt.hash(DEMO_PASSWORD, 10);
    user.legacyAccess = false;
    user.trialStartedAt = undefined;
    user.trialEndsAt = undefined;
    await user.save();
    console.log(`✓ refreshed existing teacher ${DEMO_EMAIL}`);
  }

  // Sweep any prior billing artefacts so the demo starts clean.
  const [subs, invs, ledg] = await Promise.all([
    Subscription.deleteMany({ ownerId: user._id }),
    Invoice.deleteMany({ ownerId: user._id }),
    LedgerEntry.deleteMany({ ownerId: user._id }),
  ]);
  // Payments link via invoiceId — find by buyer email instead since the
  // invoice docs are already gone.
  const pays = await Payment.deleteMany({ invoiceId: { $exists: false } });

  console.log(`✓ cleared ${subs.deletedCount} subscriptions, ${invs.deletedCount} invoices, ${pays.deletedCount} orphan payments, ${ledg.deletedCount} ledger entries`);

  console.log('\nDemo teacher ready.');
  console.log('────────────────────────────────────────');
  console.log(`Email:    ${DEMO_EMAIL}`);
  console.log(`Password: ${DEMO_PASSWORD}`);
  console.log(`Role:     teacher`);
  console.log(`User id:  ${user._id.toString()}`);
  console.log('────────────────────────────────────────');

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
