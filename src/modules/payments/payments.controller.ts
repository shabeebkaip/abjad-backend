import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { paymentsService } from './payments.service';
import { Invoice } from '../../models/invoice.model';
import { AppError } from '../../utils/app-error.util';
import { renderInvoicePdf } from '../../utils/receipt-pdf.util';

export class PaymentsController {
  /**
   * POST /api/payments/initiate
   * Body: { planCode, method?, callbackUrl? }
   * Returns: { providerPaymentId, publishableKey, amountHalala, invoice }
   * Client uses providerPaymentId + publishableKey to complete the Moyasar.js
   * checkout. Bank transfer skips the provider call and returns a pending
   * invoice with bank instructions.
   */
  /**
   * POST /api/payments/demo/:providerPaymentId/complete
   * Demo-only — simulates a successful Moyasar webhook. Activates the
   * subscription server-side as if the webhook had fired. Refuses in prod
   * and when real Moyasar credentials are configured.
   */
  async demoComplete(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params['providerPaymentId']);
      const result = await paymentsService.demoCompletePayment(id);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/payments/:providerPaymentId/reconcile
   * Reconciles a single payment by asking Moyasar directly for the latest
   * status — recovers from missed/delayed webhooks. Always required on
   * localhost (webhook can't reach the backend); occasionally helpful in
   * production during a provider blip. Auth-gated; ownership double-checked
   * in the service.
   */
  async reconcile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params['providerPaymentId']);
      const result = await paymentsService.reconcilePayment(id, req.user!.userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async initiate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { planCode, method, callbackUrl } = req.body as {
        planCode?: string;
        method?: string;
        callbackUrl?: string;
      };
      if (!planCode) throw AppError.badRequest('planCode is required');
      const result = await paymentsService.initiatePaymentForPlan({
        userId: req.user!.userId,
        planCode,
        method: method as 'moyasar_card' | 'bank_transfer' | undefined,
        callbackUrl,
      });
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/invoices — list invoices for the authenticated user.
   */
  async listMine(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const skip = (page - 1) * limit;
      const [invoices, total] = await Promise.all([
        Invoice.find({ ownerId: req.user!.userId }).sort({ issuedAt: -1 }).skip(skip).limit(limit).lean(),
        Invoice.countDocuments({ ownerId: req.user!.userId }),
      ]);
      res.json({
        success: true,
        data: { invoices, total, page, totalPages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/invoices/:id/receipt — internal-format PDF receipt (NOT ZATCA
   * compliant). Stream as application/pdf. Only the invoice owner can fetch.
   */
  async receipt(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoice = await Invoice.findById(req.params.id);
      if (!invoice) throw AppError.notFound('Invoice not found');
      if (invoice.ownerId.toString() !== req.user!.userId && req.user!.role !== 'admin') {
        throw AppError.forbidden('You do not have access to this invoice');
      }
      const pdf = await renderInvoicePdf(invoice);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${invoice.number}.pdf"`);
      res.send(pdf);
    } catch (err) {
      next(err);
    }
  }
}

export const paymentsController = new PaymentsController();
