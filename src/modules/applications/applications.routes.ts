import { Router } from 'express';
import { applicationsController } from './applications.controller';
import { authenticate, authorize } from '../../middlewares/auth';

const router = Router();

router.use(authenticate, authorize('teacher'));

router.post('/', applicationsController.apply.bind(applicationsController));
router.get('/', applicationsController.listApplications.bind(applicationsController));
router.get('/stats', applicationsController.getStats.bind(applicationsController));
router.get('/:applicationId', applicationsController.getApplication.bind(applicationsController));
router.patch('/:applicationId/withdraw', applicationsController.withdraw.bind(applicationsController));

export default router;
