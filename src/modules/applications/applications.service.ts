import { applicationsRepository } from './applications.repository';
import { jobsRepository } from '../jobs/jobs.repository';
import { teacherProfileRepository } from '../teacher-profile/teacher-profile.repository';
import { IApplication, ApplicationStatus } from '../../models/application.model';
import { AppError } from '../../utils/app-error.util';

export class ApplicationsService {
  async apply(teacherId: string, jobId: string, coverLetter?: string): Promise<IApplication> {
    const job = await jobsRepository.findById(jobId);
    if (!job || job.status !== 'active') throw AppError.notFound('Job not found or no longer active');

    if (job.deadline && new Date() > job.deadline) {
      throw AppError.badRequest('Application deadline has passed');
    }

    const existing = await applicationsRepository.findByTeacherAndJob(teacherId, jobId);
    if (existing && existing.status !== 'withdrawn') {
      throw AppError.conflict('You have already applied for this job');
    }

    const profile = await teacherProfileRepository.findByUserId(teacherId);
    if (!profile) throw AppError.badRequest('Complete your profile before applying');
    if (profile.profileStatus !== 'approved') {
      throw AppError.forbidden('Your profile must be approved before applying');
    }

    const application = await applicationsRepository.create({
      jobId,
      teacherId,
      teacherProfileId: (profile._id as { toString(): string }).toString(),
      schoolId: job.schoolId.toString(),
      coverLetter,
    });

    await applicationsRepository.incrementJobApplicationsCount(jobId);

    return application;
  }

  async withdraw(teacherId: string, applicationId: string): Promise<IApplication> {
    const application = await applicationsRepository.withdraw(applicationId, teacherId);
    if (!application) {
      throw AppError.badRequest('Application cannot be withdrawn (not found or already processed)');
    }
    return application;
  }

  async listApplications(teacherId: string, status?: ApplicationStatus, page = 1, limit = 20) {
    const result = await applicationsRepository.findByTeacher(teacherId, status, page, limit);
    return {
      ...result,
      page,
      totalPages: Math.ceil(result.total / limit),
    };
  }

  async getApplication(teacherId: string, applicationId: string): Promise<IApplication> {
    const application = await applicationsRepository.findById(applicationId);
    if (!application) throw AppError.notFound('Application not found');
    if (application.teacherId.toString() !== teacherId) throw AppError.forbidden('Access denied');
    return application;
  }

  async getStats(teacherId: string) {
    const [stats, responseRate] = await Promise.all([
      applicationsRepository.getStats(teacherId),
      applicationsRepository.getResponseRate(teacherId),
    ]);
    return { ...stats, responseRate };
  }
}

export const applicationsService = new ApplicationsService();
