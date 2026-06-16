import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { PricingPlan } from '../../models/pricing-plan.model';
import { AppError } from '../../utils/app-error.util';
import { sarToHalala } from '../../utils/money.util';

export class AdminPricingController {
  async list(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const plans = await PricingPlan.find().sort({ type: 1, durationMonths: 1 }).lean();
      res.json({ success: true, data: plans });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/admin/pricing-plans/:id
   * Editable: priceSAR (or priceHalala), nameEn, nameAr, isActive
   * Frozen:   code, type, durationMonths (renaming a plan would orphan subscriptions).
   */
  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { priceSAR, priceHalala, nameEn, nameAr, isActive } = req.body as {
        priceSAR?: number;
        priceHalala?: number;
        nameEn?: string;
        nameAr?: string;
        isActive?: boolean;
      };

      const plan = await PricingPlan.findById(id);
      if (!plan) throw AppError.notFound('Pricing plan not found');

      if (priceHalala != null) {
        if (!Number.isInteger(priceHalala) || priceHalala < 0) {
          throw AppError.badRequest('priceHalala must be a non-negative integer');
        }
        plan.priceHalala = priceHalala;
      } else if (priceSAR != null) {
        if (priceSAR < 0) throw AppError.badRequest('priceSAR must be non-negative');
        plan.priceHalala = sarToHalala(priceSAR);
      }
      if (nameEn != null) plan.nameEn = nameEn;
      if (nameAr != null) plan.nameAr = nameAr;
      if (isActive != null) plan.isActive = isActive;

      // Bump effectiveFrom so we can audit price-change history if we later add a versioned table.
      if (priceSAR != null || priceHalala != null) {
        plan.effectiveFrom = new Date();
      }

      await plan.save();
      res.json({ success: true, data: plan });
    } catch (err) {
      next(err);
    }
  }
}

export const adminPricingController = new AdminPricingController();
