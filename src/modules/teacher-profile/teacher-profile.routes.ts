import { Router } from 'express';
import { teacherProfileController } from './teacher-profile.controller';
import { authenticate, authorize } from '../../middlewares/auth';
import { uploadImage, uploadDocument } from '../../middlewares/upload';

const router = Router();

// All routes require authentication and teacher role
router.use(authenticate, authorize('teacher'));

// Profile overview
router.get('/', teacherProfileController.getProfile.bind(teacherProfileController));

// Section updates
router.patch('/personal', teacherProfileController.updatePersonal.bind(teacherProfileController));
router.patch('/professional', teacherProfileController.updateProfessional.bind(teacherProfileController));
router.patch('/education', teacherProfileController.updateEducation.bind(teacherProfileController));
router.patch('/languages', teacherProfileController.updateLanguages.bind(teacherProfileController));
router.patch('/location', teacherProfileController.updateLocationPreferences.bind(teacherProfileController));
router.patch('/salary', teacherProfileController.updateSalaryExpectations.bind(teacherProfileController));

// Certifications
router.post('/certifications', teacherProfileController.addCertification.bind(teacherProfileController));
router.delete('/certifications/:certId', teacherProfileController.removeCertification.bind(teacherProfileController));
router.post('/certifications/:certId/upload', uploadDocument, teacherProfileController.uploadCertificateFile.bind(teacherProfileController));

// File uploads
router.post('/photo', uploadImage, teacherProfileController.uploadPhoto.bind(teacherProfileController));
router.post('/resume', uploadDocument, teacherProfileController.uploadResume.bind(teacherProfileController));
router.post('/education/certificate', uploadDocument, teacherProfileController.uploadEducationCertificate.bind(teacherProfileController));

// Submit for approval
router.post('/submit', teacherProfileController.submitForApproval.bind(teacherProfileController));

export default router;
