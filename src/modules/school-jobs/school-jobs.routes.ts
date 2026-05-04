import { Router } from 'express';
import { schoolJobsController } from './school-jobs.controller';
import { authenticate, authorize } from '../../middlewares/auth';

const router = Router();

router.use(authenticate, authorize('school'));

router.post('/', schoolJobsController.createJob.bind(schoolJobsController));
router.get('/', schoolJobsController.listJobs.bind(schoolJobsController));
router.get('/:jobId', schoolJobsController.getJob.bind(schoolJobsController));
router.patch('/:jobId', schoolJobsController.updateJob.bind(schoolJobsController));
router.post('/:jobId/publish', schoolJobsController.publishJob.bind(schoolJobsController));
router.post('/:jobId/close', schoolJobsController.closeJob.bind(schoolJobsController));
router.delete('/:jobId', schoolJobsController.deleteJob.bind(schoolJobsController));
router.get('/:jobId/stats', schoolJobsController.getJobStats.bind(schoolJobsController));

export default router;
