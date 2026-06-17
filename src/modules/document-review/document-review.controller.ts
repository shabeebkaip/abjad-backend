import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { documentReviewService, DocAudience } from './document-review.service';
import { auditService, actorFromRequest } from '../audit/audit.service';

// Tier 2 #9 — Per-document approval. Two parallel route sets, one per
// audience (teacher/school). Same controller, same service, different mount
// paths in admin.routes.ts.

function audienceFromPath(req: AuthRequest): DocAudience {
  // The audience is encoded in the parent route prefix (/admin/teachers/...
  // or /admin/schools/...). Pull it from the originalUrl so we don't rely
  // on a separate param.
  return req.originalUrl.includes('/teachers/') ? 'teacher' : 'school';
}

function audienceTargetType(a: DocAudience) {
  return a === 'teacher' ? 'TeacherProfile' : 'SchoolProfile';
}

export class DocumentReviewController {
  // GET /admin/{teachers|schools}/:profileId/documents
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const audience = audienceFromPath(req);
      const data = await documentReviewService.inventory(audience, req.params['profileId'] as string);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  // POST /admin/{teachers|schools}/:profileId/documents/:docKey/approve
  async approve(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const audience = audienceFromPath(req);
      const profileId = req.params['profileId'] as string;
      const docKey = req.params['docKey'] as string;
      const data = await documentReviewService.decide(
        audience, profileId, docKey,
        { status: 'approved' },
        req.user!.userId,
      );
      void auditService.record({
        actor: actorFromRequest(req),
        action: 'document.approve',
        targetType: audienceTargetType(audience),
        targetId: profileId,
        targetLabel: docKey,
        after: { docKey, status: 'approved' },
        req,
      });
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  // POST /admin/{teachers|schools}/:profileId/documents/:docKey/reject
  async reject(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const audience = audienceFromPath(req);
      const profileId = req.params['profileId'] as string;
      const docKey = req.params['docKey'] as string;
      const reason = req.body?.reason as string | undefined;
      const data = await documentReviewService.decide(
        audience, profileId, docKey,
        { status: 'rejected', reason },
        req.user!.userId,
      );
      void auditService.record({
        actor: actorFromRequest(req),
        action: 'document.reject',
        targetType: audienceTargetType(audience),
        targetId: profileId,
        targetLabel: docKey,
        after: { docKey, status: 'rejected', reason },
        req,
      });
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  // POST /admin/{teachers|schools}/:profileId/documents/:docKey/reset
  async reset(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const audience = audienceFromPath(req);
      const profileId = req.params['profileId'] as string;
      const docKey = req.params['docKey'] as string;
      const data = await documentReviewService.resetDecision(audience, profileId, docKey);
      void auditService.record({
        actor: actorFromRequest(req),
        action: 'document.reset',
        targetType: audienceTargetType(audience),
        targetId: profileId,
        targetLabel: docKey,
        req,
      });
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
}

export const documentReviewController = new DocumentReviewController();
