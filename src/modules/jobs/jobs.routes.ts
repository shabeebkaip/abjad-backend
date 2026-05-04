import { Router } from 'express';
import { jobsController } from './jobs.controller';
import { authenticate, authorize, AuthRequest } from '../../middlewares/auth';
import { Response, NextFunction } from 'express';

const router = Router();

// Optional auth middleware — attaches user if token is present, but doesn't block if missing
const optionalAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return next();
  authenticate(req, res, next);
};

// Public job listing & detail (optional auth to surface isSaved)
router.get('/', optionalAuth, jobsController.listJobs.bind(jobsController));
router.get('/recommendations', authenticate, authorize('teacher'), jobsController.getRecommendations.bind(jobsController));
router.get('/saved', authenticate, authorize('teacher'), jobsController.getSavedJobs.bind(jobsController));
router.get('/:jobId', optionalAuth, jobsController.getJob.bind(jobsController));

// Saved jobs (teacher only)
router.post('/:jobId/save', authenticate, authorize('teacher'), jobsController.saveJob.bind(jobsController));
router.delete('/:jobId/save', authenticate, authorize('teacher'), jobsController.unsaveJob.bind(jobsController));

export default router;
