import mongoose from 'mongoose';
import { Job } from '../../models/job.model';
import { Application } from '../../models/application.model';
import { Interview } from '../../models/interview.model';
import { Offer } from '../../models/offer.model';
import { schoolProfileRepository } from '../school-profile/school-profile.repository';

export class SchoolDashboardService {
  async getDashboard(schoolId: string): Promise<Record<string, unknown>> {
    const schoolObjId = new mongoose.Types.ObjectId(schoolId);

    const [
      profile,
      jobStats,
      appStats,
      upcomingInterviews,
      activeOffers,
      recentApplications,
      hiringFunnel,
    ] = await Promise.all([
      schoolProfileRepository.findByUserId(schoolId),

      // Job stats
      Job.aggregate([
        { $match: { schoolId: schoolObjId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      // Application stats
      Application.aggregate([
        { $match: { schoolId: schoolObjId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      // Upcoming interviews (next 14 days)
      Interview.find({
        schoolId: schoolObjId,
        status: { $in: ['pending', 'accepted'] },
        scheduledAt: { $gte: new Date(), $lte: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
      })
        .sort({ scheduledAt: 1 })
        .limit(5)
        .populate('teacherId', 'name email')
        .populate('jobId', 'title')
        .lean(),

      // Active offers
      Offer.find({ schoolId: schoolObjId, status: { $in: ['sent', 'viewed', 'negotiating'] } })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('teacherId', 'name email')
        .populate('jobId', 'title')
        .lean(),

      // Recent applications (last 7 days)
      Application.find({
        schoolId: schoolObjId,
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('teacherId', 'name email')
        .populate('jobId', 'title')
        .lean(),

      // Hiring funnel totals
      Application.aggregate([
        { $match: { schoolId: schoolObjId } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            reviewing: { $sum: { $cond: [{ $eq: ['$status', 'reviewing'] }, 1, 0] } },
            shortlisted: { $sum: { $cond: [{ $eq: ['$status', 'shortlisted'] }, 1, 0] } },
            interviewed: { $sum: { $cond: [{ $eq: ['$status', 'interview_scheduled'] }, 1, 0] } },
            offered: { $sum: { $cond: [{ $eq: ['$status', 'offer_extended'] }, 1, 0] } },
            hired: { $sum: { $cond: [{ $eq: ['$status', 'hired'] }, 1, 0] } },
          },
        },
      ]),
    ]);

    const jobsByStatus: Record<string, number> = {};
    for (const s of jobStats) jobsByStatus[s._id as string] = s.count as number;

    const appsByStatus: Record<string, number> = {};
    for (const s of appStats) appsByStatus[s._id as string] = s.count as number;

    const funnel = hiringFunnel[0] ?? { total: 0, reviewing: 0, shortlisted: 0, interviewed: 0, offered: 0, hired: 0 };
    delete (funnel as Record<string, unknown>)._id;

    return {
      profile: {
        completionPercentage: profile?.completionPercentage ?? 0,
        status: profile?.profileStatus ?? 'draft',
        nameAr: profile?.nameAr,
        nameEn: profile?.nameEn,
      },
      jobs: {
        byStatus: jobsByStatus,
        total: Object.values(jobsByStatus).reduce((a, b) => a + b, 0),
        active: jobsByStatus['active'] ?? 0,
      },
      applications: {
        byStatus: appsByStatus,
        recentCount: recentApplications.length,
        recent: recentApplications,
      },
      hiringFunnel: funnel,
      upcomingInterviews,
      activeOffers,
    };
  }

  async getAnalytics(schoolId: string): Promise<Record<string, unknown>> {
    const schoolObjId = new mongoose.Types.ObjectId(schoolId);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      applicationTrend,
      topJobs,
      timeToHire,
      hiredCount,
    ] = await Promise.all([
      // Applications per day (last 30 days)
      Application.aggregate([
        { $match: { schoolId: schoolObjId, createdAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Top performing jobs by applications
      Application.aggregate([
        { $match: { schoolId: schoolObjId } },
        { $group: { _id: '$jobId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'jobs',
            localField: '_id',
            foreignField: '_id',
            as: 'job',
          },
        },
        { $unwind: { path: '$job', preserveNullAndEmptyArrays: false } },
        { $project: { count: 1, 'job.title': 1, 'job.status': 1 } },
      ]),

      // Average time to hire (submitted → hired) in days
      Application.aggregate([
        { $match: { schoolId: schoolObjId, status: 'hired' } },
        {
          $project: {
            daysToHire: {
              $divide: [
                { $subtract: ['$updatedAt', '$createdAt'] },
                1000 * 60 * 60 * 24,
              ],
            },
          },
        },
        { $group: { _id: null, avgDays: { $avg: '$daysToHire' } } },
      ]),

      Application.countDocuments({ schoolId: schoolObjId, status: 'hired' }),
    ]);

    return {
      applicationTrend,
      topJobs,
      averageTimeToHire: timeToHire[0]?.avgDays ? Math.round(timeToHire[0].avgDays) : null,
      totalHired: hiredCount,
    };
  }

  async getJobAnalytics(schoolId: string, jobId: string): Promise<Record<string, unknown>> {
    const schoolObjId = new mongoose.Types.ObjectId(schoolId);
    const jobObjId = new mongoose.Types.ObjectId(jobId);

    const [job, appStats, interviewStats] = await Promise.all([
      Job.findOne({ _id: jobObjId, schoolId: schoolObjId }).lean(),

      Application.aggregate([
        { $match: { schoolId: schoolObjId, jobId: jobObjId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      Interview.aggregate([
        { $match: { schoolId: schoolObjId, jobId: jobObjId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    if (!job) return {};

    const byStatus: Record<string, number> = {};
    for (const s of appStats) byStatus[s._id as string] = s.count as number;

    const interviewsByStatus: Record<string, number> = {};
    for (const s of interviewStats) interviewsByStatus[s._id as string] = s.count as number;

    return {
      job,
      applications: { byStatus, total: Object.values(byStatus).reduce((a, b) => a + b, 0) },
      interviews: { byStatus: interviewsByStatus },
    };
  }
}

export const schoolDashboardService = new SchoolDashboardService();
