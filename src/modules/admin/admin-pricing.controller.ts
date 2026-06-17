import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { PricingPlan } from '../../models/pricing-plan.model';
import { AppError } from '../../utils/app-error.util';
import { sarToHalala } from '../../utils/money.util';
import { auditService, actorFromRequest } from '../audit/audit.service';
import {
  ENTITLEMENT_REGISTRY,
  ENTITLEMENTS_BY_AUDIENCE,
  validateEntitlementValue,
  type EntitlementBag,
} from '../../utils/entitlement-registry';

export class AdminPricingController {
  async list(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const plans = await PricingPlan.find()
        .sort({ type: 1, durationMonths: 1 })
        .lean();
      res.json({ success: true, data: plans });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/admin/entitlement-registry
   * Returns the metadata for every entitlement key the system knows about.
   * The admin UI reads this once to render the per-plan editor — types and
   * audience tell the editor whether to draw a Switch, a number input, or
   * a number-with-Unlimited input. Cheap and cache-friendly.
   */
  async getRegistry(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: ENTITLEMENT_REGISTRY });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/admin/pricing-plans/:id
   * Editable: priceSAR | priceHalala, nameEn, nameAr, isActive, entitlements,
   *           descriptionEn/Ar, marketingBulletsEn/Ar, displayOrder,
   *           isHighlighted, ctaTextEn/Ar.
   * Frozen:   code, type, durationMonths.
   */
  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const body = req.body as Record<string, unknown>;

      const plan = await PricingPlan.findById(id);
      if (!plan) throw AppError.notFound('Pricing plan not found');

      // Snapshot for audit (only the fields we actually edit here so the
      // diff stays meaningful — Mixed entitlements bags would dominate
      // every diff otherwise).
      const before = {
        priceHalala: plan.priceHalala,
        nameEn: plan.nameEn,
        nameAr: plan.nameAr,
        isActive: plan.isActive,
        entitlements: plan.entitlements,
        descriptionEn: plan.descriptionEn,
        descriptionAr: plan.descriptionAr,
        marketingBulletsEn: plan.marketingBulletsEn,
        marketingBulletsAr: plan.marketingBulletsAr,
        displayOrder: plan.displayOrder,
        isHighlighted: plan.isHighlighted,
        ctaTextEn: plan.ctaTextEn,
        ctaTextAr: plan.ctaTextAr,
      };

      // ── SKU fields ───────────────────────────────────────────────────
      const priceHalala = body['priceHalala'] as number | undefined;
      const priceSAR    = body['priceSAR']    as number | undefined;
      if (priceHalala != null) {
        if (!Number.isInteger(priceHalala) || priceHalala < 0) {
          throw AppError.badRequest('priceHalala must be a non-negative integer');
        }
        plan.priceHalala = priceHalala;
      } else if (priceSAR != null) {
        if (priceSAR < 0) throw AppError.badRequest('priceSAR must be non-negative');
        plan.priceHalala = sarToHalala(priceSAR);
      }
      if (typeof body['nameEn']   === 'string')  plan.nameEn   = body['nameEn']   as string;
      if (typeof body['nameAr']   === 'string')  plan.nameAr   = body['nameAr']   as string;
      if (typeof body['isActive'] === 'boolean') plan.isActive = body['isActive'] as boolean;

      // ── Entitlements bag — validate every value against the registry ──
      if (body['entitlements'] && typeof body['entitlements'] === 'object') {
        const incoming = body['entitlements'] as Record<string, unknown>;
        const next: EntitlementBag = { ...(plan.entitlements ?? {}) };
        for (const entry of ENTITLEMENTS_BY_AUDIENCE[plan.type]) {
          if (Object.prototype.hasOwnProperty.call(incoming, entry.key)) {
            try {
              next[entry.key] = validateEntitlementValue(entry, incoming[entry.key]);
            } catch (e) {
              throw AppError.badRequest((e as Error).message);
            }
          }
        }
        // Keys for the wrong audience are silently dropped — saves the UI
        // from having to know per-plan-type which inputs to render.
        plan.entitlements = next;
        plan.markModified('entitlements');
      }

      // ── Marketing fields ─────────────────────────────────────────────
      if ('descriptionEn'      in body) plan.descriptionEn      = (body['descriptionEn']      as string | null) ?? undefined;
      if ('descriptionAr'      in body) plan.descriptionAr      = (body['descriptionAr']      as string | null) ?? undefined;
      if ('ctaTextEn'          in body) plan.ctaTextEn          = (body['ctaTextEn']          as string | null) ?? undefined;
      if ('ctaTextAr'          in body) plan.ctaTextAr          = (body['ctaTextAr']          as string | null) ?? undefined;
      if (Array.isArray(body['marketingBulletsEn'])) {
        plan.marketingBulletsEn = (body['marketingBulletsEn'] as unknown[])
          .filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
          .map((b) => b.trim().slice(0, 200));
      }
      if (Array.isArray(body['marketingBulletsAr'])) {
        plan.marketingBulletsAr = (body['marketingBulletsAr'] as unknown[])
          .filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
          .map((b) => b.trim().slice(0, 200));
      }
      if (typeof body['displayOrder']  === 'number')  plan.displayOrder  = body['displayOrder']  as number;
      if (typeof body['isHighlighted'] === 'boolean') plan.isHighlighted = body['isHighlighted'] as boolean;

      // Bump effectiveFrom on a price change so a future versioned-pricing
      // table can use it as the cutover marker.
      if (priceSAR != null || priceHalala != null) {
        plan.effectiveFrom = new Date();
      }

      await plan.save();

      void auditService.record({
        actor: actorFromRequest(req),
        action: 'plan.update',
        targetType: 'PricingPlan',
        targetId: String(id),
        targetLabel: plan.code,
        before,
        after: {
          priceHalala: plan.priceHalala,
          nameEn: plan.nameEn,
          nameAr: plan.nameAr,
          isActive: plan.isActive,
          entitlements: plan.entitlements,
          descriptionEn: plan.descriptionEn,
          descriptionAr: plan.descriptionAr,
          marketingBulletsEn: plan.marketingBulletsEn,
          marketingBulletsAr: plan.marketingBulletsAr,
          displayOrder: plan.displayOrder,
          isHighlighted: plan.isHighlighted,
          ctaTextEn: plan.ctaTextEn,
          ctaTextAr: plan.ctaTextAr,
        },
        req,
      });

      res.json({ success: true, data: plan });
    } catch (err) {
      next(err);
    }
  }
}

export const adminPricingController = new AdminPricingController();
