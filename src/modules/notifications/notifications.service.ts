import { notificationsRepository } from './notifications.repository';
import { INotification, NotificationType } from '../../models/notification.model';
import User from '../../models/user.model';
import { AppError } from '../../utils/app-error.util';

// SRD 2.8.2 — shape returned by GET /api/notifications/preferences
export interface NotificationPreferencesPayload {
  emailNotificationsEnabled: boolean;
  pushNotificationsEnabled: boolean;
  soundEnabled: boolean;
  notificationPreferences: {
    job_match: boolean;
    application_status: boolean;
    interview_invitation: boolean;
    interview_reminder: boolean;
    offer_received: boolean;
    message: boolean;
    profile_status: boolean;
    system: boolean;
  };
}

const TYPE_KEYS = [
  'job_match','application_status','interview_invitation','interview_reminder',
  'offer_received','message','profile_status','system',
] as const;

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

  // SRD 2.8.2 — read the user's notification preferences. Returns defaults
  // (everything enabled) if the user record is missing the fields entirely.
  async getPreferences(userId: string): Promise<NotificationPreferencesPayload> {
    const user = await User.findById(userId)
      .select('emailNotificationsEnabled pushNotificationsEnabled soundEnabled notificationPreferences')
      .lean();
    if (!user) throw AppError.notFound('User not found');

    const prefs = (user.notificationPreferences ?? {}) as Partial<NotificationPreferencesPayload['notificationPreferences']>;
    const fullPrefs = Object.fromEntries(
      TYPE_KEYS.map((k) => [k, prefs[k] ?? true]),
    ) as NotificationPreferencesPayload['notificationPreferences'];

    return {
      emailNotificationsEnabled: user.emailNotificationsEnabled ?? true,
      pushNotificationsEnabled:  user.pushNotificationsEnabled ?? true,
      soundEnabled:              user.soundEnabled ?? true,
      notificationPreferences:   fullPrefs,
    };
  }

  // SRD 2.8.2 — patch the user's notification preferences. Accepts any subset
  // of the channel toggles + the per-type map; only known fields are written.
  async updatePreferences(
    userId: string,
    data: Partial<NotificationPreferencesPayload>,
  ): Promise<NotificationPreferencesPayload> {
    const $set: Record<string, unknown> = {};
    if (typeof data.emailNotificationsEnabled === 'boolean') $set.emailNotificationsEnabled = data.emailNotificationsEnabled;
    if (typeof data.pushNotificationsEnabled  === 'boolean') $set.pushNotificationsEnabled  = data.pushNotificationsEnabled;
    if (typeof data.soundEnabled              === 'boolean') $set.soundEnabled              = data.soundEnabled;

    if (data.notificationPreferences && typeof data.notificationPreferences === 'object') {
      for (const k of TYPE_KEYS) {
        const v = data.notificationPreferences[k];
        if (typeof v === 'boolean') $set[`notificationPreferences.${k}`] = v;
      }
    }

    if (Object.keys($set).length === 0) {
      throw AppError.badRequest('No valid preference fields supplied');
    }

    await User.updateOne({ _id: userId }, { $set });
    return this.getPreferences(userId);
  }
}

export const notificationsService = new NotificationsService();
