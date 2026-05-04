import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { schoolTeamService } from './school-team.service';
import { SchoolTeamRole } from '../../models/school-team.model';

export class SchoolTeamController {
  async addMember(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const member = await schoolTeamService.addMember(
        req.user!.userId,
        req.user!.userId,
        req.body
      );
      res.status(201).json({ success: true, data: member });
    } catch (err) {
      next(err);
    }
  }

  async listMembers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const members = await schoolTeamService.listMembers(req.user!.userId);
      res.json({ success: true, data: members });
    } catch (err) {
      next(err);
    }
  }

  async getMyRole(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const member = await schoolTeamService.getMyRole(req.user!.userId, req.user!.userId);
      res.json({ success: true, data: member });
    } catch (err) {
      next(err);
    }
  }

  async updateRole(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const member = await schoolTeamService.updateRole(
        req.user!.userId,
        String(req.params.memberId),
        req.body.role as SchoolTeamRole,
        req.user!.userId
      );
      res.json({ success: true, data: member });
    } catch (err) {
      next(err);
    }
  }

  async removeMember(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await schoolTeamService.removeMember(
        req.user!.userId,
        String(req.params.memberId),
        req.user!.userId
      );
      res.json({ success: true, message: 'Team member removed' });
    } catch (err) {
      next(err);
    }
  }
}

export const schoolTeamController = new SchoolTeamController();
