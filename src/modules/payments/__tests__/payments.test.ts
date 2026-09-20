/**
 * Payments service + webhook idempotency tests.
 *
 * Uses a mock PaymentProvider so the Moyasar HTTP layer is never touched.
 */
import mongoose from 'mongoose';
import User from '../../../models/user.model';
import { PricingPlan } from '../../../models/pricing-plan.model';
import { Subscription } from '../../../models/subscription.model';
import { Invoice } from '../../../models/invoice.model';
import { Payment } from '../../../models/payment.model';
import { LedgerEntry } from '../../../models/ledger-entry.model';
import { WebhookEvent } from '../../../models/webhook-event.model';
import { paymentsService } from '../payments.service';
import { setPaymentProvider, PaymentProvider } from '../../../utils/payment-provider';

async function seedPlans() {
  await PricingPlan.deleteMany({});
  await PricingPlan.create({
    code: 'school_annual', type: 'school', durationMonths: 12,
    priceHalala: 1_300_000, nameEn: 'School Annual', nameAr: 'سنوي',
    isActive: true, effectiveFrom: new Date(),
  });
}

async function makeSchool(): Promise<string> {
  const u = await User.create({
    email: `school-${Date.now()}-${Math.random()}@test.com`,
    role: 'school', status: 'active', schoolName: 'Test School',
  });
  return (u._id as { toString(): string }).toString();
}

let mockedPaymentId = 'pay_mock_1';
const mockProvider: PaymentProvider = {
  async initiatePayment(input) {
    return {
      providerPaymentId: mockedPaymentId,
      status: 'pending',
      rawProviderResponse: { id: mockedPaymentId, amount: input.amountHalala, status: 'initiated' },
    };
  },
  async getPaymentStatus(id) {
    return { status: 'paid', amountHalala: 1495000, rawProviderResponse: { id } };
  },
  async refundPayment(id) {
    return { id, refunded: true };
  },
};

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    throw new Error('Mongo connection not initialised — check jest.setup.js');
  }
  setPaymentProvider(mockProvider);
});

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Subscription.deleteMany({}),
    Invoice.deleteMany({}),
    Payment.deleteMany({}),
    LedgerEntry.deleteMany({}),
    WebhookEvent.deleteMany({}),
  ]);
  await seedPlans();
  mockedPaymentId = 'pay_mock_' + Math.random().toString(36).slice(2);
});

describe('paymentsService.initiatePaymentForPlan', () => {
  it('creates a pending Invoice + pending Payment + ledger entry', async () => {
    const userId = await makeSchool();
    const r = await paymentsService.initiatePaymentForPlan({ userId, planCode: 'school_annual' });

    expect(r.amountHalala).toBe(1_495_000); // 1,300,000 + 15% VAT
    expect(r.providerPaymentId).toBe(mockedPaymentId);

    const inv = await Invoice.findOne({ ownerId: userId });
    expect(inv?.status).toBe('pending');
    expect(inv?.subtotalHalala).toBe(1_300_000);
    expect(inv?.vatHalala).toBe(195_000);
    expect(inv?.totalHalala).toBe(1_495_000);
    expect(inv?.number).toMatch(/^INV-\d{4}-\d{5}$/);

    const pay = await Payment.findOne({ invoiceId: inv!._id });
    expect(pay?.status).toBe('pending');
    expect(pay?.moyasarPaymentId).toBe(mockedPaymentId);

    const ledger = await LedgerEntry.find({ ownerId: userId });
    expect(ledger.length).toBe(1);
    expect(ledger[0].type).toBe('invoice_issued');
    expect(ledger[0].balanceHalala).toBe(-1_495_000); // credit reduces balance
  });

  it('rejects mismatched plan/role (teacher buying school plan)', async () => {
    const teacher = await User.create({ email: `t-${Date.now()}@t.com`, role: 'teacher', status: 'active' });
    await expect(
      paymentsService.initiatePaymentForPlan({
        userId: (teacher._id as { toString(): string }).toString(),
        planCode: 'school_annual',
      }),
    ).rejects.toThrow(/school plan/i);
  });

  it('rejects inactive plans', async () => {
    await PricingPlan.updateOne({ code: 'school_annual' }, { isActive: false });
    const userId = await makeSchool();
    await expect(
      paymentsService.initiatePaymentForPlan({ userId, planCode: 'school_annual' }),
    ).rejects.toThrow(/not available/i);
  });

  it('bank_transfer skips the provider call', async () => {
    const userId = await makeSchool();
    let providerCalled = false;
    setPaymentProvider({
      ...mockProvider,
      async initiatePayment(input) {
        providerCalled = true;
        return mockProvider.initiatePayment(input);
      },
    });
    const r = await paymentsService.initiatePaymentForPlan({
      userId, planCode: 'school_annual', method: 'bank_transfer',
    });
    expect(providerCalled).toBe(false);
    expect(r.providerPaymentId).toBe('pending-bank-transfer');
    setPaymentProvider(mockProvider);
  });
});

