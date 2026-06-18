/**
 * Payments orchestrator — knits together PricingPlan, Invoice, Payment,
 * LedgerEntry, and Subscription state machine via the provider adapter.
 *
 * Flow on success:
 *   1. initiatePayment  → creates pending Invoice + Payment + ledger 'invoice_issued'
 *   2. (client completes the Moyasar checkout)
 *   3. webhook 'payment.paid' → markPaymentSucceeded → Invoice paid + ledger
 *      'payment_received' + subscriptions.service.startSubscription
 */
import mongoose from 'mongoose';
import { config } from '../../config';
import { AppError } from '../../utils/app-error.util';
import { getPaymentProvider, isDemoProvider } from '../../utils/payment-provider';
import { nextInvoiceNumber } from '../../utils/invoice-number.util';
import { toHijriString } from '../../utils/hijri.util';
import { breakdownFromSubtotal } from '../../utils/money.util';

import User from '../../models/user.model';
import { PricingPlan } from '../../models/pricing-plan.model';
import { Invoice, IInvoice, InvoicePaymentMethod } from '../../models/invoice.model';
import { Payment, IPayment, PaymentMethod } from '../../models/payment.model';
import { LedgerEntry } from '../../models/ledger-entry.model';
import { WebhookEvent } from '../../models/webhook-event.model';
import { schoolProfileRepository } from '../school-profile/school-profile.repository';
import { subscriptionsService } from '../subscriptions/subscriptions.service';
import { subscriptionsRepository } from '../subscriptions/subscriptions.repository';

export interface InitiatePaymentResult {
  invoice: IInvoice;
  payment: IPayment;
  providerPaymentId: string;
  publishableKey: string;          // pass-through to the client for Moyasar.js
  amountHalala: number;
  currency: 'SAR';
  // True when the backend is running with no Moyasar credentials and the
  // DemoPaymentProvider is in effect. The frontend renders a
  // "simulate successful payment" button instead of the Moyasar.js form.
  demoMode: boolean;
}

export class PaymentsService {
  /**
   * Quote + initiate a payment for a plan. The client takes the returned
   * providerPaymentId + publishableKey and finishes the Moyasar checkout.
   * Until the webhook confirms, the invoice stays in `pending` status.
   */
  async initiatePaymentForPlan(params: {
    userId: string;
    planCode: string;
    method?: InvoicePaymentMethod;
    callbackUrl?: string;
  }): Promise<InitiatePaymentResult> {
    const user = await User.findById(params.userId);
    if (!user) throw AppError.notFound('User not found');

    const plan = await PricingPlan.findOne({ code: params.planCode, isActive: true });
    if (!plan) throw AppError.badRequest(`Plan not available: ${params.planCode}`);

    // Plan-role check (same as subscriptions.service.startSubscription).
    if (plan.type === 'school' && user.role !== 'school') {
      throw AppError.badRequest('School plan can only be purchased by school accounts');
    }
    if (plan.type === 'teacher_premium' && user.role !== 'teacher') {
      throw AppError.badRequest('Teacher Premium can only be purchased by teacher accounts');
    }

    // Duplicate-subscription guard. An owner already with an active/trialing/
    // past_due subscription cannot start a fresh checkout — they must cancel
    // or change plan via the management flow first. Belt-and-braces with the
    // frontend's smart CTA which routes them to /billing instead.
    const existing = await subscriptionsRepository.findActiveByOwner(params.userId);
    if (existing) {
      if (existing.planCode === params.planCode) {
        throw AppError.conflict('You already have an active subscription on this plan');
      }
      throw AppError.conflict(
        `You already have a ${existing.status} subscription. Cancel or change plan from /billing first.`,
      );
    }

    // Snapshot pricing into the invoice (Phase A money policy).
    const { subtotalHalala, vatHalala, totalHalala } = breakdownFromSubtotal(plan.priceHalala);

    // Buyer block — school profile gives us the VAT number for B2B invoices.
    const buyer = await this._buildBuyerBlock(params.userId, user.role);

    // Allocate invoice number atomically before create() so we don't fail
    // schema validation on a missing `number`.
    const invoiceNumber = await nextInvoiceNumber();

    const invoice = await Invoice.create({
      number: invoiceNumber,
      ownerType: user.role === 'school' ? 'school' : 'teacher',
      ownerId: params.userId,
      status: 'pending',
      paymentMethod: params.method ?? 'moyasar_card',
      subtotalHalala, vatHalala, totalHalala,
      currency: 'SAR',
      issuedAt: new Date(),
      issuedAtHijri: toHijriString(),
      sellerNameEn: config.seller.nameEn,
      sellerNameAr: config.seller.nameAr,
      sellerVatNumber: config.seller.vatNumber,
      sellerCrNumber: config.seller.crNumber,
      sellerAddress: config.seller.address,
      buyerName: buyer.name,
      buyerNameAr: buyer.nameAr,
      buyerVatNumber: buyer.vatNumber,
      buyerAddress: buyer.address,
      buyerEmail: user.email,
      lineItems: [{
        description: `${plan.nameEn} (${plan.durationMonths}mo)`,
        descriptionAr: plan.nameAr,
        quantity: 1,
        unitPriceHalala: subtotalHalala,
        vatHalala,
        totalHalala,
      }],
    });

    // Pending Payment row + ledger 'invoice_issued'.
    const payment = await Payment.create({
      invoiceId: invoice._id,
      amountHalala: totalHalala,
      method: (params.method ?? 'moyasar_card') as PaymentMethod,
      status: 'pending',
    });

    await this._writeLedger({
      invoiceId: invoice.id as string,
      paymentId: undefined,
      ownerType: invoice.ownerType,
      ownerId: params.userId,
      type: 'invoice_issued',
      direction: 'credit',
      amountHalala: totalHalala,
      notes: `Invoice ${invoice.number} issued for ${plan.code}`,
    });

    // Call the provider. Skip for bank transfer (no online charging).
    let providerPaymentId = 'pending-bank-transfer';
    if ((params.method ?? 'moyasar_card') !== 'bank_transfer') {
      const provider = getPaymentProvider();
      const result = await provider.initiatePayment({
        amountHalala: totalHalala,
        description: `${plan.nameEn} (${plan.durationMonths}mo) — Invoice ${invoice.number}`,
        invoiceUuid: invoice.uuid,
        ownerId: params.userId,
        callbackUrl: params.callbackUrl,
      });
      providerPaymentId = result.providerPaymentId;
      payment.moyasarPaymentId = providerPaymentId;
      payment.rawProviderPayload = result.rawProviderResponse;
      await payment.save();
    }

    return {
      invoice,
      payment,
      providerPaymentId,
      publishableKey: config.moyasar.publishableKey,
      amountHalala: totalHalala,
      currency: 'SAR',
      demoMode: isDemoProvider(),
    };
  }

