import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { schoolCandidatesService } from './school-candidates.service';

export class SchoolCandidatesController {
  async searchCandidates(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        subjects, gradeLevels, experienceRange, city, gender,
        nationality, degreeType, language, languageProficiency, employmentStatus,
        certificationsKeyword, salaryMaxAcceptable, sortBy, page, limit,
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
        languageProficiency: languageProficiency as string,
        employmentStatus: employmentStatus as string,
        certificationsKeyword: certificationsKeyword as string,
        salaryMaxAcceptable: salaryMaxAcceptable ? Number(salaryMaxAcceptable) : undefined,
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

  // SRD 3.4.3 — GET /api/school/candidates/:teacherId/history
  async getCandidateHistory(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const history = await schoolCandidatesService.getCandidateHistory(
        req.user!.userId,
        String(req.params.teacherId),
      );
      res.json({ success: true, data: history });
    } catch (err) {
      next(err);
    }
  }

  // SRD 3.3.5 — POST /api/school/candidates/export-pdf { teacherIds }
  async exportPdf(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { teacherIds } = req.body as { teacherIds?: string[] };
      if (!Array.isArray(teacherIds) || teacherIds.length === 0) {
        res.status(400).json({ success: false, message: 'teacherIds must be a non-empty array' });
        return;
      }
      const pdfBuffer = await schoolCandidatesService.exportToPdf(teacherIds);
      const today = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="abjad-candidates-${today}.pdf"`);
      res.send(pdfBuffer);
    } catch (err) {
      next(err);
    }
  }
}

export const schoolCandidatesController = new SchoolCandidatesController();
