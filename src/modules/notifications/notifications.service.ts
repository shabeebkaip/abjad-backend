import { notificationsRepository } from './notifications.repository';
import { INotification, NotificationType } from '../../models/notification.model';

export class NotificationsService {
  async listNotifications(
    userId: string,
    type?: NotificationType,
    unreadOnly?: boolean,
    page = 1,
    limit = 20
  ) {
    const result = await notificationsRepository.findByUser(userId, type, unreadOnly, page, limit);
    return { ...result, page, totalPages: Math.ceil(result.total / limit) };
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    await notificationsRepository.markRead(notificationId, userId);
  }

  async markAllRead(userId: string): Promise<void> {
    await notificationsRepository.markAllRead(userId);
  }

  async delete(userId: string, notificationId: string): Promise<void> {
    await notificationsRepository.delete(notificationId, userId);
  }

  async getUnreadCount(userId: string): Promise<number> {
    return notificationsRepository.getUnreadCount(userId);
  }

  // Used internally by other services to send notifications
  async send(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    data?: Record<string, string>
  ): Promise<INotification> {
    return notificationsRepository.create({ userId, type, title, body, data });
  }
}

export const notificationsService = new NotificationsService();
