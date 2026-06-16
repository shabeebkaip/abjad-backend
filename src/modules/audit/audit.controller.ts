import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { auditService } from './audit.service';

function parseDate(v: unknown): Date | undefined {
  if (typeof v !== 'string' || !v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

export class AuditController {
  /** GET /api/admin/audit-log */
  async list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { actorId, action, targetType, dateFrom, dateTo, page, limit } = req.query;
      const result = await auditService.listAll({
        actorId: actorId as string,
        action: action as string,
        targetType: targetType as string,
        dateFrom: parseDate(dateFrom),
        dateTo: parseDate(dateTo),
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 50,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/admin/audit-log/target/:type/:id */
  async forTarget(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { type, id } = req.params;
      const { page, limit } = req.query;
      const result = await auditService.listForTarget(String(type), String(id), {
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 50,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}

export const auditController = new AuditController();
