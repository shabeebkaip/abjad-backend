import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { pricingPageService } from './pricing-page.service';
import { auditService, actorFromRequest } from '../audit/audit.service';

export class PricingPageController {
  // GET /api/pricing/page?locale=ar|en — PUBLIC. Cacheable.
  async getPublicPayload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await pricingPageService.getPayload(req.query.locale as string | undefined);
      // Hint to CDN / fetch cache. The frontend is the primary cache (ISR);
      // this header is belt-and-braces in case anyone fetches the URL
      // directly without revalidation tagging.
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  // GET /api/admin/pricing-page?locale=ar|en — admin editor read
  async getAdminContent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await pricingPageService.getContentForAdmin(req.query.locale as string | undefined);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  // PATCH /api/admin/pricing-page?locale=ar|en — upsert edits
  async updateAdminContent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const locale = (req.query.locale as string | undefined) ?? 'en';
      const data = await pricingPageService.upsertContent(
        locale,
        req.body,
        req.user!.userId,
      );
      void auditService.record({
        actor: actorFromRequest(req),
        action: 'pricing_page.update',
        targetType: 'PricingPageContent',
        targetId: (data._id as { toString(): string } | undefined)?.toString() ?? locale,
        targetLabel: `pricing-page · ${locale}`,
        after: { locale },
        req,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
}

export const pricingPageController = new PricingPageController();
