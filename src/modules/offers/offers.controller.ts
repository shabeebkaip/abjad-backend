import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { offersService } from './offers.service';
import { OfferStatus } from '../../models/offer.model';

export class OffersController {
  async listOffers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const status = req.query.status as OfferStatus | undefined;
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const result = await offersService.listOffers(req.user!.userId, status, page, limit);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getOffer(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const offer = await offersService.getOffer(req.user!.userId, String(req.params.offerId));
      res.json({ success: true, data: offer });
    } catch (err) {
      next(err);
    }
  }

  async respond(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { action, reason, counterSalary, message } = req.body;
      const offer = await offersService.respond(
        req.user!.userId,
        String(req.params.offerId),
        action,
        reason,
        counterSalary,
        message
      );
      res.json({ success: true, data: offer });
    } catch (err) {
      next(err);
    }
  }
}

export const offersController = new OffersController();
