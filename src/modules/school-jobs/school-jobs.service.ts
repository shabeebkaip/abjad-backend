import { schoolJobsRepository, SchoolJobFilters } from './school-jobs.repository';
import { IJob, IJobDescriptionSections } from '../../models/job.model';
import { AppError } from '../../utils/app-error.util';

// SRD 3.2.1 / 6.1.3 — when the form sends bilingual + structured fields,
// derive the legacy `title` and `description` so the required schema fields stay populated
// and so plain-text search still hits the section content.
function composeJobPayload(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };

  const titleEn = typeof out.titleEn === 'string' ? out.titleEn.trim() : '';
  const titleAr = typeof out.titleAr === 'string' ? out.titleAr.trim() : '';
  if (!out.title || typeof out.title !== 'string' || !out.title.trim()) {
    const composed = titleEn || titleAr;
    if (composed) out.title = composed;
  }

  const sections = out.descriptionSections as IJobDescriptionSections | undefined;
  if (sections && typeof sections === 'object') {
    const parts: string[] = [];
    const collect = (label: string, sec?: { ar?: string; en?: string }) => {
      if (!sec) return;
      const en = sec.en?.trim();
      const ar = sec.ar?.trim();
      if (en) parts.push(`${label}:\n${en}`);
      if (ar) parts.push(`${label} (AR):\n${ar}`);
    };
    collect('Responsibilities', sections.responsibilities);
    collect('Requirements',     sections.requirements);
    collect('School culture',   sections.culture);
    collect('Benefits',         sections.benefits);
    const composed = parts.join('\n\n').slice(0, 10000);
    if (composed && (!out.description || typeof out.description !== 'string' || !out.description.trim())) {
      out.description = composed;
    }
  }

  return out;
}

export class SchoolJobsService {
  async createJob(schoolId: string, data: Record<string, unknown>): Promise<IJob> {
    return schoolJobsRepository.create(schoolId, composeJobPayload(data));
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
    const updated = await schoolJobsRepository.update(jobId, schoolId, composeJobPayload(data));
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
