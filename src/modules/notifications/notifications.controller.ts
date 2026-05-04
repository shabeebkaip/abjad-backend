import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { notificationsService } from './notifications.service';
import { NotificationType } from '../../models/notification.model';

export class NotificationsController {
  async list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const type = req.query.type as NotificationType | undefined;
      const unreadOnly = req.query.unreadOnly === 'true';
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const result = await notificationsService.listNotifications(req.user!.userId, type, unreadOnly, page, limit);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async markRead(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await notificationsService.markRead(req.user!.userId, String(req.params.notificationId));
      res.json({ success: true, message: 'Marked as read' });
    } catch (err) {
      next(err);
    }
  }

  async markAllRead(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await notificationsService.markAllRead(req.user!.userId);
      res.json({ success: true, message: 'All notifications marked as read' });
    } catch (err) {
      next(err);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await notificationsService.delete(req.user!.userId, String(req.params.notificationId));
      res.json({ success: true, message: 'Notification deleted' });
    } catch (err) {
      next(err);
    }
  }

  async getUnreadCount(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const count = await notificationsService.getUnreadCount(req.user!.userId);
      res.json({ success: true, data: { count } });
    } catch (err) {
      next(err);
    }
  }
}

export const notificationsController = new NotificationsController();
