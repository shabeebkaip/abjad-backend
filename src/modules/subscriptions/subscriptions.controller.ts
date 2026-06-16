import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { subscriptionsService } from './subscriptions.service';
import { PricingPlan } from '../../models/pricing-plan.model';

export class SubscriptionsController {
  /**
   * GET /api/subscriptions/me
   * Current subscription state for the authenticated user.
   */
  async getMine(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await subscriptionsService.getCurrent(req.user!.userId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/subscriptions/trial
   * Schools only. Starts the 5-day free trial.
   */
  async startTrial(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const sub = await subscriptionsService.startSchoolTrial(req.user!.userId);
      res.status(201).json({ success: true, data: sub });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/subscriptions/cancel
   * Cancel-at-period-end. Trial cancellation = immediate. No refunds.
   */
  async cancel(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { reason } = req.body as { reason?: string };
      const sub = await subscriptionsService.cancelSubscription(req.user!.userId, reason);
      res.json({ success: true, data: sub });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/pricing-plans
   * Public catalogue of active plans for the billing UI.
   * Authenticated users only — we don't expose pricing to anonymous traffic.
   */
  async listPublicPlans(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const plans = await PricingPlan.find({ isActive: true })
        .sort({ type: 1, durationMonths: 1 })
        .lean();
      res.json({ success: true, data: plans });
    } catch (err) {
      next(err);
    }
  }
}

export const subscriptionsController = new SubscriptionsController();
