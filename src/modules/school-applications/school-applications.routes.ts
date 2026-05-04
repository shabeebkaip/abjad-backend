import { Router } from 'express';
import { schoolApplicationsController } from './school-applications.controller';
import { authenticate, authorize } from '../../middlewares/auth';

const router = Router();

router.use(authenticate, authorize('school'));

router.get('/', schoolApplicationsController.listApplications.bind(schoolApplicationsController));
router.get('/:applicationId', schoolApplicationsController.getApplication.bind(schoolApplicationsController));
router.patch('/:applicationId/status', schoolApplicationsController.updateStatus.bind(schoolApplicationsController));
router.get('/jobs/:jobId/stats', schoolApplicationsController.getJobStats.bind(schoolApplicationsController));

export default router;
