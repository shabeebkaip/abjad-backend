import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { applicationsService } from './applications.service';
import { ApplicationStatus } from '../../models/application.model';

export class ApplicationsController {
  async apply(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jobId, coverLetter } = req.body;
      const application = await applicationsService.apply(req.user!.userId, jobId, coverLetter);
      res.status(201).json({ success: true, data: application });
    } catch (err) {
      next(err);
    }
  }

  async withdraw(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const application = await applicationsService.withdraw(req.user!.userId, String(req.params.applicationId));
      res.json({ success: true, data: application });
    } catch (err) {
      next(err);
    }
  }

  async listApplications(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const status = req.query.status as ApplicationStatus | undefined;
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const result = await applicationsService.listApplications(req.user!.userId, status, page, limit);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getApplication(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const application = await applicationsService.getApplication(req.user!.userId, String(req.params.applicationId));
      res.json({ success: true, data: application });
    } catch (err) {
      next(err);
    }
  }

  async getStats(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await applicationsService.getStats(req.user!.userId);
      res.json({ success: true, data: stats });
    } catch (err) {
      next(err);
    }
  }
}

export const applicationsController = new ApplicationsController();
