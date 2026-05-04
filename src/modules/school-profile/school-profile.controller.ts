import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { schoolProfileService } from './school-profile.service';

export class SchoolProfileController {
  async getProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const profile = await schoolProfileService.getOrCreateProfile(req.user!.userId);
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  }

  async updateBasic(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const profile = await schoolProfileService.updateBasic(req.user!.userId, req.body);
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  }

  async updateLocation(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const profile = await schoolProfileService.updateLocation(req.user!.userId, req.body);
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  }

  async updateContact(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const profile = await schoolProfileService.updateContact(req.user!.userId, req.body);
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  }

  async updateAdminContact(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const profile = await schoolProfileService.updateAdminContact(req.user!.userId, req.body);
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  }

  async uploadLogo(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No file uploaded' });
        return;
      }
      const profile = await schoolProfileService.uploadLogo(req.user!.userId, req.file.buffer);
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  }

  async uploadDocument(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No file uploaded' });
        return;
      }
      const docType = req.params.docType as 'commercialRegistration' | 'ministryLicense';
      if (!['commercialRegistration', 'ministryLicense'].includes(docType)) {
        res.status(400).json({ success: false, message: 'Invalid document type' });
        return;
      }
      const profile = await schoolProfileService.uploadDocument(req.user!.userId, docType, req.file.buffer);
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  }

  async submitForVerification(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const profile = await schoolProfileService.submitForVerification(req.user!.userId);
      res.json({ success: true, data: profile, message: 'Profile submitted for verification' });
    } catch (err) {
      next(err);
    }
  }
}

export const schoolProfileController = new SchoolProfileController();
