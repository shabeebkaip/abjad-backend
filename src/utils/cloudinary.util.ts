import path from 'path';
import { randomUUID } from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config';

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
});

export type UploadFolder = 'photos' | 'certificates' | 'resumes' | 'documents' | 'school-logos' | 'school-documents' | 'contracts';

export interface CloudinaryUploadResult {
  url: string;
  secureUrl: string;
  publicId: string;
  format: string;
  bytes: number;
  originalFilename: string;
}

export function uploadToCloudinary(
  buffer: Buffer,
  folder: UploadFolder,
  options: { resourceType?: 'image' | 'raw' | 'auto'; filename?: string } = {}
): Promise<CloudinaryUploadResult> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `abjad/${folder}`,
        resource_type: options.resourceType ?? 'auto',
        use_filename: true,
        unique_filename: true,
        ...(options.filename && { public_id: options.filename }),
      },
      (error, result) => {
        if (error || !result) {
          return reject(error ?? new Error('Cloudinary upload failed'));
        }
        resolve({
          url: result.url,
          secureUrl: result.secure_url,
          publicId: result.public_id,
          format: result.format,
          bytes: result.bytes,
          originalFilename: result.original_filename,
        });
      }
    );

    uploadStream.end(buffer);
  });
}

// Word files are stored as Cloudinary "raw" assets. Raw assets keep no format
// metadata, so the extension must live in the public_id or the delivered URL
// downloads as an extension-less file nobody can open.
export function documentUploadOptions(originalName = ''): { resourceType?: 'raw'; filename?: string } {
  const ext = path.extname(originalName).toLowerCase();
  return ext === '.doc' || ext === '.docx' ? { resourceType: 'raw', filename: `${randomUUID()}${ext}` } : {};
}

export function deleteFromCloudinary(publicId: string, resourceType: 'image' | 'raw' = 'image') {
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}
