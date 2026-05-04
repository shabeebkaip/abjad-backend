import { Router } from 'express';
import { dashboardController } from './dashboard.controller';
import { authenticate, authorize } from '../../middlewares/auth';

const router = Router();

router.get('/', authenticate, authorize('teacher'), dashboardController.getTeacherDashboard.bind(dashboardController));

export default router;
