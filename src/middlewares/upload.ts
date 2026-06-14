import multer from 'multer';
import { RequestHandler } from 'express';
import { config } from '../config';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_DOC_TYPES = ['application/pdf'];
const ALLOWED_ALL_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOC_TYPES];

// SRD 3.1.1: school logo capped at 2MB.
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

const storage = multer.memoryStorage();

function buildUploader(allowedMimes: string[], maxBytes: number = config.upload.maxSize): RequestHandler {
  return multer({
    storage,
    limits: { fileSize: maxBytes },
    fileFilter: (_req, file, cb) => {
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`Unsupported file type: ${file.mimetype}`));
      }
    },
  }).single('file');
}

// Single image (e.g. teacher profile photo) — uses the project-wide default cap.
export const uploadImage: RequestHandler = buildUploader(ALLOWED_IMAGE_TYPES);

// Logo upload (school logos) — explicit 2MB cap per SRD 3.1.1.
export const uploadLogo: RequestHandler = buildUploader(ALLOWED_IMAGE_TYPES, LOGO_MAX_BYTES);

// Single PDF document (certificates, resumes)
export const uploadDocument: RequestHandler = buildUploader(ALLOWED_DOC_TYPES);

// Any allowed type
export const uploadAny: RequestHandler = buildUploader(ALLOWED_ALL_TYPES);
