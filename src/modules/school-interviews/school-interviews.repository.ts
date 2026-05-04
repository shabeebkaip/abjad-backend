import mongoose from 'mongoose';
import { Interview, IInterview } from '../../models/interview.model';

export interface ScheduleInterviewData {
  applicationId: string;
  jobId: string;
  teacherId: string;
  type: string;
  scheduledAt: string;
  duration: number;
  location?: string;
  meetingLink?: string;
  interviewers?: Array<{ name: string; email?: string; role?: string }>;
  instructions?: string;
  responseDeadline?: string;
}

export class SchoolInterviewsRepository {
  async create(schoolId: string, data: ScheduleInterviewData): Promise<IInterview> {
    return Interview.create({
      schoolId: new mongoose.Types.ObjectId(schoolId),
      applicationId: new mongoose.Types.ObjectId(data.applicationId),
      jobId: new mongoose.Types.ObjectId(data.jobId),
      teacherId: new mongoose.Types.ObjectId(data.teacherId),
      type: data.type,
      scheduledAt: new Date(data.scheduledAt),
      duration: data.duration,
      location: data.location,
      meetingLink: data.meetingLink,
      interviewers: data.interviewers ?? [],
      instructions: data.instructions,
      responseDeadline: data.responseDeadline ? new Date(data.responseDeadline) : undefined,
      status: 'pending',
    });
  }

  async findBySchool(
    schoolId: string,
    filters: { status?: string; jobId?: string; page?: number; limit?: number }
  ): Promise<{ interviews: IInterview[]; total: number }> {
    const query: Record<string, unknown> = { schoolId: new mongoose.Types.ObjectId(schoolId) };
    if (filters.status) query.status = filters.status;
    if (filters.jobId) query.jobId = new mongoose.Types.ObjectId(filters.jobId);

    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 50);
    const skip = (page - 1) * limit;

    const [interviews, total] = await Promise.all([
      Interview.find(query)
        .sort({ scheduledAt: 1 })
        .skip(skip)
        .limit(limit)
        .populate('teacherId', 'name email')
        .populate('jobId', 'title')
        .lean(),
      Interview.countDocuments(query),
    ]);

    return { interviews: interviews as IInterview[], total };
  }

  async findByIdAndSchool(interviewId: string, schoolId: string): Promise<IInterview | null> {
    return Interview.findOne({
      _id: new mongoose.Types.ObjectId(interviewId),
      schoolId: new mongoose.Types.ObjectId(schoolId),
    })
      .populate('teacherId', 'name email')
      .populate('jobId', 'title city');
  }

  async update(
    interviewId: string,
    schoolId: string,
    data: Record<string, unknown>
  ): Promise<IInterview | null> {
    return Interview.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(interviewId), schoolId: new mongoose.Types.ObjectId(schoolId) },
      { $set: data },
      { new: true }
    );
  }

  async cancel(interviewId: string, schoolId: string): Promise<IInterview | null> {
    return Interview.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(interviewId),
        schoolId: new mongoose.Types.ObjectId(schoolId),
        status: { $in: ['pending', 'accepted'] },
      },
      { $set: { status: 'cancelled' } },
      { new: true }
    );
  }

  async complete(
    interviewId: string,
    schoolId: string,
    feedback: {
      rating?: number;
      strengths?: string;
      weaknesses?: string;
      recommendation?: string;
      notes?: string;
      evaluator?: string;
    }
  ): Promise<IInterview | null> {
    return Interview.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(interviewId),
        schoolId: new mongoose.Types.ObjectId(schoolId),
        status: { $in: ['accepted', 'pending'] },
      },
      {
        $set: {
          status: 'completed',
          feedback: { ...feedback, evaluatedAt: new Date() },
        },
      },
      { new: true }
    );
  }
}

export const schoolInterviewsRepository = new SchoolInterviewsRepository();
