import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { templateService } from './template.service';
import { auditService, actorFromRequest } from '../audit/audit.service';

export class TemplateController {
  // GET /admin/email-templates
  async list(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await templateService.list();
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  // GET /admin/email-templates/:key
  async get(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await templateService.get(req.params['key'] as string);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  // PATCH /admin/email-templates/:key
  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const key = req.params['key'] as string;
      const row = await templateService.update(
        key,
        { subject: req.body.subject, body: req.body.body },
        req.user!.userId,
      );
      void auditService.record({
        actor: actorFromRequest(req),
        action: 'email_template.update',
        targetType: 'EmailTemplate',
        targetId: row._id?.toString() ?? key,
        targetLabel: key,
        after: { subject: row.subject },
        req,
      });
      res.json({ success: true, data: row });
    } catch (err) { next(err); }
  }

  // POST /admin/email-templates/:key/reset
  async reset(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const key = req.params['key'] as string;
      await templateService.reset(key);
      void auditService.record({
        actor: actorFromRequest(req),
        action: 'email_template.reset',
        targetType: 'EmailTemplate',
        targetId: key,
        targetLabel: key,
        req,
      });
      res.json({ success: true });
    } catch (err) { next(err); }
  }
}

export const templateController = new TemplateController();
