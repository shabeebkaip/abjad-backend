import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { schoolOffersService } from './school-offers.service';

export class SchoolOffersController {
  async extendOffer(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const offer = await schoolOffersService.extendOffer(req.user!.userId, req.body);
      res.status(201).json({ success: true, data: offer });
    } catch (err) {
      next(err);
    }
  }

  async listOffers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { status, jobId, page, limit } = req.query;
      const result = await schoolOffersService.listOffers(req.user!.userId, {
        status: status as string,
        jobId: jobId as string,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getOffer(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const offer = await schoolOffersService.getOffer(req.user!.userId, String(req.params.offerId));
      res.json({ success: true, data: offer });
    } catch (err) {
      next(err);
    }
  }

  async updateOffer(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const offer = await schoolOffersService.updateOffer(
        req.user!.userId,
        String(req.params.offerId),
        req.body
      );
      res.json({ success: true, data: offer });
    } catch (err) {
      next(err);
    }
  }

  async revokeOffer(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const offer = await schoolOffersService.revokeOffer(req.user!.userId, String(req.params.offerId));
      res.json({ success: true, data: offer, message: 'Offer revoked' });
    } catch (err) {
      next(err);
    }
  }

  async respondToNegotiation(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const offer = await schoolOffersService.respondToNegotiation(
        req.user!.userId,
        String(req.params.offerId),
        req.body
      );
      res.json({ success: true, data: offer });
    } catch (err) {
      next(err);
    }
  }

  async confirmHire(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const offer = await schoolOffersService.confirmHire(req.user!.userId, String(req.params.offerId));
      res.json({ success: true, data: offer, message: 'Hire confirmed' });
    } catch (err) {
      next(err);
    }
  }
}

export const schoolOffersController = new SchoolOffersController();
