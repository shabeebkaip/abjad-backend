import { Router } from 'express';
import { interviewsController } from './interviews.controller';
import { authenticate, authorize } from '../../middlewares/auth';

const router = Router();

router.use(authenticate, authorize('teacher'));

router.get('/', interviewsController.listInterviews.bind(interviewsController));
router.get('/upcoming', interviewsController.getUpcoming.bind(interviewsController));
router.get('/:interviewId', interviewsController.getInterview.bind(interviewsController));
router.patch('/:interviewId/respond', interviewsController.respond.bind(interviewsController));
router.patch('/:interviewId/complete', interviewsController.markCompleted.bind(interviewsController));

export default router;