describe('paymentsService.markPaymentSucceededByProviderId', () => {
  it('flips Invoice to paid, Payment to succeeded, activates Subscription, writes ledger debit', async () => {
    const userId = await makeSchool();
    const init = await paymentsService.initiatePaymentForPlan({ userId, planCode: 'school_annual' });

    const result = await paymentsService.markPaymentSucceededByProviderId(
      init.providerPaymentId, { mock: true },
    );

    expect(result.activated).toBe(true);
    expect(result.subscriptionId).toBeDefined();

    const inv = await Invoice.findById(init.invoice._id);
    expect(inv?.status).toBe('paid');
    expect(inv?.paidAt).toBeDefined();

    const pay = await Payment.findOne({ moyasarPaymentId: init.providerPaymentId });
    expect(pay?.status).toBe('succeeded');

    const sub = await Subscription.findById(result.subscriptionId);
    expect(sub?.status).toBe('active');
    expect(sub?.planCode).toBe('school_annual');
    expect(sub?.pricePerPeriodHalala).toBe(1_300_000);

    const ledger = await LedgerEntry.find({ ownerId: userId }).sort({ createdAt: 1 });
    expect(ledger.map((l) => l.type)).toEqual(['invoice_issued', 'payment_received']);
    expect(ledger[1].balanceHalala).toBe(0); // -1495000 + 1495000
  });

  it('is idempotent (second call is a no-op)', async () => {
    const userId = await makeSchool();
    const init = await paymentsService.initiatePaymentForPlan({ userId, planCode: 'school_annual' });
    await paymentsService.markPaymentSucceededByProviderId(init.providerPaymentId, {});

    const second = await paymentsService.markPaymentSucceededByProviderId(init.providerPaymentId, {});
    expect(second.activated).toBe(false);

    const subs = await Subscription.find({ ownerId: userId });
    expect(subs.length).toBe(1); // not duplicated
    const ledger = await LedgerEntry.find({ ownerId: userId });
    expect(ledger.length).toBe(2); // not tripled
  });
});

describe('paymentsService.markBankTransferPaid', () => {
  it('activates subscription on bank-transfer admin confirmation', async () => {
    const userId = await makeSchool();
    const adminUser = await User.create({ email: `a-${Date.now()}@t.com`, role: 'admin', status: 'active' });
    const init = await paymentsService.initiatePaymentForPlan({
      userId, planCode: 'school_annual', method: 'bank_transfer',
    });

    const result = await paymentsService.markBankTransferPaid({
      invoiceId: (init.invoice._id as { toString(): string }).toString(),
      bankReference: 'BANK-REF-12345',
      adminUserId: (adminUser._id as { toString(): string }).toString(),
    });
    expect(result.activated).toBe(true);

    const inv = await Invoice.findById(init.invoice._id);
    expect(inv?.status).toBe('paid');
    const pay = await Payment.findOne({ bankReference: 'BANK-REF-12345' });
    expect(pay?.status).toBe('succeeded');
    expect(pay?.markedPaidBy?.toString()).toBe((adminUser._id as { toString(): string }).toString());
    const sub = await Subscription.findOne({ ownerId: userId });
    expect(sub?.status).toBe('active');
  });
});

describe('paymentsService.recordWebhookEventIdempotent', () => {
  it('records new events, returns wasNew=true', async () => {
    const r = await paymentsService.recordWebhookEventIdempotent({
      provider: 'moyasar', eventId: 'evt_1', type: 'payment_paid', payload: { x: 1 },
    });
    expect(r.wasNew).toBe(true);
    const evt = await WebhookEvent.findOne({ eventId: 'evt_1' });
    expect(evt).not.toBeNull();
  });

  it('returns wasNew=false on duplicate (provider, eventId)', async () => {
    await paymentsService.recordWebhookEventIdempotent({
      provider: 'moyasar', eventId: 'evt_dup', type: 'payment_paid', payload: {},
    });
    const r2 = await paymentsService.recordWebhookEventIdempotent({
      provider: 'moyasar', eventId: 'evt_dup', type: 'payment_paid', payload: {},
    });
    expect(r2.wasNew).toBe(false);
    const all = await WebhookEvent.find({ eventId: 'evt_dup' });
    expect(all.length).toBe(1);
  });
});
