import { jobsRepository, JobFilters } from './jobs.repository';
import { IJob } from '../../models/job.model';
import { teacherProfileRepository } from '../teacher-profile/teacher-profile.repository';
import { IProfessionalInfo, ILocationPreferences } from '../../models/teacher-profile.model';
import { AppError } from '../../utils/app-error.util';

export class JobsService {
  async listJobs(filters: JobFilters): Promise<{ jobs: IJob[]; total: number; page: number; totalPages: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
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

  async getRecommendations(teacherId: string): Promise<IJob[]> {
    const profile = await teacherProfileRepository.findByUserId(teacherId);
    if (!profile) return [];

    const prof = profile.professional as IProfessionalInfo;
    const loc = profile.locationPreferences as ILocationPreferences;

    const subjects = prof?.subjects ?? [];
    const gradeLevels = prof?.gradeLevels ?? [];
    const cities = (loc?.preferredCities as string[]) ?? [];

    return jobsRepository.findRecommended(subjects, gradeLevels, cities, 10);
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
