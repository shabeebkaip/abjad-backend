import mongoose from 'mongoose';
import SchoolProfile from '../../models/school-profile.model';
import TeacherProfile from '../../models/teacher-profile.model';
import { SupportTicket, TicketStatus } from '../../models/support-ticket.model';
import { Job } from '../../models/job.model';
import { Application } from '../../models/application.model';
import { Interview } from '../../models/interview.model';
import { Offer } from '../../models/offer.model';

function getDateRangeStart(range: string): Date {
  const ms = {
    today:        1  * 24 * 60 * 60 * 1000,
    this_week:    7  * 24 * 60 * 60 * 1000,
    this_month:   30 * 24 * 60 * 60 * 1000,
    last_quarter: 90 * 24 * 60 * 60 * 1000,
    this_year:   365 * 24 * 60 * 60 * 1000,
  }[range] ?? 30 * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - ms);
}

export class AdminRepository {
  // ── Schools ───────────────────────────────────────────────

  async listSchools(filters: { status?: string; page: number; limit: number }) {
    const query: Record<string, unknown> = {};
    if (filters.status) query.profileStatus = filters.status;
    const skip = (filters.page - 1) * filters.limit;
    const [schools, total] = await Promise.all([
      SchoolProfile.find(query)
        .sort({ submittedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(filters.limit)
        .lean(),
      SchoolProfile.countDocuments(query),
    ]);
    return { schools, total };
  }

  async getSchoolById(profileId: string) {
    return SchoolProfile.findById(profileId).lean();
  }

  async approveSchool(profileId: string, adminNotes?: string) {
    return SchoolProfile.findByIdAndUpdate(
      profileId,
      {
        $set: {
          profileStatus: 'verified',
          verifiedAt: new Date(),
          adminNotes: adminNotes ?? '',
          rejectionReason: '',
        },
      },
      { new: true }
    );
  }

  async rejectSchool(profileId: string, rejectionReason: string, adminNotes?: string) {
    return SchoolProfile.findByIdAndUpdate(
      profileId,
      {
        $set: {
          profileStatus: 'rejected',
          rejectionReason,
          adminNotes: adminNotes ?? '',
        },
      },
      { new: true }
    );
  }

  // ── Teachers ──────────────────────────────────────────────

  async listTeachers(filters: { status?: string; page: number; limit: number }) {
    const query: Record<string, unknown> = {};
    if (filters.status) query.profileStatus = filters.status;
    const skip = (filters.page - 1) * filters.limit;
    const [teachers, total] = await Promise.all([
      TeacherProfile.find(query)
        .sort({ submittedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(filters.limit)
        .lean(),
      TeacherProfile.countDocuments(query),
    ]);
    return { teachers, total };
  }

  async getTeacherById(profileId: string) {
    return TeacherProfile.findById(profileId).lean();
  }

  // Detail-page variant — populates User so admin sees email + identity.
  async getTeacherByIdWithUser(profileId: string) {
    return TeacherProfile.findById(profileId)
      .populate('userId', 'email firstName lastName createdAt')
      .lean();
  }

  async approveTeacher(profileId: string, adminNotes?: string) {
    return TeacherProfile.findByIdAndUpdate(
      profileId,
      {
        $set: {
          profileStatus: 'approved',
          approvedAt: new Date(),
          adminNotes: adminNotes ?? '',
          rejectionReason: '',
        },
      },
      { new: true }
    );
  }

  async rejectTeacher(profileId: string, rejectionReason: string, adminNotes?: string) {
    return TeacherProfile.findByIdAndUpdate(
      profileId,
      {
        $set: {
          profileStatus: 'rejected',
          rejectionReason,
          adminNotes: adminNotes ?? '',
        },
      },
      { new: true }
    );
  }

  // ── Dashboard stats ───────────────────────────────────────

  async getStats() {
    const [schoolStats, teacherStats] = await Promise.all([
      SchoolProfile.aggregate([{ $group: { _id: '$profileStatus', count: { $sum: 1 } } }]),
      TeacherProfile.aggregate([{ $group: { _id: '$profileStatus', count: { $sum: 1 } } }]),
    ]);

    const toMap = (arr: { _id: string; count: number }[]) =>
      arr.reduce<Record<string, number>>((acc, { _id, count }) => {
        acc[_id] = count;
        return acc;
      }, {});

    return { schools: toMap(schoolStats), teachers: toMap(teacherStats) };
  }

  // ── Interviews ───────────────────────────────────────────

  async listAllInterviews(filters: {
    status?: string;
    period?: 'upcoming' | 'past' | 'all';
    page: number;
    limit: number;
  }) {
    const query: Record<string, unknown> = {};
    if (filters.status && filters.status !== 'all') query.status = filters.status;
    if (filters.period === 'upcoming') query.scheduledAt = { $gte: new Date() };
    if (filters.period === 'past')     query.scheduledAt = { $lt:  new Date() };

    const skip = (filters.page - 1) * filters.limit;
    const sort = filters.period === 'past' ? { scheduledAt: -1 } : { scheduledAt: 1 };

    const [interviews, total] = await Promise.all([
      Interview.find(query)
        .sort(sort as Record<string, 1 | -1>)
        .skip(skip)
        .limit(filters.limit)
        .populate('teacherId', 'email firstName lastName')
        .populate('jobId',     'title city subjects')
        .populate('schoolId',  'email schoolName')
        .lean(),
      Interview.countDocuments(query),
    ]);

    return { interviews, total };
  }

  // ── Applications ─────────────────────────────────────────

  async listAllApplications(filters: {
    status?: string;
    page: number;
    limit: number;
  }) {
    const query: Record<string, unknown> = {};
    if (filters.status && filters.status !== 'all') query.status = filters.status;

    const skip = (filters.page - 1) * filters.limit;
    const [applications, total] = await Promise.all([
      Application.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(filters.limit)
        .populate('teacherId', 'email firstName lastName')
        .populate('teacherProfileId', 'personal.fullNameEn personal.fullNameAr professional.subjects')
        .populate('jobId', 'title city subjects')
        .populate('schoolId', 'email schoolName')
        .lean(),
      Application.countDocuments(query),
    ]);

    return { applications, total };
  }

  // ── Support Tickets ───────────────────────────────────────

  async listAllTickets(filters: {
    status?: string;
    priority?: string;
    page: number;
    limit: number;
  }) {
    const query: Record<string, unknown> = {};
    if (filters.status && filters.status !== 'all') query.status = filters.status;
    if (filters.priority) query.priority = filters.priority;

    const skip = (filters.page - 1) * filters.limit;
    const [tickets, total] = await Promise.all([
      SupportTicket.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(filters.limit)
        .populate('userId', 'email firstName lastName schoolName role')
        .lean(),
      SupportTicket.countDocuments(query),
    ]);

    return { tickets, total };
  }

  async getTicketById(id: string) {
    return SupportTicket.findById(id)
      .populate('userId', 'email firstName lastName schoolName role')
      .lean();
  }

  async adminReplyToTicket(ticketId: string, adminId: string, content: string) {
    return SupportTicket.findByIdAndUpdate(
      ticketId,
      {
        $push: {
          messages: {
            senderId: new mongoose.Types.ObjectId(adminId),
            senderRole: 'admin',
            content,
            attachments: [],
            timestamp: new Date(),
          },
        },
        $set: { status: 'in_progress' },
      },
      { new: true },
    );
  }

  async updateTicketStatus(ticketId: string, status: TicketStatus) {
    const update: Record<string, unknown> = { status };
    if (status === 'resolved') update.resolvedAt = new Date();
    if (status === 'closed')   update.closedAt   = new Date();
    return SupportTicket.findByIdAndUpdate(ticketId, { $set: update }, { new: true });
  }

  // ── Jobs (Content Moderation) ─────────────────────────────

  async listAllJobs(filters: { status?: string; page: number; limit: number }) {
    const query: Record<string, unknown> = {};
    if (filters.status && filters.status !== 'all') {
      query.status = filters.status;
    } else {
      query.status = { $ne: 'draft' }; // exclude school drafts from admin view
    }

    const skip = (filters.page - 1) * filters.limit;
    const [jobs, total] = await Promise.all([
      Job.find(query).sort({ createdAt: -1 }).skip(skip).limit(filters.limit).lean(),
      Job.countDocuments(query),
    ]);

    return { jobs, total };
  }

  async updateJobStatus(jobId: string, status: string) {
    return Job.findByIdAndUpdate(jobId, { $set: { status } }, { new: true });
  }

  // ── Teacher Activity ──────────────────────────────────────

  async getTeacherActivity(userId: string) {
    const uid = new mongoose.Types.ObjectId(userId);
    const [applications, interviews, offers] = await Promise.all([
      Application.find({ teacherId: uid })
        .sort({ createdAt: -1 })
        .populate('jobId', 'title city')
        .populate('schoolId', 'schoolName')
        .lean(),
      Interview.find({ teacherId: uid })
        .sort({ scheduledAt: -1 })
        .populate('jobId', 'title')
        .populate('schoolId', 'schoolName')
        .lean(),
      Offer.find({ teacherId: uid })
        .sort({ createdAt: -1 })
        .populate('jobId', 'title')
        .populate('schoolId', 'schoolName')
        .lean(),
    ]);
    return { applications, interviews, offers };
  }

  // ── School Activity ───────────────────────────────────────

  async getSchoolActivity(userId: string) {
    const uid = new mongoose.Types.ObjectId(userId);
    const [jobs, applications, interviews, offers] = await Promise.all([
      Job.find({ schoolId: uid }).sort({ createdAt: -1 }).lean(),
      Application.find({ schoolId: uid })
        .sort({ createdAt: -1 })
        .populate('jobId', 'title')
        .populate('teacherId', 'firstName lastName email')
        .populate('teacherProfileId', 'personal.fullNameEn personal.fullNameAr')
        .lean(),
      Interview.find({ schoolId: uid })
        .sort({ scheduledAt: -1 })
        .populate('jobId', 'title')
        .populate('teacherId', 'firstName lastName email')
        .lean(),
      Offer.find({ schoolId: uid })
        .sort({ createdAt: -1 })
        .populate('jobId', 'title')
        .populate('teacherId', 'firstName lastName email')
        .lean(),
    ]);
    return { jobs, applications, interviews, offers };
  }

  // ── Report Generation ─────────────────────────────────────

  async generateReport(type: string, dateRange: string): Promise<{ rows: Record<string, string>[]; total: number }> {
    const since = getDateRangeStart(dateRange);

    if (type === 'registrations') {
      const [rows, total] = await Promise.all([
        TeacherProfile.find({ createdAt: { $gte: since } })
          .sort({ createdAt: -1 })
          .limit(100)
          .populate('userId', 'email')
          .lean(),
        TeacherProfile.countDocuments({ createdAt: { $gte: since } }),
      ]);
      return {
        total,
        rows: rows.map((t) => {
          const user = t.userId as { email?: string } | null;
          return {
            name: t.personal?.fullNameEn ?? t.personal?.fullNameAr ?? '—',
            email: user?.email ?? '—',
            subject: (t.professional?.subjects?.[0] ?? '—').replace(/_/g, ' '),
            city: t.locationPreferences?.preferredCities?.[0] ?? '—',
            status: t.profileStatus,
            joinedDate: t.createdAt ? new Date(t.createdAt as Date).toLocaleDateString('en-SA') : '—',
            profileCompletion: `${t.completionPercentage ?? 0}%`,
          };
        }),
      };
    }

    if (type === 'applications') {
      const [rows, total] = await Promise.all([
        Application.find({ createdAt: { $gte: since } })
          .sort({ createdAt: -1 })
          .limit(100)
          .populate('teacherProfileId', 'personal.fullNameEn personal.fullNameAr')
          .populate('jobId', 'title')
          .populate('schoolId', 'email schoolName')
          .lean(),
        Application.countDocuments({ createdAt: { $gte: since } }),
      ]);
      return {
        total,
        rows: rows.map((a) => {
          const profile = a.teacherProfileId as { personal?: { fullNameEn?: string; fullNameAr?: string } } | null;
          const job = a.jobId as { title?: string } | null;
          const school = a.schoolId as { schoolName?: string; email?: string } | null;
          return {
            teacherName: profile?.personal?.fullNameEn ?? profile?.personal?.fullNameAr ?? '—',
            jobTitle: job?.title ?? '—',
            school: school?.schoolName ?? school?.email ?? '—',
            status: a.status,
            appliedDate: new Date(a.createdAt as Date).toLocaleDateString('en-SA'),
            lastUpdated: new Date(a.updatedAt as Date).toLocaleDateString('en-SA'),
          };
        }),
      };
    }

    if (type === 'support') {
      const [rows, total] = await Promise.all([
        SupportTicket.find({ createdAt: { $gte: since } })
          .sort({ createdAt: -1 })
          .limit(100)
          .populate('userId', 'email firstName lastName schoolName role')
          .lean(),
        SupportTicket.countDocuments({ createdAt: { $gte: since } }),
      ]);
      return {
        total,
        rows: rows.map((t) => {
          const user = t.userId as { email?: string; firstName?: string; lastName?: string; schoolName?: string } | null;
          const userName = user?.firstName
            ? `${user.firstName} ${user.lastName ?? ''}`.trim()
            : user?.schoolName ?? user?.email ?? '—';
          return {
            ticketId: (t as { ticketNumber?: string }).ticketNumber ?? (t._id as { toString(): string }).toString().slice(-6).toUpperCase(),
            user: userName,
            priority: t.priority,
            status: t.status,
            created: new Date(t.createdAt as Date).toLocaleDateString('en-SA'),
            resolved: t.resolvedAt ? new Date(t.resolvedAt as Date).toLocaleDateString('en-SA') : '—',
          };
        }),
      };
    }

    // financial — payment system not yet implemented
    return { rows: [], total: 0 };
  }

  // ── Enhanced Stats (Reports) ──────────────────────────────

  async getEnhancedStats() {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const toMap = (arr: { _id: string; count: number }[]) =>
      arr.reduce<Record<string, number>>((acc, { _id, count }) => {
        acc[_id] = count;
        return acc;
      }, {});

    const [
      schoolStats,
      teacherStats,
      applicationStats,
      jobStats,
      hiringFunnelRaw,
      teacherTrend,
      applicationTrend,
    ] = await Promise.all([
      SchoolProfile.aggregate([{ $group: { _id: '$profileStatus', count: { $sum: 1 } } }]),
      TeacherProfile.aggregate([{ $group: { _id: '$profileStatus', count: { $sum: 1 } } }]),
      Application.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Job.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Application.aggregate([{
        $group: {
          _id: null,
          total:        { $sum: 1 },
          reviewing:    { $sum: { $cond: [{ $in: ['$status', ['reviewing','shortlisted','interview_scheduled','offer_extended','hired']] }, 1, 0] } },
          shortlisted:  { $sum: { $cond: [{ $in: ['$status', ['shortlisted','interview_scheduled','offer_extended','hired']] }, 1, 0] } },
          interviewed:  { $sum: { $cond: [{ $in: ['$status', ['interview_scheduled','offer_extended','hired']] }, 1, 0] } },
          offered:      { $sum: { $cond: [{ $in: ['$status', ['offer_extended','hired']] }, 1, 0] } },
          hired:        { $sum: { $cond: [{ $eq:  ['$status', 'hired'] }, 1, 0] } },
        },
      }]),
      TeacherProfile.aggregate([
        { $match: { createdAt: { $gte: sixMonthsAgo } } },
        { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
      Application.aggregate([
        { $match: { createdAt: { $gte: sixMonthsAgo } } },
        { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
    ]);

    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const formatTrend = (raw: { _id: { year: number; month: number }; count: number }[]) =>
      raw.map((r) => ({ month: MONTH_NAMES[r._id.month - 1], count: r.count }));

    return {
      schools:          toMap(schoolStats),
      teachers:         toMap(teacherStats),
      applications:     toMap(applicationStats),
      jobs:             toMap(jobStats),
      hiringFunnel:     hiringFunnelRaw[0] ?? { total: 0, reviewing: 0, shortlisted: 0, interviewed: 0, offered: 0, hired: 0 },
      teacherTrend:     formatTrend(teacherTrend),
      applicationTrend: formatTrend(applicationTrend),
    };
  }
}

export const adminRepository = new AdminRepository();
