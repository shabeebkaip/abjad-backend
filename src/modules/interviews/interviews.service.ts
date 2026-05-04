import { interviewsRepository } from './interviews.repository';
import { IInterview, InterviewStatus } from '../../models/interview.model';
import { AppError } from '../../utils/app-error.util';

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