  /**
   * Demo-only — simulates the Moyasar webhook firing a successful payment.
   * Only callable when the DemoPaymentProvider is in effect; refuses in
   * production. Used by the demonstration checkout flow when no Moyasar
   * credentials are configured.
   */
  async demoCompletePayment(providerPaymentId: string): Promise<{ activated: boolean; subscriptionId?: string }> {
    if (!isDemoProvider()) {
      throw AppError.forbidden('Demo completion is only available when Moyasar is unconfigured');
    }
    if (process.env['NODE_ENV'] === 'production') {
      throw AppError.forbidden('Demo completion is disabled in production');
    }
    return this.markPaymentSucceededByProviderId(providerPaymentId, { demo: true, completedAt: new Date().toISOString() });
  }

  /**
   * Webhook hot path — assumes the WebhookEvent row has been recorded and the
   * signature already verified by the caller. Idempotent: if Payment is
   * already 'succeeded' we no-op.
   */
  async markPaymentSucceededByProviderId(
    providerPaymentId: string,
    rawPayload: unknown,
  ): Promise<{ activated: boolean; subscriptionId?: string }> {
    const payment = await Payment.findOne({ moyasarPaymentId: providerPaymentId });
    if (!payment) {
      // Webhook arrived for a payment we never recorded — log to error and bail.
      throw AppError.notFound(`Payment not found for provider id ${providerPaymentId}`);
    }
    if (payment.status === 'succeeded') {
      return { activated: false };
    }

    payment.status = 'succeeded';
    payment.rawProviderPayload = rawPayload;
    await payment.save();

    const invoice = await Invoice.findById(payment.invoiceId);
    if (!invoice) throw AppError.notFound('Invoice not found');
    if (invoice.status !== 'paid') {
      invoice.status = 'paid';
      invoice.paidAt = new Date();
      await invoice.save();
    }

    await this._writeLedger({
      invoiceId: invoice.id as string,
      paymentId: payment.id as string,
      ownerType: invoice.ownerType,
      ownerId: invoice.ownerId.toString(),
      type: 'payment_received',
      direction: 'debit',
      amountHalala: payment.amountHalala,
      notes: `Payment via ${payment.method} — ${providerPaymentId}`,
    });

    // Activate the subscription. planCode is derived from invoice's first line item
    // — we stored that as nameEn earlier, but the cleanest path is to re-query the
    // PricingPlan via the unit price + ownerType. Simpler approach: look up plan
    // by ownerType + unitPriceHalala that matches the invoice subtotal.
    const planCode = await this._planCodeFromInvoice(invoice);
    if (!planCode) {
      // The invoice exists without a matching plan (could be a manual adjustment
      // or admin-edit drift). Don't crash — just skip subscription activation.
      return { activated: false };
    }
    const sub = await subscriptionsService.startSubscription({
      userId: invoice.ownerId.toString(),
      planCode,
    });
    return { activated: true, subscriptionId: (sub._id as { toString(): string }).toString() };
  }

