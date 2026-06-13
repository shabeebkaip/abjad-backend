// Internal endpoints — meant to be called by schedulers / cron, not end users.
// Auth via a shared secret in the `X-Cron-Secret` header (or Vercel's standard
// `Authorization: Bearer ${CRON_SECRET}`). Endpoints are no-ops if the secret
// is missing/wrong.

import { Router, Request, Response, NextFunction } from 'express';
import { processReminders } from '../../workers/interview-reminder.worker';

const router = Router();

function requireCronSecret(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // No secret configured — endpoint is locked in production. Allow in dev
    // so local testing works without ceremony.
    if (process.env.NODE_ENV === 'production') {
      res.status(503).json({ success: false, message: 'CRON_SECRET not configured' });
      return;
    }
    next();
    return;
  }
  const header = req.get('x-cron-secret') ?? req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (header !== expected) {
    res.status(401).json({ success: false, message: 'Invalid cron secret' });
    return;
  }
  next();
}

// SRD 2.6.3 — fired by Vercel Cron / external scheduler every ~5 min in prod.
router.post('/process-reminders', requireCronSecret, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await processReminders();
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

export default router;
