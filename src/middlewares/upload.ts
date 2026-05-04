import multer from 'multer';
import { RequestHandler } from 'express';
import { config } from '../config';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_DOC_TYPES = ['application/pdf'];
const ALLOWED_ALL_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOC_TYPES];

const storage = multer.memoryStorage();

function buildUploader(allowedMimes: string[]): RequestHandler {
  return multer({
    storage,
    limits: { fileSize: config.upload.maxSize },
    fileFilter: (_req, file, cb) => {
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`Unsupported file type: ${file.mimetype}`));
      }
    },
  }).single('file');
}

// Single image (e.g. profile photo)
export const uploadImage: RequestHandler = buildUploader(ALLOWED_IMAGE_TYPES);

// Single PDF document (certificates, resumes)
export const uploadDocument: RequestHandler = buildUploader(ALLOWED_DOC_TYPES);

// Any allowed type
export const uploadAny: RequestHandler = buildUploader(ALLOWED_ALL_TYPES);
