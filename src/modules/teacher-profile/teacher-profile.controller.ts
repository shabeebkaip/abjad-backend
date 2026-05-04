import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { teacherProfileService } from './teacher-profile.service';

export class TeacherProfileController {
  async getProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const profile = await teacherProfileService.getOrCreateProfile(req.user!.userId);
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  }

  async updatePersonal(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const profile = await teacherProfileService.updatePersonal(req.user!.userId, req.body);
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  }

  async updateProfessional(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const profile = await teacherProfileService.updateProfessional(req.user!.userId, req.body);
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  }

  async updateEducation(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const profile = await teacherProfileService.updateEducation(req.user!.userId, req.body);
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  }

  async addCertification(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const profile = await teacherProfileService.addCertification(req.user!.userId, req.body);
      res.status(201).json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  }

  async removeCertification(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const profile = await teacherProfileService.removeCertification(req.user!.userId, String(req.params.certId));
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  }

  async updateLanguages(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const profile = await teacherProfileService.updateLanguages(req.user!.userId, req.body.languages);
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  }

  async updateLocationPreferences(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const profile = await teacherProfileService.updateLocationPreferences(req.user!.userId, req.body);
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  }

  async updateSalaryExpectations(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const profile = await teacherProfileService.updateSalaryExpectations(req.user!.userId, req.body);
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  }

  async uploadPhoto(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No file uploaded' });
        return;
      }
      const profile = await teacherProfileService.uploadPhoto(req.user!.userId, req.file.buffer);
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  }

  async uploadResume(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No file uploaded' });
        return;
      }
      const profile = await teacherProfileService.uploadResume(
        req.user!.userId,
        req.file.buffer,
        req.file.originalname
      );
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  }

  async uploadCertificateFile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No file uploaded' });
        return;
      }
      const profile = await teacherProfileService.uploadCertificateFile(
        req.user!.userId,
        String(req.params.certId),
        req.file.buffer
      );
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  }

  async uploadEducationCertificate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No file uploaded' });
        return;
      }
      const profile = await teacherProfileService.uploadEducationCertificate(req.user!.userId, req.file.buffer);
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  }

  async submitForApproval(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const profile = await teacherProfileService.submitForApproval(req.user!.userId);
      res.json({ success: true, message: 'Profile submitted for review', data: profile });
    } catch (err) {
      next(err);
    }
  }
}

export const teacherProfileController = new TeacherProfileController();
