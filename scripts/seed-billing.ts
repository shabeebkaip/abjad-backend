/**
 * Idempotent dev seed: subscriptions, invoices, payments, and ledger entries.
 *
 * Creates demo schools + teachers tagged with `demo+billing-*@abjad.dev`
 * emails and spins up enough billing records that /billing/subscriptions,
 * /billing/invoices, /billing/payments, and /billing/ledger/[ownerId] all
 * have something to look at.
 *
 * Idempotency: every demo user is upserted by email; every Subscription /
 * Invoice / Payment / LedgerEntry record is upserted by a stable tag we
 * store in the model's free-form fields (notes / cancellationReason /
 * bankReference). Re-running tweaks the records in place rather than
 * duplicating them.
 *
 * Usage:
 *   pnpm seed:billing               # populate
 *   pnpm seed:billing --clear       # wipe all demo records first
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { config } from '../src/config';
import User from '../src/models/user.model';
import { PricingPlan } from '../src/models/pricing-plan.model';
import { Subscription, SubscriptionStatus } from '../src/models/subscription.model';
import { Invoice, InvoiceStatus, InvoicePaymentMethod } from '../src/models/invoice.model';
import { Payment, PaymentStatus, PaymentMethod } from '../src/models/payment.model';
import { LedgerEntry } from '../src/models/ledger-entry.model';
import { Counter } from '../src/models/counter.model';
import { breakdownFromSubtotal, halalaToSAR } from '../src/utils/money.util';
import { toHijriString } from '../src/utils/hijri.util';
import { nextInvoiceNumber } from '../src/utils/invoice-number.util';

// ── Demo identities ──────────────────────────────────────────────────────

interface DemoUser {
  tag: string;                                    // appears in email + notes
  role: 'school' | 'teacher';
  email: string;
  passwordPlain: string;
  schoolName?: string;
  firstName?: string;
  lastName?: string;
}

const DEMO_SCHOOLS: DemoUser[] = [
  { tag: 'school-trialing',  role: 'school', email: 'demo+billing-school-trialing@abjad.dev',  passwordPlain: 'demo@123#', schoolName: 'Al-Andalus Trial School' },
  { tag: 'school-active-m',  role: 'school', email: 'demo+billing-school-active-m@abjad.dev',  passwordPlain: 'demo@123#', schoolName: 'Future Academy (Monthly)' },
  { tag: 'school-active-6',  role: 'school', email: 'demo+billing-school-active-6@abjad.dev',  passwordPlain: 'demo@123#', schoolName: 'Tarbiyah International (6mo)' },
  { tag: 'school-active-y',  role: 'school', email: 'demo+billing-school-active-y@abjad.dev',  passwordPlain: 'demo@123#', schoolName: 'Riyadh Heritage (Annual)' },
  { tag: 'school-past-due',  role: 'school', email: 'demo+billing-school-past-due@abjad.dev',  passwordPlain: 'demo@123#', schoolName: 'Al-Faisal Charter' },
  { tag: 'school-cancelled', role: 'school', email: 'demo+billing-school-cancelled@abjad.dev', passwordPlain: 'demo@123#', schoolName: 'Atlas Day School' },
  { tag: 'school-refunded',  role: 'school', email: 'demo+billing-school-refunded@abjad.dev',  passwordPlain: 'demo@123#', schoolName: 'Nasr Bilingual' },
];

const DEMO_TEACHERS: DemoUser[] = [
  { tag: 'teacher-active-m', role: 'teacher', email: 'demo+billing-teacher-active-m@abjad.dev', passwordPlain: 'demo@123#', firstName: 'Sara',  lastName: 'Al-Qahtani' },
  { tag: 'teacher-active-6', role: 'teacher', email: 'demo+billing-teacher-active-6@abjad.dev', passwordPlain: 'demo@123#', firstName: 'Khalid', lastName: 'Al-Otaibi' },
  { tag: 'teacher-active-y', role: 'teacher', email: 'demo+billing-teacher-active-y@abjad.dev', passwordPlain: 'demo@123#', firstName: 'Layla',  lastName: 'Hassan' },
  { tag: 'teacher-expired',  role: 'teacher', email: 'demo+billing-teacher-expired@abjad.dev',  passwordPlain: 'demo@123#', firstName: 'Omar',   lastName: 'Mansour' },
];

const ALL_DEMO_USERS = [...DEMO_SCHOOLS, ...DEMO_TEACHERS];
const DEMO_TAG_PREFIX = 'demo+billing-';

// Stable note prefix so we can identify our seed records on re-run / clear.
const SEED_NOTE = '[billing-seed]';

// ── Scenario shape ───────────────────────────────────────────────────────

interface ScenarioBase {
  userTag: string;
  planCode: string;
  status: SubscriptionStatus;
  // Where in the period we are — used to set currentPeriodStart/End relative to today.
  periodOffset: { startDaysAgo: number; endDaysFromNow: number };
  cancelAtPeriodEnd?: boolean;
  cancellationReason?: string;
  // Trial only
  trialEndsAt?: Date;
  // Invoices to create for this subscription. Each gets matching payments + ledger.
  invoices: Array<{
    status: InvoiceStatus;
    method?: InvoicePaymentMethod;
    issuedDaysAgo: number;
    paidDaysAgo?: number;        // when status === 'paid'
    payment?: {
      status: PaymentStatus;
      method: PaymentMethod;
      failureReason?: string;
      refundedNote?: string;
    };
  }>;
}

const today = () => new Date();
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000);

const SCENARIOS: ScenarioBase[] = [
  // 1. Active school trial — pending invoice waiting for conversion.
  {
    userTag: 'school-trialing',
    planCode: 'school_monthly',
    status: 'trialing',
    periodOffset: { startDaysAgo: 2, endDaysFromNow: 28 },
    trialEndsAt: daysFromNow(3),
    invoices: [
      { status: 'pending', method: 'bank_transfer', issuedDaysAgo: 2 },
    ],
  },

  // 2. Active monthly — paid via mada.
  {
    userTag: 'school-active-m',
    planCode: 'school_monthly',
    status: 'active',
    periodOffset: { startDaysAgo: 5, endDaysFromNow: 25 },
    invoices: [
      {
        status: 'paid', method: 'mada', issuedDaysAgo: 5, paidDaysAgo: 5,
        payment: { status: 'succeeded', method: 'mada' },
      },
    ],
  },

  // 3. Active 6-month — paid via Moyasar card.
  {
    userTag: 'school-active-6',
    planCode: 'school_6month',
    status: 'active',
    periodOffset: { startDaysAgo: 45, endDaysFromNow: 135 },
    invoices: [
      {
        status: 'paid', method: 'moyasar_card', issuedDaysAgo: 45, paidDaysAgo: 44,
        payment: { status: 'succeeded', method: 'moyasar_card' },
      },
    ],
  },

  // 4. Active annual — paid via bank transfer (admin marked).
  {
    userTag: 'school-active-y',
    planCode: 'school_annual',
    status: 'active',
    periodOffset: { startDaysAgo: 90, endDaysFromNow: 275 },
    invoices: [
      {
        status: 'paid', method: 'bank_transfer', issuedDaysAgo: 92, paidDaysAgo: 88,
        payment: { status: 'succeeded', method: 'bank_transfer' },
      },
    ],
  },

  // 5. Past-due school — first payment failed, second invoice pending.
  {
    userTag: 'school-past-due',
    planCode: 'school_monthly',
    status: 'past_due',
    periodOffset: { startDaysAgo: 35, endDaysFromNow: -5 },
    invoices: [
      {
        status: 'paid', method: 'moyasar_card', issuedDaysAgo: 35, paidDaysAgo: 35,
        payment: { status: 'succeeded', method: 'moyasar_card' },
      },
      {
        status: 'failed', method: 'moyasar_card', issuedDaysAgo: 4,
        payment: { status: 'failed', method: 'moyasar_card', failureReason: 'Card declined by issuer' },
      },
    ],
  },

  // 6. Cancelled at period end — still active until period ends.
  {
    userTag: 'school-cancelled',
    planCode: 'school_6month',
    status: 'cancelled',
    periodOffset: { startDaysAgo: 60, endDaysFromNow: 120 },
    cancelAtPeriodEnd: true,
    cancellationReason: 'Demo: school cited cost — keeping until period end',
    invoices: [
      {
        status: 'paid', method: 'moyasar_card', issuedDaysAgo: 60, paidDaysAgo: 60,
        payment: { status: 'succeeded', method: 'moyasar_card' },
      },
    ],
  },

  // 7. Refunded payment scenario.
  {
    userTag: 'school-refunded',
    planCode: 'school_monthly',
    status: 'cancelled',
    periodOffset: { startDaysAgo: 8, endDaysFromNow: 22 },
    cancelAtPeriodEnd: false,
    cancellationReason: 'Demo: requested refund after billing issue',
    invoices: [
      {
        status: 'paid', method: 'moyasar_card', issuedDaysAgo: 8, paidDaysAgo: 8,
        payment: {
          status: 'refunded', method: 'moyasar_card',
          refundedNote: 'Demo: full refund issued via Moyasar',
        },
      },
    ],
  },

  // 8-10. Teacher premium — three durations, all paid.
  {
    userTag: 'teacher-active-m',
    planCode: 'teacher_premium_monthly',
    status: 'active',
    periodOffset: { startDaysAgo: 10, endDaysFromNow: 20 },
    invoices: [
      {
        status: 'paid', method: 'mada', issuedDaysAgo: 10, paidDaysAgo: 10,
        payment: { status: 'succeeded', method: 'mada' },
      },
    ],
  },
  {
    userTag: 'teacher-active-6',
    planCode: 'teacher_premium_6month',
    status: 'active',
    periodOffset: { startDaysAgo: 50, endDaysFromNow: 130 },
    invoices: [
      {
        status: 'paid', method: 'apple_pay', issuedDaysAgo: 50, paidDaysAgo: 50,
        payment: { status: 'succeeded', method: 'apple_pay' },
      },
    ],
  },
  {
    userTag: 'teacher-active-y',
    planCode: 'teacher_premium_annual',
    status: 'active',
    periodOffset: { startDaysAgo: 100, endDaysFromNow: 265 },
    invoices: [
      {
        status: 'paid', method: 'stcpay', issuedDaysAgo: 100, paidDaysAgo: 100,
        payment: { status: 'succeeded', method: 'stcpay' },
      },
    ],
  },

  // 11. Expired teacher — past purchase, not renewed.
  {
    userTag: 'teacher-expired',
    planCode: 'teacher_premium_monthly',
    status: 'expired',
    periodOffset: { startDaysAgo: 40, endDaysFromNow: -10 },
    invoices: [
      {
        status: 'paid', method: 'moyasar_card', issuedDaysAgo: 40, paidDaysAgo: 40,
        payment: { status: 'succeeded', method: 'moyasar_card' },
      },
    ],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────

async function upsertUser(u: DemoUser): Promise<{ id: string; created: boolean }> {
  const existing = await User.findOne({ email: u.email });
  if (existing) return { id: String(existing._id), created: false };

  const hash = await bcrypt.hash(u.passwordPlain, 10);
  const created = await User.create({
    email: u.email,
    password: hash,
    role: u.role,
    schoolName: u.schoolName,
    firstName: u.firstName,
    lastName: u.lastName,
    isEmailVerified: true,
    isActive: true,
  });
  return { id: String(created._id), created: true };
}

interface PreparedScenario {
  user: DemoUser;
  userId: string;
  plan: NonNullable<Awaited<ReturnType<typeof PricingPlan.findOne>>>;
  scenario: ScenarioBase;
}

async function clearDemo(): Promise<void> {
  // Demo emails are `demo+billing-...@abjad.dev`. The `+` is a regex
  // metacharacter so we have to either escape it or use a literal-string
  // prefix match — Mongoose accepts a RegExp object directly which is
  // cleaner than escaping inside a template literal.
  const emailMatcher = new RegExp('^' + DEMO_TAG_PREFIX.replace(/[+]/g, '\\+'));

  const users = await User.find({ email: emailMatcher }).select('_id').lean();
  const userIds = users.map((u) => u._id);
  if (userIds.length === 0) {
    console.log('No demo users found — nothing to clear.');
    return;
  }
  // Payments link to demo data via either bankReference (every demo payment
  // gets a `demo-<tag>` reference) or via demo invoiceIds. Resolve both so
  // we don't leave orphan Payment docs.
  const demoInvoiceIds = await Invoice.find({ ownerId: { $in: userIds } }).select('_id').lean();
  const invoiceIdList = demoInvoiceIds.map((i) => i._id);

  const [subs, invs, paysByRef, paysByInv, ledg] = await Promise.all([
    Subscription.deleteMany({ ownerId: { $in: userIds } }),
    Invoice.deleteMany({ ownerId: { $in: userIds } }),
    Payment.deleteMany({ bankReference: { $regex: '^demo-' } }),
    Payment.deleteMany({ invoiceId: { $in: invoiceIdList } }),
    LedgerEntry.deleteMany({ ownerId: { $in: userIds } }),
  ]);
  await User.deleteMany({ _id: { $in: userIds } });
  console.log(
    `Cleared: ${users.length} users · ${subs.deletedCount} subs · ${invs.deletedCount} invoices · ${paysByRef.deletedCount + paysByInv.deletedCount} payments · ${ledg.deletedCount} ledger entries`,
  );
}

async function seedScenario(prep: PreparedScenario): Promise<void> {
  const { user, userId, plan, scenario } = prep;
  const ownerType = scenario.userTag.startsWith('school') ? 'school' : 'teacher';
  const ownerObj = new mongoose.Types.ObjectId(userId);

  // ── Subscription ─────────────────────────────────────────────────────
  const subTag = `${SEED_NOTE} ${scenario.userTag}`;
  const subFilter = { ownerId: ownerObj, cancellationReason: { $regex: scenario.userTag } } as Record<string, unknown>;

  // Find by tag in cancellationReason (works for cancelled) OR by combination
  // of ownerId + planCode (works for active/trialing). Two-step lookup keeps
  // the idempotency check simple.
  let sub = await Subscription.findOne({ ownerId: ownerObj, planCode: scenario.planCode });
  if (!sub) sub = await Subscription.findOne(subFilter);

  const periodStart = daysAgo(scenario.periodOffset.startDaysAgo);
  const periodEnd   = daysFromNow(scenario.periodOffset.endDaysFromNow);

  const subPayload = {
    ownerType: ownerType as 'school' | 'teacher',
    ownerId: ownerObj,
    planCode: scenario.planCode as string,
    pricePerPeriodHalala: plan.priceHalala,
    durationMonths: plan.durationMonths,
    status: scenario.status,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: scenario.cancelAtPeriodEnd ?? false,
    autoRenew: scenario.status === 'active' || scenario.status === 'trialing',
    trialEndsAt: scenario.trialEndsAt,
    cancellationReason: scenario.cancellationReason
      ? `${subTag} :: ${scenario.cancellationReason}`
      : subTag,
    cancelledAt: scenario.status === 'cancelled' ? daysAgo(1) : undefined,
  };

  if (sub) {
    Object.assign(sub, subPayload);
    await sub.save();
  } else {
    sub = await Subscription.create(subPayload);
  }

  const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  const ownerLabel = user.schoolName ?? (fullName || user.email);

  // ── Invoices + Payments + Ledger ─────────────────────────────────────
  // Recompute running balance per owner from scratch — keeps balanceHalala
  // accurate after re-runs.
  await LedgerEntry.deleteMany({ ownerId: ownerObj, notes: { $regex: SEED_NOTE.replace(/[[\]]/g, '\\$&') } });

  let runningBalance = 0;

  for (const inv of scenario.invoices) {
    const issuedAt = daysAgo(inv.issuedDaysAgo);
    const subtotal = plan.priceHalala;
    const breakdown = breakdownFromSubtotal(subtotal);

    const invTag = `${SEED_NOTE} ${scenario.userTag} ${inv.status}`;

    // Idempotency: find existing demo invoice for this owner+status that
    // carries our tag in notes. Re-running updates it in place.
    let invoice = await Invoice.findOne({
      ownerId: ownerObj,
      notes: { $regex: scenario.userTag },
      status: inv.status,
    });

    const number = invoice?.number ?? await nextInvoiceNumber(issuedAt);

    const invoicePayload = {
      uuid: invoice?.uuid,
      number,
      subscriptionId: sub._id,
      ownerType: ownerType as 'school' | 'teacher',
      ownerId: ownerObj,
      status: inv.status,
      paymentMethod: inv.method,
      subtotalHalala: subtotal,
      vatHalala: breakdown.vatHalala,
      totalHalala: breakdown.totalHalala,
      currency: 'SAR' as const,
      issuedAt,
      issuedAtHijri: toHijriString(issuedAt),
      dueAt: inv.status === 'pending' ? daysFromNow(7) : undefined,
      paidAt: inv.paidDaysAgo != null ? daysAgo(inv.paidDaysAgo) : undefined,
      sellerNameEn: config.seller.nameEn,
      sellerNameAr: config.seller.nameAr,
      sellerVatNumber: config.seller.vatNumber || '300000000000003',
      sellerCrNumber: config.seller.crNumber || '1010000000',
      sellerAddress: config.seller.address,
      buyerName: ownerLabel,
      buyerEmail: user.email,
      lineItems: [{
        description: plan.nameEn,
        descriptionAr: plan.nameAr,
        quantity: 1,
        unitPriceHalala: subtotal,
        vatHalala: breakdown.vatHalala,
        totalHalala: breakdown.totalHalala,
      }],
      notes: invTag,
    };

    if (invoice) {
      Object.assign(invoice, invoicePayload);
      await invoice.save();
    } else {
      invoice = await Invoice.create(invoicePayload);
    }

    // Ledger: invoice issued (credit)
    runningBalance += breakdown.totalHalala;
    await LedgerEntry.create({
      invoiceId: invoice._id,
      ownerType: ownerType as 'school' | 'teacher',
      ownerId: ownerObj,
      type: 'invoice_issued',
      direction: 'credit',
      amountHalala: breakdown.totalHalala,
      balanceHalala: runningBalance,
      notes: `${SEED_NOTE} ${invoice.number} issued`,
    });

    // ── Payment ───────────────────────────────────────────────────────
    if (!inv.payment) continue;

    const payTag = `demo-${scenario.userTag}-${inv.status}`;

    let payment = await Payment.findOne({ bankReference: payTag });
    const paymentPayload = {
      invoiceId: invoice._id,
      amountHalala: breakdown.totalHalala,
      method: inv.payment.method,
      status: inv.payment.status,
      moyasarPaymentId: inv.payment.method === 'moyasar_card' || inv.payment.method === 'mada' || inv.payment.method === 'apple_pay'
        ? `pay_demo_${scenario.userTag}_${inv.status}`
        : undefined,
      bankReference: payTag,
      failureReason: inv.payment.failureReason,
    };

    if (payment) {
      Object.assign(payment, paymentPayload);
      await payment.save();
    } else {
      payment = await Payment.create(paymentPayload);
    }

    // Ledger entries based on payment state
    if (inv.payment.status === 'succeeded') {
      runningBalance -= breakdown.totalHalala;
      await LedgerEntry.create({
        invoiceId: invoice._id,
        paymentId: payment._id,
        ownerType: ownerType as 'school' | 'teacher',
        ownerId: ownerObj,
        type: 'payment_received',
        direction: 'debit',
        amountHalala: breakdown.totalHalala,
        balanceHalala: runningBalance,
        notes: `${SEED_NOTE} ${invoice.number} paid via ${inv.payment.method}`,
      });
    } else if (inv.payment.status === 'refunded') {
      // Was paid first, then refunded — write both entries.
      runningBalance -= breakdown.totalHalala;
      await LedgerEntry.create({
        invoiceId: invoice._id,
        paymentId: payment._id,
        ownerType: ownerType as 'school' | 'teacher',
        ownerId: ownerObj,
        type: 'payment_received',
        direction: 'debit',
        amountHalala: breakdown.totalHalala,
        balanceHalala: runningBalance,
        notes: `${SEED_NOTE} ${invoice.number} paid via ${inv.payment.method}`,
      });
      runningBalance += breakdown.totalHalala;
      await LedgerEntry.create({
        invoiceId: invoice._id,
        paymentId: payment._id,
        ownerType: ownerType as 'school' | 'teacher',
        ownerId: ownerObj,
        type: 'refund_issued',
        direction: 'credit',
        amountHalala: breakdown.totalHalala,
        balanceHalala: runningBalance,
        notes: `${SEED_NOTE} ${invoice.number} refund — ${inv.payment.refundedNote ?? 'admin issued'}`,
      });
    }
    // 'failed' / 'pending' — no debit, balance stays after the credit
  }

  console.log(`  ✓ ${scenario.userTag.padEnd(20)} → ${scenario.status.padEnd(10)} · ${scenario.invoices.length} inv · ${halalaToSAR(runningBalance)} SAR balance`);
}

// ── Driver ───────────────────────────────────────────────────────────────

async function run() {
  if (process.env.NODE_ENV === 'production' && process.argv.indexOf('--allow-prod') === -1) {
    console.error('Refusing to seed prod without --allow-prod flag');
    process.exit(1);
  }

  await mongoose.connect(config.mongodb.uri);
  console.log('Connected to', config.mongodb.uri.replace(/:[^@]+@/, ':***@'));

  if (process.argv.includes('--clear')) {
    await clearDemo();
    await mongoose.disconnect();
    return;
  }

  // Reset the invoice number counter for the year so re-runs don't burn
  // through INV-YYYY-NNNNN sequence space pointlessly. Only the demo
  // counter is reset; production counter would never be reset by a seed.
  // (Counters live in a separate collection — safe to touch.)
  // Actually leave the counter alone; numbers monotonically increasing is
  // fine, and tests rely on it.
  void Counter;

  // 1. Upsert all demo users
  console.log('\n=== Users ===');
  const upserted: Record<string, string> = {};
  for (const u of ALL_DEMO_USERS) {
    const { id, created } = await upsertUser(u);
    upserted[u.tag] = id;
    console.log(`  ${created ? 'created' : 'exists '} ${u.email}`);
  }

  // 2. Load plans (must be seeded already)
  const plans = await PricingPlan.find().lean();
  if (plans.length === 0) {
    throw new Error('Pricing plans not seeded — run `pnpm seed:plans` first.');
  }
  const planByCode = new Map(plans.map((p) => [p.code, p]));

  // 3. Seed scenarios
  console.log('\n=== Scenarios ===');
  for (const scenario of SCENARIOS) {
    const userId = upserted[scenario.userTag];
    if (!userId) {
      console.warn(`  ! no demo user for tag ${scenario.userTag} — skipping`);
      continue;
    }
    const plan = planByCode.get(scenario.planCode);
    if (!plan) {
      console.warn(`  ! plan ${scenario.planCode} not found — skipping`);
      continue;
    }
    const user = ALL_DEMO_USERS.find((u) => u.tag === scenario.userTag)!;
    await seedScenario({ user, userId, plan: plan as PreparedScenario['plan'], scenario });
  }

  // 4. Summary
  const [totalSubs, totalInvoices, totalPayments, totalLedger] = await Promise.all([
    Subscription.countDocuments({}),
    Invoice.countDocuments({}),
    Payment.countDocuments({}),
    LedgerEntry.countDocuments({}),
  ]);
  console.log('\n=== Done ===');
  console.log(`subscriptions: ${totalSubs}  invoices: ${totalInvoices}  payments: ${totalPayments}  ledger: ${totalLedger}`);
  console.log('\nDemo logins (password: demo@123#):');
  for (const u of ALL_DEMO_USERS) console.log(`  ${u.email}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
