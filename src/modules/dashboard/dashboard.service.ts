import mongoose from 'mongoose';
import { teacherProfileRepository } from '../teacher-profile/teacher-profile.repository';
import { Application } from '../../models/application.model';
import { Interview } from '../../models/interview.model';
import { Offer } from '../../models/offer.model';
import { Notification } from '../../models/notification.model';
import ProfileChangeLog from '../../models/profile-change-log.model';
import { jobsRepository } from '../jobs/jobs.repository';

// SRD 2.10.3 — Activity Feed entry shape
export interface ActivityEntry {
  type: 'application_submitted'
      | 'application_status'
      | 'interview_scheduled'
      | 'interview_response'
      | 'offer_received'
      | 'offer_response'
      | 'profile_update';
  title: string;
  timestamp: Date;
  link?: string;
}

const STATUS_LABEL: Record<string, string> = {
  submitted:           'submitted',
  reviewing:           'under review',
  shortlisted:         'shortlisted',
  interview_scheduled: 'moved to interview',
  offer_extended:      'offer extended',
  hired:               'hired',
  rejected:            'rejected',
  withdrawn:           'withdrawn',
};

const SECTION_LABEL: Record<string, string> = {
  personal:            'personal info',
  professional:        'professional info',
  education:           'education',
  certifications:      'certifications',
  languages:           'languages',
  locationPreferences: 'location preferences',
  salaryExpectations:  'salary expectations',
  resume:              'CV / resume',
  photo:               'profile photo',
};

const ACTIVITY_LIMIT = 12;
const ACTIVITY_LOOKBACK_DAYS = 30;

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

    // SRD 5.1.1 — top 10 scored recommendations with per-criterion breakdown
    const recommendations = profile
      ? await jobsRepository.findRecommended(profile, 10)
      : [];

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

    // SRD 2.10.3 — build the activity feed inline so it lands in the same
    // dashboard fetch (no extra round-trip from the frontend).
    const activity = await this.buildActivity(teacherObjectId, profile?._id);

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
      activity,
    };
  }

  // SRD 2.10.3 — aggregates the teacher's recent actions across applications,
  // interviews, offers, and profile changes, sorts by timestamp, returns the
  // most recent N. 30-day lookback keeps the query bounded.
  private async buildActivity(
    teacherObjectId: mongoose.Types.ObjectId,
    profileId?: mongoose.Types.ObjectId,
  ): Promise<ActivityEntry[]> {
    const since = new Date(Date.now() - ACTIVITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    const [apps, interviews, offers, profileChanges] = await Promise.all([
      Application.find({ teacherId: teacherObjectId, createdAt: { $gte: since } })
        .populate('jobId', 'title')
        .select('statusHistory jobId createdAt')
        .lean(),
      Interview.find({ teacherId: teacherObjectId, createdAt: { $gte: since } })
        .populate('jobId', 'title')
        .select('teacherResponse jobId scheduledAt createdAt')
        .lean(),
      Offer.find({ teacherId: teacherObjectId, createdAt: { $gte: since } })
        .populate('jobId', 'title')
        .select('teacherResponse jobId position createdAt')
        .lean(),
      profileId
        ? ProfileChangeLog.find({ teacherProfileId: profileId, createdAt: { $gte: since } })
            .select('section createdAt')
            .lean()
        : Promise.resolve([]),
    ]);

    const entries: ActivityEntry[] = [];

    // Applications — one entry per statusHistory entry
    for (const raw of apps as Array<{ statusHistory?: Array<{ status: string; timestamp: Date }>; jobId?: { title?: string } | null }>) {
      const jobTitle = raw.jobId?.title ?? 'a position';
      for (const h of raw.statusHistory ?? []) {
        if (new Date(h.timestamp) < since) continue;
        entries.push({
          type: h.status === 'submitted' ? 'application_submitted' : 'application_status',
          title: h.status === 'submitted'
            ? `Applied to "${jobTitle}"`
            : `"${jobTitle}" — ${STATUS_LABEL[h.status] ?? h.status}`,
          timestamp: new Date(h.timestamp),
          link: '/applications',
        });
      }
    }

    // Interviews — created event + teacher response event
    for (const iv of interviews as Array<{ jobId?: { title?: string } | null; createdAt: Date; teacherResponse?: { action?: string; respondedAt?: Date } | null }>) {
      const jobTitle = iv.jobId?.title ?? 'a role';
      entries.push({
        type: 'interview_scheduled',
        title: `Interview invitation for "${jobTitle}"`,
        timestamp: new Date(iv.createdAt),
        link: '/interviews',
      });
      const tr = iv.teacherResponse;
      if (tr?.respondedAt && tr.action) {
        const label = tr.action === 'reschedule_requested' ? 'requested a reschedule for' : `${tr.action} the interview for`;
        entries.push({
          type: 'interview_response',
          title: `You ${label} "${jobTitle}"`,
          timestamp: new Date(tr.respondedAt),
          link: '/interviews',
        });
      }
    }

    // Offers — received event + teacher response event
    for (const o of offers as Array<{ jobId?: { title?: string } | null; position?: string; createdAt: Date; teacherResponse?: { action?: string; respondedAt?: Date } | null }>) {
      const role = o.jobId?.title ?? o.position ?? 'a role';
      entries.push({
        type: 'offer_received',
        title: `Offer received for "${role}"`,
        timestamp: new Date(o.createdAt),
        link: '/applications',
      });
      const tr = o.teacherResponse;
      if (tr?.respondedAt && tr.action) {
        const label = tr.action === 'negotiate' ? 'asked to negotiate' : `${tr.action} the offer`;
        entries.push({
          type: 'offer_response',
          title: `You ${label} for "${role}"`,
          timestamp: new Date(tr.respondedAt),
          link: '/applications',
        });
      }
    }

    // Profile updates
    for (const p of profileChanges as Array<{ section: string; createdAt: Date }>) {
      entries.push({
        type: 'profile_update',
        title: `Updated ${SECTION_LABEL[p.section] ?? p.section}`,
        timestamp: new Date(p.createdAt),
        link: '/profile',
      });
    }

    return entries
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, ACTIVITY_LIMIT);
  }
}

export const dashboardService = new DashboardService();
