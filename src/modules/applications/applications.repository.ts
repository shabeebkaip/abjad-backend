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

  // Bulk lookup — returns the set of jobIds the teacher has applied to (any
  // non-withdrawn application). Used by listJobs to flag isApplied on each
  // result so the listing UI can show "Applied" or hide the apply button.
  async getAppliedJobIds(teacherId: string): Promise<Set<string>> {
    const docs = await Application.find({
      teacherId: new mongoose.Types.ObjectId(teacherId),
      status: { $ne: 'withdrawn' },
    }).select('jobId').lean();
    return new Set(docs.map((d) => (d as { jobId: { toString(): string } }).jobId.toString()));
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

  // SRD 2.5.4 — average hours from "submitted" to the first school-side response
  // (reviewing/shortlisted/interview_scheduled/offer_extended/hired/rejected).
  // Withdrawn entries don't count as responses. Returns null when no apps have
  // been responded to yet, so the UI can show "—" instead of "0h".
  async getAvgResponseHours(teacherId: string): Promise<number | null> {
    const RESPONDED_STATUSES = ['reviewing','shortlisted','interview_scheduled','offer_extended','hired','rejected'];
    const docs = await Application.find({
      teacherId: new mongoose.Types.ObjectId(teacherId),
      status: { $in: RESPONDED_STATUSES },
    }).select('statusHistory').lean();

    const diffs: number[] = [];
    for (const doc of docs) {
      const history = ((doc as { statusHistory?: Array<{ status: string; timestamp: Date }> }).statusHistory) ?? [];
      const submittedAt = history.find((h) => h.status === 'submitted')?.timestamp;
      const firstResponse = history.find((h) => RESPONDED_STATUSES.includes(h.status))?.timestamp;
      if (submittedAt && firstResponse) {
        const ms = new Date(firstResponse).getTime() - new Date(submittedAt).getTime();
        if (ms >= 0) diffs.push(ms / 3_600_000);
      }
    }

    if (diffs.length === 0) return null;
    return Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
  }

  async incrementJobApplicationsCount(jobId: string): Promise<void> {
    const { Job } = await import('../../models/job.model');
    await Job.updateOne({ _id: new mongoose.Types.ObjectId(jobId) }, { $inc: { applicationsCount: 1 } });
  }

  // SRD 3.2.4 — auto-close a job when its applicationsCount has reached maxApplications.
  // Race-safe: the filter performs the cap check inside the same query as the status flip.
  // Returns true iff the job was just transitioned to "closed" by this call.
  async closeJobIfFull(jobId: string): Promise<boolean> {
    const { Job } = await import('../../models/job.model');
    const result = await Job.updateOne(
      {
        _id: new mongoose.Types.ObjectId(jobId),
        autoCloseOnMax: true,
        status: 'active',
        maxApplications: { $gt: 0 },
        $expr: { $gte: ['$applicationsCount', '$maxApplications'] },
      },
      { $set: { status: 'closed' } },
    );
    return result.modifiedCount > 0;
  }
}

export const applicationsRepository = new ApplicationsRepository();
