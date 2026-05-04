import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { jobsService } from './jobs.service';

export class JobsController {
  async listJobs(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        city, subjects, gradeLevels, languageRequirement,
        experienceRequired, employmentType, salaryMin, salaryMax,
        postedWithin, sortBy, page, limit,
      } = req.query;

      const toArray = (v: unknown): string[] | undefined => {
        if (!v) return undefined;
        return Array.isArray(v) ? (v as string[]) : [v as string];
      };

      const result = await jobsService.listJobs({
        city: city as string | string[],
        subjects: toArray(subjects),
        gradeLevels: toArray(gradeLevels),
        languageRequirement: languageRequirement as string,
        experienceRequired: experienceRequired as string,
        employmentType: employmentType as string,
        salaryMin: salaryMin ? Number(salaryMin) : undefined,
        salaryMax: salaryMax ? Number(salaryMax) : undefined,
        postedWithin: postedWithin ? Number(postedWithin) : undefined,
        sortBy: sortBy as 'newest' | 'deadline' | 'salary_asc' | 'salary_desc',
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getJob(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await jobsService.getJob(String(req.params.jobId), req.user?.userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getRecommendations(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const jobs = await jobsService.getRecommendations(req.user!.userId);
      res.json({ success: true, data: jobs });
    } catch (err) {
      next(err);
    }
  }

  async saveJob(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await jobsService.saveJob(req.user!.userId, String(req.params.jobId));
      res.json({ success: true, message: 'Job saved' });
    } catch (err) {
      next(err);
    }
  }

  async unsaveJob(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await jobsService.unsaveJob(req.user!.userId, String(req.params.jobId));
      res.json({ success: true, message: 'Job removed from saved' });
    } catch (err) {
      next(err);
    }
  }

  async getSavedJobs(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const result = await jobsService.getSavedJobs(req.user!.userId, page, limit);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}

export const jobsController = new JobsController();
