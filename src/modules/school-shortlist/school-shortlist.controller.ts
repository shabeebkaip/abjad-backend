import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { schoolShortlistService } from './school-shortlist.service';

export class SchoolShortlistController {
  async createShortlist(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const shortlist = await schoolShortlistService.createShortlist(req.user!.userId, req.body);
      res.status(201).json({ success: true, data: shortlist });
    } catch (err) {
      next(err);
    }
  }

  async listShortlists(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const includeArchived = req.query.archived === 'true';
      const shortlists = await schoolShortlistService.listShortlists(req.user!.userId, includeArchived);
      res.json({ success: true, data: shortlists });
    } catch (err) {
      next(err);
    }
  }

  async getShortlist(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const shortlist = await schoolShortlistService.getShortlist(
        req.user!.userId,
        String(req.params.shortlistId)
      );
      res.json({ success: true, data: shortlist });
    } catch (err) {
      next(err);
    }
  }

  async updateShortlist(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const shortlist = await schoolShortlistService.updateShortlist(
        req.user!.userId,
        String(req.params.shortlistId),
        req.body
      );
      res.json({ success: true, data: shortlist });
    } catch (err) {
      next(err);
    }
  }

  async deleteShortlist(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await schoolShortlistService.deleteShortlist(req.user!.userId, String(req.params.shortlistId));
      res.json({ success: true, message: 'Shortlist deleted' });
    } catch (err) {
      next(err);
    }
  }

  async addTeacher(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { teacherId, notes, tags } = req.body;
      const shortlist = await schoolShortlistService.addTeacher(
        req.user!.userId,
        String(req.params.shortlistId),
        teacherId,
        req.user!.userId,
        notes,
        tags
      );
      res.json({ success: true, data: shortlist });
    } catch (err) {
      next(err);
    }
  }

  async removeTeacher(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const shortlist = await schoolShortlistService.removeTeacher(
        req.user!.userId,
        String(req.params.shortlistId),
        String(req.params.teacherId)
      );
      res.json({ success: true, data: shortlist });
    } catch (err) {
      next(err);
    }
  }
}

export const schoolShortlistController = new SchoolShortlistController();
