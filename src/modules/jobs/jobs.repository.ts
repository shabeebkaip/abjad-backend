import mongoose from 'mongoose';
import { Job, IJob } from '../../models/job.model';
import { SavedJob } from '../../models/saved-job.model';
import SchoolProfile from '../../models/school-profile.model';
import { ITeacherProfileDocument } from '../../models/teacher-profile.model';
import { matchingService } from '../matching/matching.service';

export type JobWithScore = IJob & {
  matchScore?: number;
  matchBreakdown?: {
    subjects: number;
    gradeLevels: number;
    experience: number;
    location: number;
    language: number;
    qualifications: number;
  };
};

export interface JobFilters {
  city?: string | string[];
  subjects?: string[];
  gradeLevels?: string[];
  languageRequirement?: string;
  experienceRequired?: string;
  employmentType?: string;
  salaryMin?: number;
  salaryMax?: number;
  postedWithin?: number; // days
  sortBy?: 'newest' | 'deadline' | 'salary_asc' | 'salary_desc';
  page?: number;
  limit?: number;
}

async function attachSchoolInfo(jobs: IJob[]): Promise<IJob[]> {
  if (!jobs.length) return jobs;
  const userIds = [...new Set(jobs.map((j) => String(j.schoolId)))];
  const profiles = await SchoolProfile.find(
    { userId: { $in: userIds } },
    { userId: 1, nameEn: 1, nameAr: 1, logoUrl: 1 }
  ).lean();
  const byUserId = new Map(profiles.map((p) => [String(p.userId), p]));
  return jobs.map((j) => {
    const profile = byUserId.get(String(j.schoolId));
    return {
      ...j,
      school: profile
        ? { name: profile.nameEn || profile.nameAr || '', logoUrl: profile.logoUrl }
        : { name: '', logoUrl: undefined },
    } as IJob;
  });
}

export class JobsRepository {
  async findActive(filters: JobFilters): Promise<{ jobs: IJob[]; total: number }> {
    const query: Record<string, unknown> = { status: 'active' };

    if (filters.city) {
      query.city = Array.isArray(filters.city) ? { $in: filters.city } : filters.city;
    }
    if (filters.subjects?.length) {
      query.subjects = { $in: filters.subjects };
    }
    if (filters.gradeLevels?.length) {
      query.gradeLevels = { $in: filters.gradeLevels };
    }
    if (filters.languageRequirement) {
      query.languageRequirement = filters.languageRequirement;
    }
    if (filters.experienceRequired) {
      query.experienceRequired = filters.experienceRequired;
    }
    if (filters.employmentType) {
      query.employmentType = filters.employmentType;
    }
    if (filters.salaryMin !== undefined || filters.salaryMax !== undefined) {
      query['salary.display'] = 'show';
      if (filters.salaryMin !== undefined) query['salary.min'] = { $gte: filters.salaryMin };
      if (filters.salaryMax !== undefined) query['salary.max'] = { $lte: filters.salaryMax };
    }
    if (filters.postedWithin) {
      const since = new Date();
      since.setDate(since.getDate() - filters.postedWithin);
      query.createdAt = { $gte: since };
    }

    const sortMap: Record<string, [string, 1 | -1][]> = {
      newest: [['createdAt', -1]],
      deadline: [['deadline', 1]],
      salary_asc: [['salary.min', 1]],
      salary_desc: [['salary.max', -1]],
    };
    const sort = sortMap[filters.sortBy ?? 'newest'] ?? { createdAt: -1 };

    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 50);
    const skip = (page - 1) * limit;

    const [rawJobs, total] = await Promise.all([
      Job.find(query).sort(sort).skip(skip).limit(limit).lean(),
      Job.countDocuments(query),
    ]);

