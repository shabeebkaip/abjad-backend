import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { schoolJobsService } from './school-jobs.service';

export class SchoolJobsController {
  async createJob(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const job = await schoolJobsService.createJob(req.user!.userId, req.body);
      res.status(201).json({ success: true, data: job });
    } catch (err) {
      next(err);
    }
  }

  async listJobs(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { status, city, page, limit } = req.query;
      const result = await schoolJobsService.listJobs(req.user!.userId, {
        status: status as string,
        city: city as string,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getJob(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const job = await schoolJobsService.getJob(req.user!.userId, String(req.params.jobId));
      res.json({ success: true, data: job });
    } catch (err) {
      next(err);
    }
  }

  async updateJob(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const job = await schoolJobsService.updateJob(req.user!.userId, String(req.params.jobId), req.body);
      res.json({ success: true, data: job });
    } catch (err) {
      next(err);
    }
  }

  async publishJob(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const job = await schoolJobsService.publishJob(req.user!.userId, String(req.params.jobId));
      res.json({ success: true, data: job, message: 'Job published successfully' });
    } catch (err) {
      next(err);
    }
  }

  async closeJob(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const job = await schoolJobsService.closeJob(req.user!.userId, String(req.params.jobId));
      res.json({ success: true, data: job, message: 'Job closed' });
    } catch (err) {
      next(err);
    }
  }

  async deleteJob(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await schoolJobsService.deleteJob(req.user!.userId, String(req.params.jobId));
      res.json({ success: true, message: 'Job deleted' });
    } catch (err) {
      next(err);
    }
  }

  async getJobStats(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await schoolJobsService.getJobStats(req.user!.userId, String(req.params.jobId));
      res.json({ success: true, data: stats });
    } catch (err) {
      next(err);
    }
  }
}

export const schoolJobsController = new SchoolJobsController();
