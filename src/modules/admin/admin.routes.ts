import { Router } from 'express';
import { adminController } from './admin.controller';
import { authenticate, authorize } from '../../middlewares/auth';

const router = Router();

// All admin routes require admin role
router.use(authenticate, authorize('admin'));

// Dashboard stats
router.get('/stats', adminController.getStats.bind(adminController));

// School verification
router.get('/schools', adminController.listSchools.bind(adminController));
router.get('/schools/:profileId', adminController.getSchool.bind(adminController));
router.post('/schools/:profileId/approve', adminController.approveSchool.bind(adminController));
router.post('/schools/:profileId/reject', adminController.rejectSchool.bind(adminController));

// Teacher verification
router.get('/teachers', adminController.listTeachers.bind(adminController));
router.get('/teachers/:profileId', adminController.getTeacher.bind(adminController));
router.post('/teachers/:profileId/approve', adminController.approveTeacher.bind(adminController));
router.post('/teachers/:profileId/reject', adminController.rejectTeacher.bind(adminController));

export default router;
