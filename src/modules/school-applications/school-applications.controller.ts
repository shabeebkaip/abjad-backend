import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { schoolApplicationsService } from './school-applications.service';

export class SchoolApplicationsController {
  async listApplications(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jobId, status, page, limit } = req.query;
      const result = await schoolApplicationsService.listApplications(req.user!.userId, {
        jobId: jobId as string,
        status: status as string,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getApplication(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const app = await schoolApplicationsService.getApplication(
        req.user!.userId,
        String(req.params.applicationId)
      );
      res.json({ success: true, data: app });
    } catch (err) {
      next(err);
    }
  }

  async updateStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { status, note, rejectionReason } = req.body;
      const app = await schoolApplicationsService.updateStatus(
        req.user!.userId,
        String(req.params.applicationId),
        status,
        { note, rejectionReason }
      );
      res.json({ success: true, data: app });
    } catch (err) {
      next(err);
    }
  }

  async getJobStats(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await schoolApplicationsService.getJobApplicationStats(
        req.user!.userId,
        String(req.params.jobId)
      );
      res.json({ success: true, data: stats });
    } catch (err) {
      next(err);
    }
  }
}

export const schoolApplicationsController = new SchoolApplicationsController();
