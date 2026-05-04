import { schoolJobsRepository, SchoolJobFilters } from './school-jobs.repository';
import { IJob } from '../../models/job.model';
import { AppError } from '../../utils/app-error.util';

export class SchoolJobsService {
  async createJob(schoolId: string, data: Record<string, unknown>): Promise<IJob> {
    return schoolJobsRepository.create(schoolId, data);
  }

  async listJobs(
    schoolId: string,
    filters: SchoolJobFilters
  ): Promise<{ jobs: IJob[]; total: number; page: number; totalPages: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const { jobs, total } = await schoolJobsRepository.findBySchool(schoolId, filters);
    return { jobs, total, page, totalPages: Math.ceil(total / limit) };
  }

  async getJob(schoolId: string, jobId: string): Promise<IJob> {
    const job = await schoolJobsRepository.findByIdAndSchool(jobId, schoolId);
    if (!job) throw AppError.notFound('Job not found');
    return job;
  }

  async updateJob(schoolId: string, jobId: string, data: Record<string, unknown>): Promise<IJob> {
    const job = await schoolJobsRepository.findByIdAndSchool(jobId, schoolId);
    if (!job) throw AppError.notFound('Job not found');
    if (!['draft', 'active'].includes(job.status)) {
      throw AppError.badRequest('Only draft or active jobs can be updated');
    }
    const updated = await schoolJobsRepository.update(jobId, schoolId, data);
    if (!updated) throw AppError.notFound('Job not found');
    return updated;
  }

  async publishJob(schoolId: string, jobId: string): Promise<IJob> {
    const updated = await schoolJobsRepository.publish(jobId, schoolId);
    if (!updated) throw AppError.badRequest('Job not found or already published');
    return updated;
  }

  async closeJob(schoolId: string, jobId: string): Promise<IJob> {
    const updated = await schoolJobsRepository.close(jobId, schoolId);
    if (!updated) throw AppError.badRequest('Job not found or already closed');
    return updated;
  }

  async deleteJob(schoolId: string, jobId: string): Promise<void> {
    const deleted = await schoolJobsRepository.delete(jobId, schoolId);
    if (!deleted) throw AppError.badRequest('Only draft jobs can be deleted');
  }

  async getJobStats(schoolId: string, jobId: string): Promise<Record<string, unknown>> {
    const stats = await schoolJobsRepository.getStats(jobId, schoolId);
    if (!stats) throw AppError.notFound('Job not found');
    return stats;
  }
}

export const schoolJobsService = new SchoolJobsService();
