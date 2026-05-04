import { schoolApplicationsRepository, SchoolAppFilters } from './school-applications.repository';
import { IApplication } from '../../models/application.model';
import { AppError } from '../../utils/app-error.util';

const VALID_SCHOOL_TRANSITIONS: Record<string, string[]> = {
  submitted: ['reviewing', 'rejected'],
  reviewing: ['shortlisted', 'rejected'],
  shortlisted: ['interview_scheduled', 'rejected'],
  interview_scheduled: ['offer_extended', 'rejected'],
  offer_extended: ['hired', 'rejected'],
};

export class SchoolApplicationsService {
  async listApplications(
    schoolId: string,
    filters: SchoolAppFilters
  ): Promise<{ applications: IApplication[]; total: number; page: number; totalPages: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const { applications, total } = await schoolApplicationsRepository.findBySchool(schoolId, filters);
    return { applications, total, page, totalPages: Math.ceil(total / limit) };
  }

  async getApplication(schoolId: string, appId: string): Promise<IApplication> {
    const app = await schoolApplicationsRepository.findByIdAndSchool(appId, schoolId);
    if (!app) throw AppError.notFound('Application not found');
    await schoolApplicationsRepository.markRead(appId, schoolId);
    return app;
  }

  async updateStatus(
    schoolId: string,
    appId: string,
    status: string,
    meta: { note?: string; rejectionReason?: string }
  ): Promise<IApplication> {
    const app = await schoolApplicationsRepository.findByIdAndSchool(appId, schoolId);
    if (!app) throw AppError.notFound('Application not found');

    if (['withdrawn', 'hired'].includes(app.status)) {
      throw AppError.badRequest(`Cannot update a ${app.status} application`);
    }

    const allowed = VALID_SCHOOL_TRANSITIONS[app.status] ?? [];
    if (!allowed.includes(status)) {
      throw AppError.badRequest(`Cannot transition from "${app.status}" to "${status}"`);
    }

    if (status === 'rejected' && !meta.rejectionReason) {
      throw AppError.badRequest('Rejection reason is required');
    }

    const updated = await schoolApplicationsRepository.updateStatus(appId, schoolId, status, meta);
    if (!updated) throw AppError.notFound('Application not found');
    return updated;
  }

  async getJobApplicationStats(
    schoolId: string,
    jobId: string
  ): Promise<Record<string, number>> {
    const stats = await schoolApplicationsRepository.getStatsByJob(schoolId, jobId);
    const result: Record<string, number> = {};
    for (const s of stats) result[s._id] = s.count;
    return result;
  }
}

export const schoolApplicationsService = new SchoolApplicationsService();
