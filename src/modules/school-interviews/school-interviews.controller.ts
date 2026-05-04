import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { schoolInterviewsService } from './school-interviews.service';

export class SchoolInterviewsController {
  async scheduleInterview(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const interview = await schoolInterviewsService.scheduleInterview(req.user!.userId, req.body);
      res.status(201).json({ success: true, data: interview });
    } catch (err) {
      next(err);
    }
  }

  async listInterviews(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { status, jobId, page, limit } = req.query;
      const result = await schoolInterviewsService.listInterviews(req.user!.userId, {
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

  async getInterview(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const interview = await schoolInterviewsService.getInterview(
        req.user!.userId,
        String(req.params.interviewId)
      );
      res.json({ success: true, data: interview });
    } catch (err) {
      next(err);
    }
  }

  async updateInterview(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const interview = await schoolInterviewsService.updateInterview(
        req.user!.userId,
        String(req.params.interviewId),
        req.body
      );
      res.json({ success: true, data: interview });
    } catch (err) {
      next(err);
    }
  }

  async cancelInterview(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const interview = await schoolInterviewsService.cancelInterview(
        req.user!.userId,
        String(req.params.interviewId)
      );
      res.json({ success: true, data: interview, message: 'Interview cancelled' });
    } catch (err) {
      next(err);
    }
  }

  async completeInterview(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const interview = await schoolInterviewsService.completeInterview(
        req.user!.userId,
        String(req.params.interviewId),
        req.body
      );
      res.json({ success: true, data: interview });
    } catch (err) {
      next(err);
    }
  }
}

export const schoolInterviewsController = new SchoolInterviewsController();
