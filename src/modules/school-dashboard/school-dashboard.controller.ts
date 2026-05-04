import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { schoolDashboardService } from './school-dashboard.service';

export class SchoolDashboardController {
  async getDashboard(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await schoolDashboardService.getDashboard(req.user!.userId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async getAnalytics(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await schoolDashboardService.getAnalytics(req.user!.userId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async getJobAnalytics(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await schoolDashboardService.getJobAnalytics(
        req.user!.userId,
        String(req.params.jobId)
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
}

export const schoolDashboardController = new SchoolDashboardController();
