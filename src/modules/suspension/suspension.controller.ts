import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { suspensionService } from './suspension.service';
import { SuspensionTargetType } from '../../models/suspension-event.model';
import { auditService, actorFromRequest } from '../audit/audit.service';
import { AppError } from '../../utils/app-error.util';

function adminActionFor(targetType: SuspensionTargetType, action: 'suspend' | 'reinstate'): string {
  // Mirrors audit-log action conventions used in admin.controller
  // (teacher.suspend, school.suspend, teacher.reinstate, school.reinstate)
  return `${targetType === 'TeacherProfile' ? 'teacher' : 'school'}.${action}`;
}

export class SuspensionController {
  // POST /admin/teachers/:profileId/suspend
  async suspendTeacher(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.runSuspend(req, res, 'TeacherProfile');
    } catch (err) { next(err); }
  }

  // POST /admin/schools/:profileId/suspend
  async suspendSchool(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.runSuspend(req, res, 'SchoolProfile');
    } catch (err) { next(err); }
  }

  // POST /admin/teachers/:profileId/reinstate
  async reinstateTeacher(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.runReinstate(req, res, 'TeacherProfile');
    } catch (err) { next(err); }
  }

  // POST /admin/schools/:profileId/reinstate
  async reinstateSchool(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.runReinstate(req, res, 'SchoolProfile');
    } catch (err) { next(err); }
  }

  // GET /admin/teachers/:profileId/suspensions
  async teacherHistory(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params['profileId']);
      const events = await suspensionService.history('TeacherProfile', id);
      res.json({ success: true, data: events });
    } catch (err) { next(err); }
  }

  // GET /admin/schools/:profileId/suspensions
  async schoolHistory(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params['profileId']);
      const events = await suspensionService.history('SchoolProfile', id);
      res.json({ success: true, data: events });
    } catch (err) { next(err); }
  }

  // ─── Shared helpers ─────────────────────────────────────────────────

  private async runSuspend(req: AuthRequest, res: Response, targetType: SuspensionTargetType) {
    const id = String(req.params['profileId']);
    if (!id) throw AppError.badRequest('profileId is required');
    const { reasonCode, reasonNotes } = req.body as { reasonCode?: string; reasonNotes?: string };

    const event = await suspensionService.suspend({
      targetType,
      targetId: id,
      reasonCode,
      reasonNotes,
      actorUserId: req.user!.userId,
      actorEmail:  req.user!.email,
    });

    void auditService.record({
      actor: actorFromRequest(req),
      action: adminActionFor(targetType, 'suspend'),
      targetType,
      targetId: id,
      reason: reasonCode as string,
      notes: reasonNotes,
      req,
    });

    res.json({ success: true, data: event });
  }

  private async runReinstate(req: AuthRequest, res: Response, targetType: SuspensionTargetType) {
    const id = String(req.params['profileId']);
    if (!id) throw AppError.badRequest('profileId is required');
    const { reasonCode, reasonNotes } = req.body as { reasonCode?: string; reasonNotes?: string };

    const event = await suspensionService.reinstate({
      targetType,
      targetId: id,
      reasonCode,
      reasonNotes,
      actorUserId: req.user!.userId,
      actorEmail:  req.user!.email,
    });

    void auditService.record({
      actor: actorFromRequest(req),
      action: adminActionFor(targetType, 'reinstate'),
      targetType,
      targetId: id,
      reason: reasonCode as string,
      notes: reasonNotes,
      req,
    });

    res.json({ success: true, data: event });
  }
}

export const suspensionController = new SuspensionController();
