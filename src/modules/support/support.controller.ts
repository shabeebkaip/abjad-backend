import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { supportService } from './support.service';

export class SupportController {
  async createTicket(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { category, subject, description, attachments } = req.body;
      const ticket = await supportService.createTicket(
        req.user!.userId,
        req.user!.role as 'teacher' | 'school',
        { category, subject, description, attachments }
      );
      res.status(201).json({ success: true, data: ticket });
    } catch (err) {
      next(err);
    }
  }

  async listTickets(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const status = req.query.status as string | undefined;
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const result = await supportService.listTickets(req.user!.userId, status, page, limit);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getTicket(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ticket = await supportService.getTicket(req.user!.userId, String(req.params.ticketId));
      res.json({ success: true, data: ticket });
    } catch (err) {
      next(err);
    }
  }

  async addReply(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { content, attachments } = req.body;
      const ticket = await supportService.addReply(
        req.user!.userId,
        req.user!.role as 'teacher' | 'school',
        String(req.params.ticketId),
        content,
        attachments
      );
      res.json({ success: true, data: ticket });
    } catch (err) {
      next(err);
    }
  }

  async closeTicket(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ticket = await supportService.closeTicket(req.user!.userId, String(req.params.ticketId));
      res.json({ success: true, data: ticket });
    } catch (err) {
      next(err);
    }
  }

  async submitFeedback(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const feedback = await supportService.submitFeedback(req.user!.userId, req.body);
      res.status(201).json({ success: true, data: feedback });
    } catch (err) {
      next(err);
    }
  }
}

export const supportController = new SupportController();