  async markPaymentFailedByProviderId(providerPaymentId: string, rawPayload: unknown, reason?: string): Promise<void> {
    const payment = await Payment.findOne({ moyasarPaymentId: providerPaymentId });
    if (!payment) return; // unknown payments are no-ops on failure
    if (payment.status === 'failed') return;
    payment.status = 'failed';
    payment.failureReason = reason;
    payment.rawProviderPayload = rawPayload;
    await payment.save();

    await Invoice.findByIdAndUpdate(payment.invoiceId, { $set: { status: 'failed' } });
  }

  /**
   * Bank transfer manual flow. Admin verifies the deposit then calls this.
   * Activates the subscription identically to the Moyasar success path.
   */
  async markBankTransferPaid(params: {
    invoiceId: string;
    bankReference: string;
    adminUserId: string;
  }): Promise<{ activated: boolean; subscriptionId?: string }> {
    const invoice = await Invoice.findById(params.invoiceId);
    if (!invoice) throw AppError.notFound('Invoice not found');
    if (invoice.status === 'paid') {
      return { activated: false };
    }
    if (invoice.paymentMethod !== 'bank_transfer' && invoice.paymentMethod !== 'manual') {
      // Allow it anyway — admin override — but flip the method so the receipt
      // shows what actually happened.
      invoice.paymentMethod = 'bank_transfer';
    }

    const payment = await Payment.create({
      invoiceId: invoice._id,
      amountHalala: invoice.totalHalala,
      method: 'bank_transfer',
      status: 'succeeded',
      bankReference: params.bankReference,
      markedPaidBy: new mongoose.Types.ObjectId(params.adminUserId),
      markedPaidAt: new Date(),
    });

    invoice.status = 'paid';
    invoice.paidAt = new Date();
    await invoice.save();

    await this._writeLedger({
      invoiceId: invoice.id as string,
      paymentId: payment.id as string,
      ownerType: invoice.ownerType,
      ownerId: invoice.ownerId.toString(),
      type: 'payment_received',
      direction: 'debit',
      amountHalala: invoice.totalHalala,
      notes: `Bank transfer ref: ${params.bankReference} (admin: ${params.adminUserId})`,
      createdBy: params.adminUserId,
    });

    const planCode = await this._planCodeFromInvoice(invoice);
    if (!planCode) return { activated: true };
    const sub = await subscriptionsService.startSubscription({
      userId: invoice.ownerId.toString(),
      planCode,
    });
    return { activated: true, subscriptionId: (sub._id as { toString(): string }).toString() };
  }

  /**
   * Tier 2 #13 — Issue a full refund for a previously-succeeded payment.
   *
   * Side effects (order matters)
   * 1. Provider refund (Moyasar) — only if the payment has a `moyasarPaymentId`.
   *    Bank transfers settle off-platform and have no provider id; admin handles
   *    the bank-side refund externally and we just record it on the ledger.
   * 2. Payment.status → 'refunded'
   * 3. LedgerEntry { type: 'refund_issued', direction: 'credit' }
   *
   * NOT side effects (deliberately out of scope for Phase 1 — handled manually):
   *   - Subscription cancellation. Admin should explicitly cancel/pause if the
   *     refund warrants it; coupling them implicitly is footgun territory.
   *   - Invoice status. Stays `paid`. The ledger is the source of truth for
   *     "what was paid and what was returned"; flipping the invoice would lose
   *     the fact that it WAS paid at some point.
   *   - Partial refunds. Phase 1 is full-only; partial requires a refundedHalala
   *     field on the Payment model.
   */
  async refundPayment(params: {
    paymentId: string;
    adminUserId: string;
    reason: string;
  }): Promise<{ payment: IPayment }> {
    if (!params.reason?.trim()) throw AppError.badRequest('Refund reason is required');

    const payment = await Payment.findById(params.paymentId);
    if (!payment) throw AppError.notFound('Payment not found');
    if (payment.status !== 'succeeded') {
      throw AppError.badRequest(`Cannot refund a payment in status '${payment.status}'`);
    }

    const invoice = await Invoice.findById(payment.invoiceId);
    if (!invoice) throw AppError.notFound('Invoice not found for this payment');

    // Provider call FIRST so a 4xx from Moyasar surfaces before we touch state.
    // Bank transfers have no provider id — refund is off-platform.
    if (payment.moyasarPaymentId) {
      const provider = getPaymentProvider();
      await provider.refundPayment(payment.moyasarPaymentId);
    }

    payment.status = 'refunded';
    await payment.save();

    await this._writeLedger({
      invoiceId: invoice.id as string,
      paymentId: payment.id as string,
      ownerType: invoice.ownerType,
      ownerId: invoice.ownerId.toString(),
      type: 'refund_issued',
      direction: 'credit',
      amountHalala: payment.amountHalala,
      notes: `Refund: ${params.reason.trim()}`,
      createdBy: params.adminUserId,
    });

    return { payment };
  }

