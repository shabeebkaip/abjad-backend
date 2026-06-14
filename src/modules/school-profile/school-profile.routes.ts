import { Router } from 'express';
import { schoolProfileController } from './school-profile.controller';
import { authenticate, authorize } from '../../middlewares/auth';
import { uploadLogo, uploadDocument } from '../../middlewares/upload';

const router = Router();

router.use(authenticate, authorize('school'));

router.get('/', schoolProfileController.getProfile.bind(schoolProfileController));
router.patch('/basic', schoolProfileController.updateBasic.bind(schoolProfileController));
router.patch('/location', schoolProfileController.updateLocation.bind(schoolProfileController));
router.patch('/contact', schoolProfileController.updateContact.bind(schoolProfileController));
router.patch('/admin-contact', schoolProfileController.updateAdminContact.bind(schoolProfileController));
router.patch('/credentials', schoolProfileController.updateCredentials.bind(schoolProfileController));
router.post('/logo', uploadLogo, schoolProfileController.uploadLogo.bind(schoolProfileController));
router.post('/documents/:docType', uploadDocument, schoolProfileController.uploadDocument.bind(schoolProfileController));
router.post('/submit', schoolProfileController.submitForVerification.bind(schoolProfileController));

export default router;
