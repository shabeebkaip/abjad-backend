import { Router } from 'express';
import { schoolDashboardController } from './school-dashboard.controller';
import { authenticate, authorize } from '../../middlewares/auth';

const router = Router();

router.use(authenticate, authorize('school'));

router.get('/', schoolDashboardController.getDashboard.bind(schoolDashboardController));
router.get('/analytics', schoolDashboardController.getAnalytics.bind(schoolDashboardController));
router.get('/jobs/:jobId/analytics', schoolDashboardController.getJobAnalytics.bind(schoolDashboardController));

export default router;
