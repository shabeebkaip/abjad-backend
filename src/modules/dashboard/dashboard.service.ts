import mongoose from 'mongoose';
import { teacherProfileRepository } from '../teacher-profile/teacher-profile.repository';
import { Application } from '../../models/application.model';
import { Interview } from '../../models/interview.model';
import { Offer } from '../../models/offer.model';
import { Notification } from '../../models/notification.model';
import { jobsRepository } from '../jobs/jobs.repository';
import { IProfessionalInfo, ILocationPreferences } from '../../models/teacher-profile.model';

export class DashboardService {
  async getTeacherDashboard(teacherId: string) {
    const teacherObjectId = new mongoose.Types.ObjectId(teacherId);

    const [
      profile,
      applicationStats,
      upcomingInterviews,
      activeOffers,
      recentNotifications,
    ] = await Promise.all([
      teacherProfileRepository.findByUserId(teacherId),

      Application.aggregate([
        { $match: { teacherId: teacherObjectId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      Interview.find({
        teacherId: teacherObjectId,
        status: { $in: ['pending', 'accepted'] },
        scheduledAt: { $gte: new Date() },
      })
        .sort({ scheduledAt: 1 })
        .limit(3)
        .populate('jobId', 'title')
        .populate('schoolId', 'name')
        .lean(),

      Offer.find({
        teacherId: teacherObjectId,
        status: { $in: ['sent', 'viewed'] },
        deadline: { $gte: new Date() },
      })
        .sort({ deadline: 1 })
        .limit(3)
        .populate('jobId', 'title')
        .populate('schoolId', 'name')
        .lean(),

      Notification.find({ userId: teacherObjectId })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ]);

    // Process application stats
    const appStats: Record<string, number> = { total: 0 };
    for (const s of applicationStats) {
      appStats[s._id as string] = s.count as number;
      appStats.total += s.count as number;
    }

    // Get recommendations based on profile
    let recommendations: Awaited<ReturnType<typeof jobsRepository.findRecommended>> = [];
    if (profile) {
      const prof = profile.professional as IProfessionalInfo;
      const loc = profile.locationPreferences as ILocationPreferences;
      recommendations = await jobsRepository.findRecommended(
        prof?.subjects ?? [],
        prof?.gradeLevels ?? [],
        (loc?.preferredCities as string[]) ?? [],
        5
      );
    }

    // Profile completion suggestions
    const suggestions: string[] = [];
    if (profile) {
      if (!profile.personal?.photoUrl) suggestions.push('Add a profile photo');
      if (!profile.professional?.subjects?.length) suggestions.push('Add subjects you teach');
      if (!profile.education?.degreeType) suggestions.push('Add your education details');
      if (!profile.resume?.fileUrl) suggestions.push('Upload your CV/Resume');
      if (!profile.languages?.length) suggestions.push('Add your language proficiencies');
    }

    const unreadCount = await Notification.countDocuments({ userId: teacherObjectId, isRead: false });

    return {
      profile: {
        completionPercentage: profile?.completionPercentage ?? 0,
        status: profile?.profileStatus ?? 'draft',
        suggestions,
      },
      applications: {
        stats: appStats,
        activeCount: (appStats.submitted ?? 0) + (appStats.reviewing ?? 0) + (appStats.shortlisted ?? 0),
      },
      upcomingInterviews,
      activeOffers,
      recommendations,
      notifications: {
        recent: recentNotifications,
        unreadCount,
      },
    };
  }
}

export const dashboardService = new DashboardService();
