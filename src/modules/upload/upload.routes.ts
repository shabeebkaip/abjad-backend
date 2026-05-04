import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { uploadAny } from '../../middlewares/upload';
import { uploadFile, deleteFile } from './upload.controller';

const router = Router();

// All upload routes require authentication
router.use(authenticate);

// POST /api/upload?folder=photos|certificates|resumes|documents
// field name: "file"
router.post('/', uploadAny, uploadFile);

// DELETE /api/upload  — body: { publicId, resourceType? }
router.delete('/', deleteFile);

export default router;
