/**
 * Admin endpoints for the billing dashboard (Phase D ledger UI).
 */
import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../../middlewares/auth';
import { Invoice } from '../../models/invoice.model';
import { Payment } from '../../models/payment.model';
import { LedgerEntry } from '../../models/ledger-entry.model';
import { Subscription } from '../../models/subscription.model';
import { paymentsService } from '../payments/payments.service';
import { renderInvoicePdf } from '../../utils/receipt-pdf.util';
import { AppError } from '../../utils/app-error.util';
import { auditService, actorFromRequest } from '../audit/audit.service';

export class AdminPaymentsController {
  /** GET /api/admin/invoices?status=&ownerType=&ownerId=&page=&limit= */
  async listInvoices(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { status, ownerType, ownerId } = req.query as Record<string, string>;
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const q: Record<string, unknown> = {};
      if (status) q.status = status;
      if (ownerType) q.ownerType = ownerType;
      if (ownerId) q.ownerId = new mongoose.Types.ObjectId(ownerId);

      const [invoices, total] = await Promise.all([
        Invoice.find(q).sort({ issuedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        Invoice.countDocuments(q),
      ]);
      res.json({ success: true, data: { invoices, total, page, totalPages: Math.ceil(total / limit) } });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/admin/payments */
  async listPayments(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { status, method } = req.query as Record<string, string>;
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const q: Record<string, unknown> = {};
      if (status) q.status = status;
      if (method) q.method = method;

      const [payments, total] = await Promise.all([
        Payment.find(q).populate('invoiceId', 'number ownerId ownerType totalHalala').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        Payment.countDocuments(q),
      ]);
      res.json({ success: true, data: { payments, total, page, totalPages: Math.ceil(total / limit) } });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/admin/ledger/:ownerId — full per-halala running balance for one account. */
  async ownerLedger(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ownerId = String(req.params.ownerId);
      const entries = await LedgerEntry.find({ ownerId: new mongoose.Types.ObjectId(ownerId) })
        .sort({ createdAt: 1 })
        .lean();
      const balance = entries.length > 0 ? entries[entries.length - 1].balanceHalala : 0;
      res.json({ success: true, data: { entries, balance } });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/admin/subscriptions */
  async listSubscriptions(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { status, ownerType } = req.query as Record<string, string>;
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const q: Record<string, unknown> = {};
      if (status) q.status = status;
      if (ownerType) q.ownerType = ownerType;
      const [subs, total] = await Promise.all([
        Subscription.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        Subscription.countDocuments(q),
      ]);
      res.json({ success: true, data: { subscriptions: subs, total, page, totalPages: Math.ceil(total / limit) } });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/admin/invoices/:id/mark-paid
   * Body: { bankReference }
   * Marks a bank-transfer invoice as paid and activates the subscription.
   */
  async markInvoicePaid(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { bankReference } = req.body as { bankReference?: string };
      if (!bankReference?.trim()) throw AppError.badRequest('bankReference is required');
      const invoiceId = String(req.params.id);
      const invoice = await Invoice.findById(invoiceId).lean();
      const result = await paymentsService.markBankTransferPaid({
        invoiceId,
        bankReference: bankReference.trim(),
        adminUserId: req.user!.userId,
      });
      void auditService.record({
        actor: actorFromRequest(req),
        action: 'invoice.mark_paid',
        targetType: 'Invoice',
        targetId: invoiceId,
        targetLabel: invoice?.number,
        notes: `Bank reference: ${bankReference.trim()}`,
        req,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/admin/invoices/:id/receipt */
  async receipt(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoice = await Invoice.findById(req.params.id);
      if (!invoice) throw AppError.notFound('Invoice not found');
      const pdf = await renderInvoicePdf(invoice);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${invoice.number}.pdf"`);
      res.send(pdf);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/admin/payments/:id/refund
   * Body: { reason }
   * Tier 2 #13 — full refund (partial refunds deferred to Phase 2).
   */
  async refundPayment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { reason } = req.body as { reason?: string };
      if (!reason?.trim()) throw AppError.badRequest('Refund reason is required');
      const paymentId = String(req.params.id);

      const result = await paymentsService.refundPayment({
        paymentId,
        adminUserId: req.user!.userId,
        reason: reason.trim(),
      });

      void auditService.record({
        actor: actorFromRequest(req),
        action: 'payment.refund',
        targetType: 'Payment',
        targetId: paymentId,
        reason: reason.trim(),
        notes: `Refunded ${result.payment.amountHalala} halala`,
        req,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}

export const adminPaymentsController = new AdminPaymentsController();
