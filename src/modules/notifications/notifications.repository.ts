import mongoose from 'mongoose';
import { Notification, INotification, NotificationType } from '../../models/notification.model';

export class NotificationsRepository {
  async create(data: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<INotification> {
    return Notification.create({
      userId: new mongoose.Types.ObjectId(data.userId),
      type: data.type,
      title: data.title,
      body: data.body,
      data: data.data,
    });
  }

  async findByUser(
    userId: string,
    type?: NotificationType,
    unreadOnly?: boolean,
    page = 1,
    limit = 20,
    search?: string,
  ): Promise<{ notifications: INotification[]; total: number; unreadCount: number }> {
    const query: Record<string, unknown> = { userId: new mongoose.Types.ObjectId(userId) };
    if (type) query.type = type;
    if (unreadOnly) query.isRead = false;

    // SRD 2.8.3 — case-insensitive substring search across title + body
    const trimmed = search?.trim();
    if (trimmed) {
      const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      query.$or = [{ title: regex }, { body: regex }];
    }

    const skip = (page - 1) * limit;
    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Notification.countDocuments(query),
      Notification.countDocuments({ userId: new mongoose.Types.ObjectId(userId), isRead: false }),
    ]);

    return { notifications: notifications as INotification[], total, unreadCount };
  }

  async markRead(notificationId: string, userId: string): Promise<void> {
    await Notification.updateOne(
      { _id: new mongoose.Types.ObjectId(notificationId), userId: new mongoose.Types.ObjectId(userId) },
      { $set: { isRead: true, readAt: new Date() } }
    );
  }

  // SRD 2.8.3 — flip a notification back to unread
  async markUnread(notificationId: string, userId: string): Promise<void> {
    await Notification.updateOne(
      { _id: new mongoose.Types.ObjectId(notificationId), userId: new mongoose.Types.ObjectId(userId) },
      { $set: { isRead: false }, $unset: { readAt: 1 } },
    );
  }

  async markAllRead(userId: string): Promise<void> {
    await Notification.updateMany(
      { userId: new mongoose.Types.ObjectId(userId), isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );
  }

  async delete(notificationId: string, userId: string): Promise<void> {
    await Notification.deleteOne({
      _id: new mongoose.Types.ObjectId(notificationId),
      userId: new mongoose.Types.ObjectId(userId),
    });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return Notification.countDocuments({ userId: new mongoose.Types.ObjectId(userId), isRead: false });
  }
}

export const notificationsRepository = new NotificationsRepository();
