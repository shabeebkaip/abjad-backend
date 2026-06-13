import mongoose from 'mongoose';
import { Interview, IInterview, InterviewStatus } from '../../models/interview.model';

export class InterviewsRepository {
  async findByTeacher(
    teacherId: string,
    status?: InterviewStatus,
    page = 1,
    limit = 20
  ): Promise<{ interviews: IInterview[]; total: number }> {
    const query: Record<string, unknown> = { teacherId: new mongoose.Types.ObjectId(teacherId) };
    if (status) query.status = status;

    const skip = (page - 1) * limit;
    const [interviews, total] = await Promise.all([
      Interview.find(query)
        .sort({ scheduledAt: 1 })
        .skip(skip)
        .limit(limit)
        .populate('jobId', 'title subjects city')
        .populate('schoolId', 'name')
        .lean(),
      Interview.countDocuments(query),
    ]);

    return { interviews: interviews as IInterview[], total };
  }

  async findById(id: string): Promise<IInterview | null> {
    return Interview.findById(id)
      .populate('jobId', 'title subjects city')
      .populate('schoolId', 'name email');
  }

  async findUpcoming(teacherId: string, limit = 5): Promise<IInterview[]> {
    return Interview.find({
      teacherId: new mongoose.Types.ObjectId(teacherId),
      status: { $in: ['pending', 'accepted'] },
      scheduledAt: { $gte: new Date() },
    })
      .sort({ scheduledAt: 1 })
      .limit(limit)
      .populate('jobId', 'title')
      .lean() as Promise<IInterview[]>;
  }

  async respond(
    interviewId: string,
    teacherId: string,
    action: 'accepted' | 'declined' | 'reschedule_requested',
    reason?: string,
    proposedTime?: Date
  ): Promise<IInterview | null> {
    const statusMap: Record<string, InterviewStatus> = {
      accepted: 'accepted',
      declined: 'declined',
      reschedule_requested: 'rescheduled',
    };

    return Interview.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(interviewId),
        teacherId: new mongoose.Types.ObjectId(teacherId),
        status: 'pending',
      },
      {
        $set: {
          status: statusMap[action],
          teacherResponse: { action, reason, proposedTime, respondedAt: new Date() },
        },
      },
      { new: true }
    );
  }

  async markReminderSent(interviewId: string, type: '24h' | '1h'): Promise<void> {
    await Interview.updateOne(
      { _id: new mongoose.Types.ObjectId(interviewId) },
      { $push: { reminders: { type, sentAt: new Date() } } }
    );
  }

  async markCompleted(interviewId: string, teacherId: string): Promise<IInterview | null> {
    return Interview.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(interviewId),
        teacherId: new mongoose.Types.ObjectId(teacherId),
        status: 'accepted',
      },
      { $set: { status: 'completed' } },
      { new: true }
    );
  }

  // SRD 2.6.4 — teacher submits their post-interview feedback. Only allowed
  // when interview belongs to the teacher AND is completed. Overwrites any
  // previously-submitted feedback (teacher can amend).
  async submitTeacherFeedback(
    interviewId: string,
    teacherId: string,
    feedback: { rating: number; comment?: string },
  ): Promise<IInterview | null> {
    return Interview.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(interviewId),
        teacherId: new mongoose.Types.ObjectId(teacherId),
        status: 'completed',
      },
      {
        $set: {
          teacherFeedback: {
            rating: feedback.rating,
            comment: feedback.comment,
            submittedAt: new Date(),
          },
        },
      },
      { new: true },
    );
  }
}

export const interviewsRepository = new InterviewsRepository();
