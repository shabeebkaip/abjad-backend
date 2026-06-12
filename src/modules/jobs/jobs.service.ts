import { jobsRepository, JobFilters, JobWithScore } from './jobs.repository';
import { IJob } from '../../models/job.model';
import { teacherProfileRepository } from '../teacher-profile/teacher-profile.repository';
import { applicationsRepository } from '../applications/applications.repository';
import { AppError } from '../../utils/app-error.util';

export class JobsService {
  async listJobs(
    filters: JobFilters,
    teacherId?: string,
  ): Promise<{ jobs: Array<IJob | JobWithScore | (JobWithScore & { isSaved: boolean; isApplied: boolean })>; total: number; page: number; totalPages: number }> {
    const page  = filters.page  ?? 1;
    const limit = filters.limit ?? 20;

    // If a teacher is authenticated, attach match scores + isSaved + isApplied
    // flags so the bookmark icon and "Applied" label render correctly.
    if (teacherId) {
      const [profile, savedIds, appliedIds] = await Promise.all([
        teacherProfileRepository.findByUserId(teacherId),
        jobsRepository.getSavedJobIds(teacherId),
        applicationsRepository.getAppliedJobIds(teacherId),
      ]);

      const decorate = <T extends { _id?: unknown }>(j: T): T & { isSaved: boolean; isApplied: boolean } => {
        const id = String(j._id ?? '');
        return { ...j, isSaved: savedIds.has(id), isApplied: appliedIds.has(id) };
      };

      if (profile) {
        const { jobs, total } = await jobsRepository.findActiveScored(filters, profile);
        const decorated = jobs.map(decorate) as unknown as JobWithScore[];
        return { jobs: decorated, total, page, totalPages: Math.ceil(total / limit) };
      }

      const { jobs, total } = await jobsRepository.findActive(filters);
      const decorated = jobs.map(decorate) as unknown as IJob[];
      return { jobs: decorated, total, page, totalPages: Math.ceil(total / limit) };
    }

    const { jobs, total } = await jobsRepository.findActive(filters);
    return { jobs, total, page, totalPages: Math.ceil(total / limit) };
  }

  async getJob(jobId: string, teacherId?: string): Promise<{ job: IJob; isSaved: boolean }> {
    const job = await jobsRepository.findById(jobId);
    if (!job) throw AppError.notFound('Job not found');
    if (job.status !== 'active') throw AppError.notFound('Job not found');

    await jobsRepository.incrementViews(jobId);

    const isSaved = teacherId ? await jobsRepository.isSaved(teacherId, jobId) : false;
    return { job, isSaved };
  }

  async getRecommendations(teacherId: string): Promise<JobWithScore[]> {
    const profile = await teacherProfileRepository.findByUserId(teacherId);
    if (!profile) return [];
    return jobsRepository.findRecommended(profile, 10);
  }

  async saveJob(teacherId: string, jobId: string): Promise<void> {
    const job = await jobsRepository.findById(jobId);
    if (!job || job.status !== 'active') throw AppError.notFound('Job not found');
    await jobsRepository.saveJob(teacherId, jobId);
  }

  async unsaveJob(teacherId: string, jobId: string): Promise<void> {
    await jobsRepository.unsaveJob(teacherId, jobId);
  }

  async getSavedJobs(teacherId: string, page: number, limit: number) {
    return jobsRepository.getSavedJobs(teacherId, page, limit);
  }
}

export const jobsService = new JobsService();
