import mongoose from 'mongoose';
import { Job, IJob } from '../../models/job.model';
import { Application } from '../../models/application.model';

export interface SchoolJobFilters {
  status?: string;
  city?: string;
  page?: number;
  limit?: number;
}

export class SchoolJobsRepository {
  async create(schoolId: string, data: Record<string, unknown>): Promise<IJob> {
    const job = await Job.create({ ...data, schoolId: new mongoose.Types.ObjectId(schoolId), status: 'draft' });
    return job;
  }

  async findBySchool(schoolId: string, filters: SchoolJobFilters): Promise<{ jobs: IJob[]; total: number }> {
    const query: Record<string, unknown> = { schoolId: new mongoose.Types.ObjectId(schoolId) };
    if (filters.status) query.status = filters.status;
    if (filters.city) query.city = filters.city;

    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 50);
    const skip = (page - 1) * limit;

    const [jobs, total] = await Promise.all([
      Job.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Job.countDocuments(query),
    ]);

    return { jobs: jobs as IJob[], total };
  }

  async findByIdAndSchool(jobId: string, schoolId: string): Promise<IJob | null> {
    return Job.findOne({
      _id: new mongoose.Types.ObjectId(jobId),
      schoolId: new mongoose.Types.ObjectId(schoolId),
    });
  }

  async update(jobId: string, schoolId: string, data: Record<string, unknown>): Promise<IJob | null> {
    return Job.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(jobId), schoolId: new mongoose.Types.ObjectId(schoolId) },
      { $set: data },
      { new: true }
    );
  }

  async publish(jobId: string, schoolId: string): Promise<IJob | null> {
    return Job.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(jobId), schoolId: new mongoose.Types.ObjectId(schoolId), status: 'draft' },
      { $set: { status: 'active' } },
      { new: true }
    );
  }

  async close(jobId: string, schoolId: string): Promise<IJob | null> {
    return Job.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(jobId),
        schoolId: new mongoose.Types.ObjectId(schoolId),
        status: { $in: ['active', 'draft'] },
      },
      { $set: { status: 'closed' } },
      { new: true }
    );
  }

  async delete(jobId: string, schoolId: string): Promise<boolean> {
    const result = await Job.deleteOne({
      _id: new mongoose.Types.ObjectId(jobId),
      schoolId: new mongoose.Types.ObjectId(schoolId),
      status: 'draft',
    });
    return result.deletedCount > 0;
  }

  async getStats(jobId: string, schoolId: string): Promise<Record<string, unknown> | null> {
    const job = await Job.findOne({
      _id: new mongoose.Types.ObjectId(jobId),
      schoolId: new mongoose.Types.ObjectId(schoolId),
    }).lean();

    if (!job) return null;

    const statusCounts = await Application.aggregate([
      { $match: { jobId: new mongoose.Types.ObjectId(jobId) } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const byStatus: Record<string, number> = {};
    for (const s of statusCounts) {
      byStatus[s._id as string] = s.count as number;
    }

    return {
      job,
      applications: {
        total: (job as IJob & { applicationsCount?: number }).applicationsCount ?? 0,
        byStatus,
      },
      views: (job as IJob & { viewsCount?: number }).viewsCount ?? 0,
    };
  }
}

export const schoolJobsRepository = new SchoolJobsRepository();
