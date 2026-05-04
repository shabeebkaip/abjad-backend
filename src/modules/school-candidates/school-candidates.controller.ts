import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { schoolCandidatesService } from './school-candidates.service';

export class SchoolCandidatesController {
  async searchCandidates(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        subjects, gradeLevels, experienceRange, city, gender,
        nationality, degreeType, language, employmentStatus, sortBy, page, limit,
      } = req.query;

      const toArray = (v: unknown): string[] | undefined => {
        if (!v) return undefined;
        return Array.isArray(v) ? (v as string[]) : [v as string];
      };

      const result = await schoolCandidatesService.searchCandidates({
        subjects: toArray(subjects),
        gradeLevels: toArray(gradeLevels),
        experienceRange: experienceRange as string,
        city: city as string | string[],
        gender: gender as string,
        nationality: nationality as string,
        degreeType: degreeType as string,
        language: language as string,
        employmentStatus: employmentStatus as string,
        sortBy: sortBy as 'newest' | 'completion',
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getCandidateProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const profile = await schoolCandidatesService.getCandidateProfile(String(req.params.teacherId));
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  }

  async addNote(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const note = await schoolCandidatesService.addNote(
        req.user!.userId,
        String(req.params.teacherId),
        req.body,
        req.user!.userId
      );
      res.status(201).json({ success: true, data: note });
    } catch (err) {
      next(err);
    }
  }

  async getNotes(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const notes = await schoolCandidatesService.getNotes(
        req.user!.userId,
        String(req.params.teacherId)
      );
      res.json({ success: true, data: notes });
    } catch (err) {
      next(err);
    }
  }

  async updateNote(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const note = await schoolCandidatesService.updateNote(
        req.user!.userId,
        String(req.params.noteId),
        req.body
      );
      res.json({ success: true, data: note });
    } catch (err) {
      next(err);
    }
  }

  async deleteNote(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await schoolCandidatesService.deleteNote(req.user!.userId, String(req.params.noteId));
      res.json({ success: true, message: 'Note deleted' });
    } catch (err) {
      next(err);
    }
  }
}

export const schoolCandidatesController = new SchoolCandidatesController();
