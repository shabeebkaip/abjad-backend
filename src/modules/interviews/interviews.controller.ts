import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { interviewsService } from './interviews.service';
import { InterviewStatus } from '../../models/interview.model';

export class InterviewsController {
  async listInterviews(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const status = req.query.status as InterviewStatus | undefined;
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const result = await interviewsService.listInterviews(req.user!.userId, status, page, limit);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getInterview(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const interview = await interviewsService.getInterview(req.user!.userId, String(req.params.interviewId));
      res.json({ success: true, data: interview });
    } catch (err) {
      next(err);
    }
  }

  async respond(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { action, reason, proposedTime } = req.body;
      const interview = await interviewsService.respond(
        req.user!.userId,
        String(req.params.interviewId),
        action,
        reason,
        proposedTime ? new Date(proposedTime as string) : undefined
      );
      res.json({ success: true, data: interview });
    } catch (err) {
      next(err);
    }
  }

  async markCompleted(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const interview = await interviewsService.markCompleted(req.user!.userId, String(req.params.interviewId));
      res.json({ success: true, data: interview });
    } catch (err) {
      next(err);
    }
  }

  async getUpcoming(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const interviews = await interviewsService.getUpcoming(req.user!.userId);
      res.json({ success: true, data: interviews });
    } catch (err) {
      next(err);
    }
  }
}

export const interviewsController = new InterviewsController();
