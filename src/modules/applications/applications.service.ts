import { applicationsRepository } from './applications.repository';
import { jobsRepository } from '../jobs/jobs.repository';
import { teacherProfileRepository } from '../teacher-profile/teacher-profile.repository';
import { IApplication, ApplicationStatus } from '../../models/application.model';
import { AppError } from '../../utils/app-error.util';
import { matchingService } from '../matching/matching.service';
import User from '../../models/user.model';
import { sendEmail } from '../../utils/email.util';
import { tplApplicationSubmitted, tplNewApplicationToSchool } from '../../utils/email-templates.util';

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
    if (profile.profileStatus === 'suspended') {
      throw AppError.forbidden('Your account has been suspended. Please contact support.');
    }
    if (profile.profileStatus === 'rejected') {
      throw AppError.forbidden('Your profile has been rejected. Please update your profile and resubmit.');
    }

    const { score: matchScore } = matchingService.compute(profile, job);

    const application = await applicationsRepository.create({
      jobId,
      teacherId,
      teacherProfileId: (profile._id as { toString(): string }).toString(),
      schoolId: job.schoolId.toString(),
      coverLetter,
      matchScore,
    });

    await applicationsRepository.incrementJobApplicationsCount(jobId);
    // SRD 3.2.4 — close the job if it has now reached maxApplications and the school opted in.
    void applicationsRepository.closeJobIfFull(jobId);

    // Fire-and-forget emails
    void (async () => {
      const [teacherUser, schoolUser] = await Promise.all([
        User.findById(teacherId).select('email emailNotificationsEnabled firstName').lean(),
        User.findById(job.schoolId).select('email emailNotificationsEnabled schoolName').lean(),
      ]);
      const teacherName = profile.personal?.fullNameEn ?? profile.personal?.fullNameAr ?? 'Teacher';
      if (teacherUser?.emailNotificationsEnabled) {
        const { subject, html } = tplApplicationSubmitted({
          teacherName,
          jobTitle: job.title,
          schoolName: schoolUser?.schoolName ?? 'the school',
          referenceNumber: application.referenceNumber,
        });
        await sendEmail(teacherUser.email, subject, html);
      }
      if (schoolUser?.emailNotificationsEnabled) {
        const { subject, html } = tplNewApplicationToSchool({
          schoolName: schoolUser.schoolName ?? 'School',
          teacherName,
          jobTitle: job.title,
          matchScore: application.matchScore,
          referenceNumber: application.referenceNumber,
        });
        await sendEmail(schoolUser.email, subject, html);
      }
    })();

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
    const [stats, responseRate, avgResponseHours] = await Promise.all([
      applicationsRepository.getStats(teacherId),
      applicationsRepository.getResponseRate(teacherId),
      applicationsRepository.getAvgResponseHours(teacherId),
    ]);
    // SRD 2.5.4 — % of all applications that ended in 'hired'
    const successRate = stats.total > 0 ? Math.round((stats.hired / stats.total) * 100) : 0;
    return { ...stats, responseRate, avgResponseHours, successRate };
  }
}

export const applicationsService = new ApplicationsService();
