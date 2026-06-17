import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { activityService, ActivityCategory } from './activity.service';

const ALLOWED_CATEGORIES = new Set<ActivityCategory>([
  'verification', 'support', 'billing', 'configuration', 'content', 'auth', 'other',
]);

function parseDate(v: unknown): Date | undefined {
  if (typeof v !== 'string' || !v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

export class ActivityController {
  // GET /admin/activity-stream?since=<iso>&category=<cat>&actorId=<id>&limit=50
  async stream(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { since, category, actorId, limit } = req.query;
      const cat = typeof category === 'string' && ALLOWED_CATEGORIES.has(category as ActivityCategory)
        ? (category as ActivityCategory)
        : undefined;
      const data = await activityService.stream({
        since: parseDate(since),
        category: cat,
        actorId: typeof actorId === 'string' ? actorId : undefined,
        limit: limit ? Number(limit) : 50,
      });
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  // GET /admin/admin-metrics
  async metrics(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await activityService.metrics();
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
}

export const activityController = new ActivityController();
