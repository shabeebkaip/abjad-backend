import path from 'path';
import multer from 'multer';
import { RequestHandler } from 'express';
import { config } from '../config';
import { AppError } from '../utils/app-error.util';

interface FileRule {
  mimes: string[];
  exts: string[];
}

const IMAGE: FileRule = {
  mimes: ['image/jpeg', 'image/png', 'image/webp'],
  exts: ['.jpg', '.jpeg', '.png', '.webp'],
};
const PDF: FileRule = { mimes: ['application/pdf'], exts: ['.pdf'] };
const WORD: FileRule = {
  mimes: ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  exts: ['.doc', '.docx'],
};
const merge = (...rules: FileRule[]): FileRule => ({
  mimes: rules.flatMap((r) => r.mimes),
  exts: rules.flatMap((r) => r.exts),
});

// iPadOS/Safari sends files picked from the Files app (e.g. Downloads) with a
// generic or empty MIME type. For those we fall back to the file extension.
// ponytail: extension/MIME are client-supplied either way; add magic-byte
// sniffing if uploads are ever served from our own origin.
const GENERIC_MIMES = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

export function isAllowedFile(rule: FileRule, mimetype: string, originalname: string): boolean {
  if (rule.mimes.includes(mimetype)) return true;
  return GENERIC_MIMES.has(mimetype ?? '') && rule.exts.includes(path.extname(originalname ?? '').toLowerCase());
}

// SRD 3.1.1: school logo capped at 2MB.
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
// CVs: 10MB — matches the UI copy; scanned PDFs from iPad often exceed 5MB.
// Cloudinary's per-file cap on the current plan is also 10MB.
const CV_MAX_BYTES = 10 * 1024 * 1024;

const storage = multer.memoryStorage();

function buildUploader(rule: FileRule, maxBytes: number = config.upload.maxSize): RequestHandler {
  return multer({
    storage,
    limits: { fileSize: maxBytes },
    fileFilter: (_req, file, cb) => {
      if (isAllowedFile(rule, file.mimetype, file.originalname)) return cb(null, true);
      cb(AppError.badRequest(`Unsupported file type. Allowed: ${rule.exts.join(', ')}`));
    },
  }).single('file');
}

// Single image (e.g. teacher profile photo) — uses the project-wide default cap.
export const uploadImage: RequestHandler = buildUploader(IMAGE);

// Logo upload (school logos) — explicit 2MB cap per SRD 3.1.1.
export const uploadLogo: RequestHandler = buildUploader(IMAGE, LOGO_MAX_BYTES);

// Single PDF document (school documents, certifications, offer contracts)
export const uploadDocument: RequestHandler = buildUploader(PDF);

// Teacher CV / education certificate — PDF or Word (client feedback R1 §3.2)
export const uploadCvDocument: RequestHandler = buildUploader(merge(PDF, WORD), CV_MAX_BYTES);
