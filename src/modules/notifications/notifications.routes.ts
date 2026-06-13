import { Router } from 'express';
import { notificationsController } from './notifications.controller';
import { authenticate } from '../../middlewares/auth';

const router = Router();

router.use(authenticate);

router.get('/', notificationsController.list.bind(notificationsController));
router.get('/unread-count', notificationsController.getUnreadCount.bind(notificationsController));
// SRD 2.8.2 — preferences come BEFORE /:notificationId/read so the
// parameterised route doesn't shadow them.
router.get('/preferences', notificationsController.getPreferences.bind(notificationsController));
router.patch('/preferences', notificationsController.updatePreferences.bind(notificationsController));
router.patch('/read-all', notificationsController.markAllRead.bind(notificationsController));
router.patch('/:notificationId/read', notificationsController.markRead.bind(notificationsController));
router.patch('/:notificationId/unread', notificationsController.markUnread.bind(notificationsController));
router.delete('/:notificationId', notificationsController.delete.bind(notificationsController));

export default router;
