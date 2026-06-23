/**
 * Idempotent seed: creates / resets the 15 QA test accounts used in the
 * billing test plan (docs/billing-test-plan.md).
 *
 * All accounts use OTP login — no password needed. On every run the script
 * upserts the User document and wipes any existing billing records so each
 * user starts from the state described below.
 *
 * Usage:
 *   pnpm seed:qa-users
 *
 * After running, log in via /login with the email. The OTP will be printed
 * to the backend terminal (dev mode).
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { config } from '../src/config';
import User from '../src/models/user.model';
import { Subscription } from '../src/models/subscription.model';
import { Invoice } from '../src/models/invoice.model';
import { Payment } from '../src/models/payment.model';
import { LedgerEntry } from '../src/models/ledger-entry.model';

interface QAUser {
  id: string;
  email: string;
  role: 'teacher' | 'school';
  firstName?: string;
  lastName?: string;
  schoolName?: string;
  note: string;
}

const QA_USERS: QAUser[] = [
  // ── Teacher accounts ──────────────────────────────────────────────────
  { id: 'U1',  email: 'teacher.free@abjad.test',        role: 'teacher', firstName: 'Layla',  lastName: 'Al-Rashid',  note: 'No subscription — fresh state' },
  { id: 'U2',  email: 'teacher.trial@abjad.test',       role: 'teacher', firstName: 'Ahmad',  lastName: 'Al-Otaibi',  note: 'Active trial (>2 days) — set trialEndsAt in DB after seeding' },
  { id: 'U3',  email: 'teacher.trial.urgent@abjad.test',role: 'teacher', firstName: 'Sara',   lastName: 'Hassan',     note: 'Trial ≤2 days — set trialEndsAt to tomorrow in DB after seeding' },
  { id: 'U4',  email: 'teacher.monthly@abjad.test',     role: 'teacher', firstName: 'Khalid', lastName: 'Al-Qahtani', note: 'Active Monthly — complete checkout after seeding' },
  { id: 'U5',  email: 'teacher.annual@abjad.test',      role: 'teacher', firstName: 'Nour',   lastName: 'Al-Harbi',   note: 'Active Annual — complete checkout after seeding' },
  { id: 'U6',  email: 'teacher.cancelled@abjad.test',   role: 'teacher', firstName: 'Omar',   lastName: 'Mansour',    note: 'Cancelled — pay then cancel in billing page' },
  { id: 'U7',  email: 'teacher.expired@abjad.test',     role: 'teacher', firstName: 'Fatima', lastName: 'Al-Ghamdi',  note: 'Expired — pay then set currentPeriodEnd to past in DB' },
  { id: 'U8',  email: 'teacher.legacy@abjad.test',      role: 'teacher', firstName: 'Hassan', lastName: 'Al-Zahrani', note: 'Legacy/grandfathered — set legacyAccess=true in DB after seeding' },

  // ── School accounts ───────────────────────────────────────────────────
  { id: 'U9',  email: 'school.free@abjad.test',         role: 'school', schoolName: 'Al-Noor Academy',          note: 'No subscription — fresh state' },
  { id: 'U10', email: 'school.trial@abjad.test',        role: 'school', schoolName: 'Riyadh Future School',     note: 'Active trial — set trialEndsAt in DB after seeding' },
  { id: 'U11', email: 'school.monthly@abjad.test',      role: 'school', schoolName: 'Al-Andalus Institute',     note: 'Active Monthly — complete checkout after seeding' },
  { id: 'U12', email: 'school.annual@abjad.test',       role: 'school', schoolName: 'Tarbiyah International',   note: 'Active Annual — complete checkout after seeding' },
  { id: 'U13', email: 'school.cancelled@abjad.test',    role: 'school', schoolName: 'Atlas Day School',         note: 'Cancelled — pay then cancel after seeding' },
  { id: 'U14', email: 'school.bank@abjad.test',         role: 'school', schoolName: 'Al-Faisal Charter',        note: 'Bank transfer pending — choose Bank Transfer at checkout' },
  { id: 'U15', email: 'school.pastdue@abjad.test',      role: 'school', schoolName: 'Nasr Bilingual School',    note: 'Past due — pay then set status=past_due in DB' },
];

async function upsertUser(u: QAUser): Promise<void> {
  const existing = await User.findOne({ email: u.email });

  if (existing) {
    // Reset role + name fields; wipe billing state
    existing.role       = u.role;
    existing.firstName  = u.firstName;
    existing.lastName   = u.lastName;
    existing.schoolName = u.schoolName;
    existing.status     = 'active';
    existing.legacyAccess    = false;
    existing.trialStartedAt  = undefined;
    existing.trialEndsAt     = undefined;
    await existing.save();

    // Wipe billing records
    await Promise.all([
      Subscription.deleteMany({ ownerId: existing._id }),
      Invoice.deleteMany({ ownerId: existing._id }),
      LedgerEntry.deleteMany({ ownerId: existing._id }),
    ]);
    console.log(`  ↺  ${u.id.padEnd(4)} ${u.email.padEnd(42)} role=${u.role}`);
  } else {
    await User.create({
      email:       u.email,
      role:        u.role,
      firstName:   u.firstName,
      lastName:    u.lastName,
      schoolName:  u.schoolName,
      status:      'active',
      isEmailVerified:   true,
      isProfileComplete: false,
      profileStep:       'basic',
      legacyAccess: false,
    });
    console.log(`  ✓  ${u.id.padEnd(4)} ${u.email.padEnd(42)} role=${u.role}  (created)`);
  }
}

async function run() {
  if (process.env['NODE_ENV'] === 'production' && !process.argv.includes('--allow-prod')) {
    console.error('Refusing to seed prod without --allow-prod flag');
    process.exit(1);
  }

  await mongoose.connect(config.mongodb.uri);
  console.log('Connected.\n');
  console.log('Seeding QA test users…\n');

  for (const u of QA_USERS) {
    await upsertUser(u);
  }

  console.log('\n─────────────────────────────────────────────────────────────────');
  console.log('All QA users ready. Notes for manual DB steps after seeding:\n');
  for (const u of QA_USERS) {
    if (u.note.includes('DB')) {
      console.log(`  ${u.id.padEnd(4)} ${u.email}`);
      console.log(`        → ${u.note}\n`);
    }
  }
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('\nTo log in: go to /login, enter any of the emails above.');
  console.log('OTP will be printed to the backend terminal.\n');

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
