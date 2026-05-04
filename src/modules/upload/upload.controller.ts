import { Request, Response, NextFunction } from 'express';
import { uploadToCloudinary, deleteFromCloudinary, UploadFolder } from '../../utils/cloudinary.util';
import { AppError } from '../../utils/app-error.util';

export async function uploadFile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      return next(new AppError('No file provided', 400));
    }

    const folder = (req.query.folder as UploadFolder) || 'documents';
    const validFolders: UploadFolder[] = ['photos', 'certificates', 'resumes', 'documents'];
    if (!validFolders.includes(folder)) {
      return next(new AppError(`Invalid folder. Allowed: ${validFolders.join(', ')}`, 400));
    }

    const result = await uploadToCloudinary(req.file.buffer, folder);

    res.status(200).json({
      success: true,
      data: {
        url: result.secureUrl,
        publicId: result.publicId,
        format: result.format,
        bytes: result.bytes,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteFile(req: Request, res: Response, next: NextFunction) {
  try {
    const { publicId, resourceType } = req.body as { publicId: string; resourceType?: 'image' | 'raw' };

    if (!publicId) {
      return next(new AppError('publicId is required', 400));
    }

    await deleteFromCloudinary(publicId, resourceType ?? 'image');

    res.status(200).json({ success: true, message: 'File deleted' });
  } catch (err) {
    next(err);
  }
}