  /**
   * Pull buyer block from school-profile (B2B has VAT number) or fall back to
   * user fields for teachers (B2C, simplified invoice).
   */
  private async _buildBuyerBlock(userId: string, role: string) {
    if (role === 'school') {
      const profile = await schoolProfileRepository.findByUserId(userId);
      const user = await User.findById(userId);
      return {
        name: profile?.nameEn ?? user?.schoolName ?? user?.email ?? 'Unknown School',
        nameAr: profile?.nameAr,
        vatNumber: undefined as string | undefined, // SchoolProfile doesn't have a VAT number yet — collected in ZATCA phase
        address: profile?.address ?? '',
      };
    }
    const user = await User.findById(userId);
    const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'Unknown Teacher';
    return { name, nameAr: undefined, vatNumber: undefined, address: '' };
  }

  /**
   * Resolve which PricingPlan an invoice corresponds to. We match by
   * (ownerType, subtotalHalala) — invoices snapshot the price so this stays
   * stable even when the plan price is later edited.
   */
  private async _planCodeFromInvoice(invoice: IInvoice): Promise<string | null> {
    const plan = await PricingPlan.findOne({
      type: invoice.ownerType === 'school' ? 'school' : 'teacher_premium',
      priceHalala: invoice.subtotalHalala,
      isActive: true,
    });
    return plan?.code ?? null;
  }

  /**
   * Write a ledger entry AND update the per-owner running balance. Kept in one
   * place so all callers stay consistent.
   */
  private async _writeLedger(params: {
    invoiceId?: string;
    paymentId?: string;
    ownerType: 'school' | 'teacher';
    ownerId: string;
    type: 'invoice_issued' | 'payment_received' | 'refund_issued' | 'manual_adjustment' | 'void';
    direction: 'credit' | 'debit';
    amountHalala: number;
    notes?: string;
    createdBy?: string;
  }): Promise<void> {
    // Compute the new running balance: sum of debits − credits across this owner.
    const last = await LedgerEntry.findOne({
      ownerType: params.ownerType, ownerId: params.ownerId,
    }).sort({ createdAt: -1 });
    const prevBalance = last?.balanceHalala ?? 0;
    const delta = params.direction === 'debit' ? params.amountHalala : -params.amountHalala;
    const newBalance = prevBalance + delta;

    await LedgerEntry.create({
      invoiceId: params.invoiceId ? new mongoose.Types.ObjectId(params.invoiceId) : undefined,
      paymentId: params.paymentId ? new mongoose.Types.ObjectId(params.paymentId) : undefined,
      ownerType: params.ownerType,
      ownerId: new mongoose.Types.ObjectId(params.ownerId),
      type: params.type,
      direction: params.direction,
      amountHalala: params.amountHalala,
      balanceHalala: newBalance,
      notes: params.notes,
      createdBy: params.createdBy ? new mongoose.Types.ObjectId(params.createdBy) : undefined,
    });
  }

  /** Record a webhook event idempotently. Returns true if this event was new. */
  async recordWebhookEventIdempotent(params: {
    provider: 'moyasar' | 'manual';
    eventId: string;
    type: string;
    payload: unknown;
    signature?: string;
  }): Promise<{ wasNew: boolean }> {
    try {
      await WebhookEvent.create(params);
      return { wasNew: true };
    } catch (err) {
      // Duplicate (provider, eventId) → MongoServerError code 11000.
      if ((err as { code?: number }).code === 11000) {
        return { wasNew: false };
      }
      throw err;
    }
  }

  async markWebhookProcessed(provider: 'moyasar', eventId: string, error?: string): Promise<void> {
    await WebhookEvent.updateOne(
      { provider, eventId },
      { $set: { processedAt: new Date(), error } },
    );
  }
}

export const paymentsService = new PaymentsService();