    const jobs = await attachSchoolInfo(rawJobs as IJob[]);
    return { jobs, total };
  }

  async findById(id: string): Promise<IJob | null> {
    const job = await Job.findById(id).lean() as IJob | null;
    if (!job) return null;
    const [enriched] = await attachSchoolInfo([job]);
    return enriched;
  }

  async incrementViews(jobId: string): Promise<void> {
    await Job.updateOne({ _id: new mongoose.Types.ObjectId(jobId) }, { $inc: { viewsCount: 1 } });
  }

  /**
   * Find and score recommended jobs for a teacher.
   * Phase 1: broad MongoDB pre-filter (subjects OR grades OR city).
   * Phase 2: compute full weighted match score for each candidate.
   * Returns jobs sorted by match score descending.
   */
  async findRecommended(
    profile: ITeacherProfileDocument,
    limit = 10,
  ): Promise<JobWithScore[]> {
    // No meaningful matching signals → don't fabricate recommendations.
    // The dashboard's empty state will prompt the user to complete their profile.
    if (matchingService.isProfileSparse(profile)) return [];

    const prof = profile.professional as { subjects?: string[]; gradeLevels?: string[] };
    const loc  = profile.locationPreferences as { preferredCities?: string[] };

    const subjects    = prof?.subjects     ?? [];
    const gradeLevels = prof?.gradeLevels  ?? [];
    const cities      = (loc?.preferredCities as string[]) ?? [];

    // Broad pre-filter: at least one matching signal
    const orConditions: Record<string, unknown>[] = [];
    if (subjects.length)    orConditions.push({ subjects:    { $in: subjects    } });
    if (gradeLevels.length) orConditions.push({ gradeLevels: { $in: gradeLevels } });
    if (cities.length)      orConditions.push({ city:        { $in: cities      } });

    const query: Record<string, unknown> = { status: 'active' };
    if (orConditions.length) query.$or = orConditions;

    // Fetch up to 60 candidates so scoring has enough to rank from
    const rawJobs = await Job.find(query).sort({ createdAt: -1 }).limit(60).lean() as IJob[];
    const enriched = await attachSchoolInfo(rawJobs);

    // Score every candidate and sort — include breakdown for "Why this match" UI
    const scored = enriched
      .map((job) => {
        const result = matchingService.compute(profile, job);
        return { ...job, matchScore: result.score, matchBreakdown: result.breakdown };
      })
      .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))
      .slice(0, limit) as unknown as JobWithScore[];

    return scored;
  }

  /**
   * Same as findActive but attaches a matchScore to each job when a teacher
   * profile is provided. Used by the public job-listing endpoint with optional auth.
   */
  async findActiveScored(
    filters: JobFilters,
    profile: ITeacherProfileDocument,
  ): Promise<{ jobs: JobWithScore[]; total: number }> {
    const { jobs, total } = await this.findActive(filters);
    // Skip scoring when the profile is too sparse to differentiate jobs —
    // displaying the same baseline % on every card is worse than no score.
    if (matchingService.isProfileSparse(profile)) {
      return { jobs: jobs as unknown as JobWithScore[], total };
    }
    const scored = jobs.map((job) => {
      const result = matchingService.compute(profile, job);
      return { ...job, matchScore: result.score, matchBreakdown: result.breakdown };
    }) as unknown as JobWithScore[];
    return { jobs: scored, total };
  }

  // Saved jobs
  async saveJob(teacherId: string, jobId: string): Promise<void> {
    await SavedJob.findOneAndUpdate(
      {
        teacherId: new mongoose.Types.ObjectId(teacherId),
        jobId: new mongoose.Types.ObjectId(jobId),
      },
      {},
      { upsert: true }
    );
  }

  async unsaveJob(teacherId: string, jobId: string): Promise<void> {
    await SavedJob.deleteOne({
      teacherId: new mongoose.Types.ObjectId(teacherId),
      jobId: new mongoose.Types.ObjectId(jobId),
    });
  }

  async getSavedJobs(teacherId: string, page = 1, limit = 20): Promise<{ jobs: IJob[]; total: number }> {
    const skip = (page - 1) * limit;
    const [savedDocs, total] = await Promise.all([
      SavedJob.find({ teacherId: new mongoose.Types.ObjectId(teacherId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate<{ jobId: IJob }>('jobId')
        .lean(),
      SavedJob.countDocuments({ teacherId: new mongoose.Types.ObjectId(teacherId) }),
    ]);

    const jobs = savedDocs.map((s) => s.jobId).filter(Boolean) as IJob[];
    return { jobs, total };
  }

  // Bulk lookup — returns the set of jobIds the teacher has saved.
  // Used by listJobs to flag isSaved on each result so the bookmark icon
  // renders correctly in the listing UI.
  async getSavedJobIds(teacherId: string): Promise<Set<string>> {
    const docs = await SavedJob.find({
      teacherId: new mongoose.Types.ObjectId(teacherId),
    }).select('jobId').lean();
    return new Set(docs.map((d) => d.jobId.toString()));
  }

  async isSaved(teacherId: string, jobId: string): Promise<boolean> {
    const doc = await SavedJob.exists({
      teacherId: new mongoose.Types.ObjectId(teacherId),
      jobId: new mongoose.Types.ObjectId(jobId),
    });
    return !!doc;
  }
}

export const jobsRepository = new JobsRepository();
