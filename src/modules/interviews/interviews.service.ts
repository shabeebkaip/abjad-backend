import { interviewsRepository } from './interviews.repository';
import { IInterview, InterviewStatus } from '../../models/interview.model';
import { AppError } from '../../utils/app-error.util';
import User from '../../models/user.model';
import { Job } from '../../models/job.model';
import TeacherProfile from '../../models/teacher-profile.model';
import { sendEmail } from '../../utils/email.util';
import { tplInterviewResponseToSchool } from '../../utils/email-templates.util';

export class InterviewsService {
  async listInterviews(teacherId: string, status?: InterviewStatus, page = 1, limit = 20) {
    const result = await interviewsRepository.findByTeacher(teacherId, status, page, limit);
    return { ...result, page, totalPages: Math.ceil(result.total / limit) };
  }

  async getInterview(teacherId: string, interviewId: string): Promise<IInterview> {
    const interview = await interviewsRepository.findById(interviewId);
    if (!interview) throw AppError.notFound('Interview not found');
    if (interview.teacherId.toString() !== teacherId) throw AppError.forbidden('Access denied');
    return interview;
  }

  async respond(
    teacherId: string,
    interviewId: string,
    action: 'accepted' | 'declined' | 'reschedule_requested',
    reason?: string,
    proposedTime?: Date
  ): Promise<IInterview> {
    const interview = await interviewsRepository.respond(interviewId, teacherId, action, reason, proposedTime);
    if (!interview) {
      throw AppError.badRequest('Interview not found or cannot be responded to');
    }

    // Fire-and-forget email to school
    void (async () => {
      const [schoolUser, job, teacherProfile] = await Promise.all([
        User.findById(interview.schoolId).select('email emailNotificationsEnabled').lean(),
        Job.findById(interview.jobId).select('title').lean(),
        TeacherProfile.findOne({ userId: teacherId }).select('personal').lean(),
      ]);
      if (!schoolUser?.emailNotificationsEnabled || !schoolUser.email) return;
      const teacherName = (teacherProfile as any)?.personal?.fullNameEn ?? (teacherProfile as any)?.personal?.fullNameAr ?? 'The teacher';
      const { subject, html } = tplInterviewResponseToSchool({
        schoolName: '',
        teacherName,
        jobTitle: (job as any)?.title ?? 'the position',
        action,
        reason,
        proposedTime,
      });
      await sendEmail(schoolUser.email, subject, html);
    })();

    return interview;
  }

  async markCompleted(teacherId: string, interviewId: string): Promise<IInterview> {
    const interview = await interviewsRepository.markCompleted(interviewId, teacherId);
    if (!interview) {
      throw AppError.badRequest('Interview not found or not in accepted state');
    }
    return interview;
  }

  async getUpcoming(teacherId: string): Promise<IInterview[]> {
    return interviewsRepository.findUpcoming(teacherId);
  }
}

export const interviewsService = new InterviewsService();
