import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { queueService, QueueItemType } from './queue.service';
import { QueueTargetType } from '../../models/queue-claim.model';
import { auditService, actorFromRequest } from '../audit/audit.service';
import { AppError } from '../../utils/app-error.util';

const VALID_TARGET_TYPES: QueueTargetType[] = ['TeacherProfile', 'SchoolProfile', 'Invoice', 'Ticket'];

function validateTargetType(t: unknown): QueueTargetType {
  if (typeof t !== 'string' || !VALID_TARGET_TYPES.includes(t as QueueTargetType)) {
    throw AppError.badRequest(`targetType must be one of: ${VALID_TARGET_TYPES.join(', ')}`);
  }
  return t as QueueTargetType;
}

export class QueueController {
  /**
   * GET /api/admin/queue
   * Query: type, view, search, page, limit
   */
  async list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { type, view, search, page, limit } = req.query;
      const result = await queueService.list(
        {
          type: type as QueueItemType | 'all',
          view: view as 'inbox' | 'mine' | 'snoozed' | 'sla_at_risk',
          search: search as string,
          page: page ? Number(page) : 1,
          limit: limit ? Number(limit) : 50,
        },
        req.user!.userId,
      );
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  /**
   * POST /api/admin/queue/claim
   * Body: { targetType, targetId }
   */
  async claim(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { targetType, targetId } = req.body as { targetType?: string; targetId?: string };
      if (!targetId) throw AppError.badRequest('targetId is required');
      const type = validateTargetType(targetType);

      const claim = await queueService.claim({
        targetType: type,
        targetId,
        adminUserId: req.user!.userId,
        adminEmail: req.user!.email,
      });
      void auditService.record({
        actor: actorFromRequest(req),
        action: 'queue.claim',
        targetType: type,
        targetId,
        req,
      });
      res.json({ success: true, data: claim });
    } catch (err) { next(err); }
  }

  /**
   * POST /api/admin/queue/unclaim
   */
  async unclaim(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { targetType, targetId } = req.body as { targetType?: string; targetId?: string };
      if (!targetId) throw AppError.badRequest('targetId is required');
      const type = validateTargetType(targetType);
      await queueService.unclaim(type, targetId);
      void auditService.record({
        actor: actorFromRequest(req),
        action: 'queue.unclaim',
        targetType: type,
        targetId,
        req,
      });
      res.json({ success: true });
    } catch (err) { next(err); }
  }

  /**
   * POST /api/admin/queue/snooze
   * Body: { targetType, targetId, snoozedUntil (ISO), reason? }
   */
  async snooze(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { targetType, targetId, snoozedUntil, reason } = req.body as {
        targetType?: string;
        targetId?: string;
        snoozedUntil?: string;
        reason?: string;
      };
      if (!targetId) throw AppError.badRequest('targetId is required');
      if (!snoozedUntil) throw AppError.badRequest('snoozedUntil is required');
      const type = validateTargetType(targetType);
      const date = new Date(snoozedUntil);
      if (isNaN(date.getTime())) throw AppError.badRequest('Invalid snoozedUntil date');

      const claim = await queueService.snooze({
        targetType: type,
        targetId,
        snoozedUntil: date,
        snoozedReason: reason,
        adminUserId: req.user!.userId,
      });
      void auditService.record({
        actor: actorFromRequest(req),
        action: 'queue.snooze',
        targetType: type,
        targetId,
        notes: `Until ${date.toISOString()}${reason ? ` · ${reason}` : ''}`,
        req,
      });
      res.json({ success: true, data: claim });
    } catch (err) { next(err); }
  }

  /**
   * POST /api/admin/queue/unsnooze
   */
  async unsnooze(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { targetType, targetId } = req.body as { targetType?: string; targetId?: string };
      if (!targetId) throw AppError.badRequest('targetId is required');
      const type = validateTargetType(targetType);
      await queueService.unsnooze(type, targetId);
      void auditService.record({
        actor: actorFromRequest(req),
        action: 'queue.unsnooze',
        targetType: type,
        targetId,
        req,
      });
      res.json({ success: true });
    } catch (err) { next(err); }
  }
}

export const queueController = new QueueController();
