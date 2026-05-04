import { Router } from 'express';
import { schoolShortlistController } from './school-shortlist.controller';
import { authenticate, authorize } from '../../middlewares/auth';

const router = Router();

router.use(authenticate, authorize('school'));

router.post('/', schoolShortlistController.createShortlist.bind(schoolShortlistController));
router.get('/', schoolShortlistController.listShortlists.bind(schoolShortlistController));
router.get('/:shortlistId', schoolShortlistController.getShortlist.bind(schoolShortlistController));
router.patch('/:shortlistId', schoolShortlistController.updateShortlist.bind(schoolShortlistController));
router.delete('/:shortlistId', schoolShortlistController.deleteShortlist.bind(schoolShortlistController));
router.post('/:shortlistId/teachers', schoolShortlistController.addTeacher.bind(schoolShortlistController));
router.delete('/:shortlistId/teachers/:teacherId', schoolShortlistController.removeTeacher.bind(schoolShortlistController));

export default router;
