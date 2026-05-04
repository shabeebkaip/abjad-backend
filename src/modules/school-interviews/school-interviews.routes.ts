import { Router } from 'express';
import { schoolInterviewsController } from './school-interviews.controller';
import { authenticate, authorize } from '../../middlewares/auth';

const router = Router();

router.use(authenticate, authorize('school'));

router.post('/', schoolInterviewsController.scheduleInterview.bind(schoolInterviewsController));
router.get('/', schoolInterviewsController.listInterviews.bind(schoolInterviewsController));
router.get('/:interviewId', schoolInterviewsController.getInterview.bind(schoolInterviewsController));
router.patch('/:interviewId', schoolInterviewsController.updateInterview.bind(schoolInterviewsController));
router.post('/:interviewId/cancel', schoolInterviewsController.cancelInterview.bind(schoolInterviewsController));
router.post('/:interviewId/complete', schoolInterviewsController.completeInterview.bind(schoolInterviewsController));

export default router;
