import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { dashboardService } from './dashboard.service';

export class DashboardController {
  async getTeacherDashboard(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await dashboardService.getTeacherDashboard(req.user!.userId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
}

export const dashboardController = new DashboardController();
