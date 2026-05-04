import { schoolInterviewsRepository, ScheduleInterviewData } from './school-interviews.repository';
import { IInterview } from '../../models/interview.model';
import { Application } from '../../models/application.model';
import { AppError } from '../../utils/app-error.util';
import mongoose from 'mongoose';

export class SchoolInterviewsService {
  async scheduleInterview(schoolId: string, data: ScheduleInterviewData): Promise<IInterview> {
    // Verify application belongs to this school
    const app = await Application.findOne({
      _id: new mongoose.Types.ObjectId(data.applicationId),
      schoolId: new mongoose.Types.ObjectId(schoolId),
    });
    if (!app) throw AppError.notFound('Application not found');
    if (!['shortlisted', 'reviewing'].includes(app.status)) {
      throw AppError.badRequest('Application must be shortlisted or reviewing to schedule interview');
    }

    const interview = await schoolInterviewsRepository.create(schoolId, data);

    // Update application status to interview_scheduled
    await Application.updateOne(
      { _id: app._id },
      {
        $set: { status: 'interview_scheduled' },
        $push: { statusHistory: { status: 'interview_scheduled', timestamp: new Date() } },
      }
    );

    return interview;
  }

  async listInterviews(
    schoolId: string,
    filters: { status?: string; jobId?: string; page?: number; limit?: number }
  ): Promise<{ interviews: IInterview[]; total: number; page: number; totalPages: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const { interviews, total } = await schoolInterviewsRepository.findBySchool(schoolId, filters);
    return { interviews, total, page, totalPages: Math.ceil(total / limit) };
  }

  async getInterview(schoolId: string, interviewId: string): Promise<IInterview> {
    const interview = await schoolInterviewsRepository.findByIdAndSchool(interviewId, schoolId);
    if (!interview) throw AppError.notFound('Interview not found');
    return interview;
  }

  async updateInterview(
    schoolId: string,
    interviewId: string,
    data: Record<string, unknown>
  ): Promise<IInterview> {
    const interview = await schoolInterviewsRepository.findByIdAndSchool(interviewId, schoolId);
    if (!interview) throw AppError.notFound('Interview not found');
    if (['completed', 'cancelled'].includes(interview.status)) {
      throw AppError.badRequest('Cannot update a completed or cancelled interview');
    }

    const allowed = ['scheduledAt', 'duration', 'location', 'meetingLink', 'interviewers', 'instructions', 'type', 'responseDeadline'];
    const filtered: Record<string, unknown> = {};
    for (const key of allowed) {
      if (data[key] !== undefined) filtered[key] = data[key];
    }

    const updated = await schoolInterviewsRepository.update(interviewId, schoolId, filtered);
    if (!updated) throw AppError.notFound('Interview not found');
    return updated;
  }

  async cancelInterview(schoolId: string, interviewId: string): Promise<IInterview> {
    const updated = await schoolInterviewsRepository.cancel(interviewId, schoolId);
    if (!updated) throw AppError.badRequest('Interview not found or cannot be cancelled');
    return updated;
  }

  async completeInterview(
    schoolId: string,
    interviewId: string,
    feedback: {
      rating?: number;
      strengths?: string;
      weaknesses?: string;
      recommendation?: string;
      notes?: string;
      evaluator?: string;
    }
  ): Promise<IInterview> {
    const updated = await schoolInterviewsRepository.complete(interviewId, schoolId, feedback);
    if (!updated) throw AppError.badRequest('Interview not found or already completed/cancelled');
    return updated;
  }
}

export const schoolInterviewsService = new SchoolInterviewsService();
