import mongoose from 'mongoose';
import { Application, IApplication } from '../../models/application.model';

export interface SchoolAppFilters {
  jobId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export class SchoolApplicationsRepository {
  async findBySchool(
    schoolId: string,
    filters: SchoolAppFilters
  ): Promise<{ applications: IApplication[]; total: number }> {
    const query: Record<string, unknown> = { schoolId: new mongoose.Types.ObjectId(schoolId) };
    if (filters.jobId) query.jobId = new mongoose.Types.ObjectId(filters.jobId);
    if (filters.status) query.status = filters.status;

    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 50);
    const skip = (page - 1) * limit;

    const [applications, total] = await Promise.all([
      Application.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('teacherId', 'name email')
        .populate('jobId', 'title city')
        .lean(),
      Application.countDocuments(query),
    ]);

    return { applications: applications as IApplication[], total };
  }

  async findByIdAndSchool(appId: string, schoolId: string): Promise<IApplication | null> {
    return Application.findOne({
      _id: new mongoose.Types.ObjectId(appId),
      schoolId: new mongoose.Types.ObjectId(schoolId),
    })
      .populate('teacherId', 'name email')
      .populate('jobId', 'title city subjects gradeLevels')
      .populate('teacherProfileId');
  }

  async updateStatus(
    appId: string,
    schoolId: string,
    status: string,
    meta: { note?: string; rejectionReason?: string }
  ): Promise<IApplication | null> {
    const historyEntry = {
      status,
      timestamp: new Date(),
      note: meta.note,
    };

    const set: Record<string, unknown> = { status };
    if (meta.rejectionReason) set.rejectionReason = meta.rejectionReason;

    return Application.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(appId), schoolId: new mongoose.Types.ObjectId(schoolId) },
      {
        $set: set,
        $push: { statusHistory: historyEntry },
      },
      { new: true }
    );
  }

  async markRead(appId: string, schoolId: string): Promise<void> {
    await Application.updateOne(
      { _id: new mongoose.Types.ObjectId(appId), schoolId: new mongoose.Types.ObjectId(schoolId) },
      { $set: { isRead: true } }
    );
  }

  async getStatsByJob(
    schoolId: string,
    jobId: string
  ): Promise<{ _id: string; count: number }[]> {
    return Application.aggregate([
      {
        $match: {
          schoolId: new mongoose.Types.ObjectId(schoolId),
          jobId: new mongoose.Types.ObjectId(jobId),
        },
      },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
  }
}

export const schoolApplicationsRepository = new SchoolApplicationsRepository();
