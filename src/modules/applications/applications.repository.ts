import mongoose from 'mongoose';
import { Application, IApplication, ApplicationStatus } from '../../models/application.model';

export class ApplicationsRepository {
  async create(data: {
    jobId: string;
    teacherId: string;
    teacherProfileId: string;
    schoolId: string;
    coverLetter?: string;
    matchScore?: number;
  }): Promise<IApplication> {
    const referenceNumber = `APP-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const app = new Application({
      referenceNumber,
      jobId: new mongoose.Types.ObjectId(data.jobId),
      teacherId: new mongoose.Types.ObjectId(data.teacherId),
      teacherProfileId: new mongoose.Types.ObjectId(data.teacherProfileId),
      schoolId: new mongoose.Types.ObjectId(data.schoolId),
      coverLetter: data.coverLetter,
      matchScore: data.matchScore,
      status: 'submitted',
      statusHistory: [{ status: 'submitted', timestamp: new Date() }],
    });
    return app.save();
  }

  async findByTeacher(
    teacherId: string,
    status?: ApplicationStatus,
    page = 1,
    limit = 20
  ): Promise<{ applications: IApplication[]; total: number }> {
    const query: Record<string, unknown> = { teacherId: new mongoose.Types.ObjectId(teacherId) };
    if (status) query.status = status;

    const skip = (page - 1) * limit;
    const [applications, total] = await Promise.all([
      Application.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('jobId', 'title subjects city employmentType salary deadline')
        .populate('schoolId', 'name')
        .lean(),
      Application.countDocuments(query),
    ]);

    return { applications: applications as IApplication[], total };
  }

  async findById(id: string): Promise<IApplication | null> {
    return Application.findById(id)
      .populate('jobId')
      .populate('schoolId', 'name email');
  }

  async findByTeacherAndJob(teacherId: string, jobId: string): Promise<IApplication | null> {
    return Application.findOne({
      teacherId: new mongoose.Types.ObjectId(teacherId),
      jobId: new mongoose.Types.ObjectId(jobId),
    });
  }

  async updateStatus(
    applicationId: string,
    status: ApplicationStatus,
    note?: string,
    changedBy?: string
  ): Promise<IApplication | null> {
    const historyEntry: Record<string, unknown> = { status, timestamp: new Date() };
    if (note) historyEntry.note = note;
    if (changedBy) historyEntry.changedBy = new mongoose.Types.ObjectId(changedBy);

    return Application.findByIdAndUpdate(
      applicationId,
      {
        $set: { status },
        $push: { statusHistory: historyEntry },
      },
      { new: true }
    );
  }

  async withdraw(applicationId: string, teacherId: string): Promise<IApplication | null> {
    return Application.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(applicationId),
        teacherId: new mongoose.Types.ObjectId(teacherId),
        status: { $in: ['submitted', 'reviewing'] },
      },
      {
        $set: { status: 'withdrawn' },
        $push: { statusHistory: { status: 'withdrawn', timestamp: new Date() } },
      },
      { new: true }
    );
  }

  async getStats(teacherId: string): Promise<Record<string, number>> {
    const stats = await Application.aggregate([
      { $match: { teacherId: new mongoose.Types.ObjectId(teacherId) } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const result: Record<string, number> = {
      total: 0,
      submitted: 0,
      reviewing: 0,
      shortlisted: 0,
      interview_scheduled: 0,
      offer_extended: 0,
      hired: 0,
      rejected: 0,
      withdrawn: 0,
    };

    for (const s of stats) {
      result[s._id] = s.count;
      result.total += s.count;
    }

    return result;
  }

  async getResponseRate(teacherId: string): Promise<number> {
    const [total, responded] = await Promise.all([
      Application.countDocuments({ teacherId: new mongoose.Types.ObjectId(teacherId) }),
      Application.countDocuments({
        teacherId: new mongoose.Types.ObjectId(teacherId),
        status: { $in: ['shortlisted','interview_scheduled','offer_extended','hired','rejected'] },
      }),
    ]);
    if (!total) return 0;
    return Math.round((responded / total) * 100);
  }

  async incrementJobApplicationsCount(jobId: string): Promise<void> {
    const { Job } = await import('../../models/job.model');
    await Job.updateOne({ _id: new mongoose.Types.ObjectId(jobId) }, { $inc: { applicationsCount: 1 } });
  }
}

export const applicationsRepository = new ApplicationsRepository();
