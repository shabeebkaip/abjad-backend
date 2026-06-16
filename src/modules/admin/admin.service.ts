import bcrypt from 'bcrypt';
import { adminRepository } from './admin.repository';
import { AppError } from '../../utils/app-error.util';
import { signAccessToken, signRefreshToken, hashToken, JwtPayload } from '../../utils/jwt.util';
import authRepository from '../auth/auth.repository';
import User from '../../models/user.model';
import { sendEmail } from '../../utils/email.util';
import { tplProfileApproved, tplProfileRejected, tplSchoolVerified, tplSchoolRejected } from '../../utils/email-templates.util';
import TeacherProfile from '../../models/teacher-profile.model';
import SchoolProfile from '../../models/school-profile.model';
import ProfileChangeLog from '../../models/profile-change-log.model';

export class AdminService {
  // ── Admin Login ───────────────────────────────────────────

  async login(email: string, password: string): Promise<{ user: object; accessToken: string }> {
    // @ts-ignore
    const User = (await import('../../models/user.model')).default;

    // Fetch with password field (select: false by default)
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) throw AppError.unauthorized('Invalid email or password');
    if (user.role !== 'admin') throw AppError.forbidden('Access denied — admin account required');
    if (user.status !== 'active') throw AppError.forbidden('Account is not active');

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw AppError.tooManyRequests(`Account locked. Try again in ${mins} minutes.`);
    }

    if (!user.password) throw AppError.unauthorized('Invalid email or password');

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      await authRepository.incrementFailedLogins(email);
      throw AppError.unauthorized('Invalid email or password');
    }

    await authRepository.resetFailedLogins(email);
    await authRepository.updateLastLogin(user._id!.toString());

    const payload: JwtPayload = {
      userId: user._id!.toString(),
      role: user.role,
      email: user.email,
    };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    await authRepository.createSession({
      userId: user._id!.toString(),
      refreshTokenHash: hashToken(refreshToken),
      deviceInfo: {},
      ipAddress: 'admin',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    return {
      user: {
        userId: user._id!.toString(),
        email: user.email,
        role: user.role,
        name: user.name ?? user.firstName ?? 'Admin',
      },
      accessToken,
    };
  }


  // ── Stats ─────────────────────────────────────────────────

  async getDashboardStats() {
    return adminRepository.getStats();
  }

  async getSidebarCounts() {
    return adminRepository.getSidebarCounts();
  }

  // ── Schools ───────────────────────────────────────────────

  async listSchools(status?: string, page = 1, limit = 20) {
    return adminRepository.listSchools({ status, page, limit });
  }

  async getSchool(profileId: string) {
    const school = await adminRepository.getSchoolById(profileId);
    if (!school) throw AppError.notFound('School profile not found');
    return school;
  }

  async approveSchool(profileId: string, adminNotes?: string) {
    const school = await adminRepository.getSchoolById(profileId);
    if (!school) throw AppError.notFound('School profile not found');
    if (school.profileStatus === 'verified') throw AppError.badRequest('School is already verified');
    const updated = await adminRepository.approveSchool(profileId, adminNotes);

    void (async () => {
      const user = await User.findById(school.userId).select('email emailNotificationsEnabled').lean();
      if (!user?.emailNotificationsEnabled || !user.email) return;
      const schoolName = school.nameEn ?? school.nameAr ?? 'Your school';
      const { subject, html } = tplSchoolVerified({ schoolName });
      await sendEmail(user.email, subject, html);
    })();

    return updated;
  }

  async rejectSchool(profileId: string, rejectionReason: string, adminNotes?: string) {
    if (!rejectionReason?.trim()) throw AppError.badRequest('Rejection reason is required');
    const school = await adminRepository.getSchoolById(profileId);
    if (!school) throw AppError.notFound('School profile not found');
    const updated = await adminRepository.rejectSchool(profileId, rejectionReason, adminNotes);

    void (async () => {
      const user = await User.findById(school.userId).select('email emailNotificationsEnabled').lean();
      if (!user?.emailNotificationsEnabled || !user.email) return;
      const schoolName = school.nameEn ?? school.nameAr ?? 'Your school';
      const { subject, html } = tplSchoolRejected({ schoolName, reason: rejectionReason });
      await sendEmail(user.email, subject, html);
    })();

    return updated;
  }

  // ── Teachers ──────────────────────────────────────────────

  async listTeachers(status?: string, page = 1, limit = 20) {
    return adminRepository.listTeachers({ status, page, limit });
  }

  async getTeacher(profileId: string) {
    const teacher = await adminRepository.getTeacherByIdWithUser(profileId);
    if (!teacher) throw AppError.notFound('Teacher profile not found');
    return teacher;
  }

  async approveTeacher(profileId: string, adminNotes?: string) {
    const teacher = await adminRepository.getTeacherById(profileId);
    if (!teacher) throw AppError.notFound('Teacher profile not found');
    if (teacher.profileStatus === 'approved') throw AppError.badRequest('Teacher is already approved');
    const updated = await adminRepository.approveTeacher(profileId, adminNotes);

    // SSD §1.3 — when an approval pushes us across the 30-verified threshold,
    // auto-flip the teacher_premium_enabled feature flag. Idempotent.
    void (async () => {
      try {
        const { checkAndFlipPremiumGate } = await import('../ranking/ranking.service');
        await checkAndFlipPremiumGate();
      } catch {
        // best-effort; don't fail approval if the gate check throws
      }
    })();

    void (async () => {
      const user = await User.findById(teacher.userId).select('email emailNotificationsEnabled').lean();
      if (!user?.emailNotificationsEnabled || !user.email) return;
      const teacherName = teacher.personal?.fullNameEn ?? teacher.personal?.fullNameAr ?? 'Teacher';
      const { subject, html } = tplProfileApproved({ teacherName });
      await sendEmail(user.email, subject, html);
    })();

    return updated;
  }

  async rejectTeacher(profileId: string, rejectionReason: string, adminNotes?: string) {
    if (!rejectionReason?.trim()) throw AppError.badRequest('Rejection reason is required');
    const teacher = await adminRepository.getTeacherById(profileId);
    if (!teacher) throw AppError.notFound('Teacher profile not found');
    const updated = await adminRepository.rejectTeacher(profileId, rejectionReason, adminNotes);

    void (async () => {
      const user = await User.findById(teacher.userId).select('email emailNotificationsEnabled').lean();
      if (!user?.emailNotificationsEnabled || !user.email) return;
      const teacherName = teacher.personal?.fullNameEn ?? teacher.personal?.fullNameAr ?? 'Teacher';
      const { subject, html } = tplProfileRejected({ teacherName, reason: rejectionReason });
      await sendEmail(user.email, subject, html);
    })();

    return updated;
  }

  // ── Interviews ──────────────────────────────────────────

  async listAllInterviews(status?: string, period?: 'upcoming' | 'past' | 'all', page = 1, limit = 50) {
    return adminRepository.listAllInterviews({ status, period, page, limit });
  }

  // ── Applications ────────────────────────────────────────

  async listAllApplications(status?: string, page = 1, limit = 30) {
    return adminRepository.listAllApplications({ status, page, limit });
  }

  // ── Activity ─────────────────────────────────────────────

  async getTeacherActivity(profileId: string) {
    const profile = await adminRepository.getTeacherById(profileId);
    if (!profile) throw AppError.notFound('Teacher profile not found');
    return adminRepository.getTeacherActivity(profile.userId.toString());
  }

  async getSchoolActivity(profileId: string) {
    const school = await adminRepository.getSchoolById(profileId);
    if (!school) throw AppError.notFound('School profile not found');
    return adminRepository.getSchoolActivity(school.userId.toString());
  }

  // SRD 2.2.10 — version history for teacher profile edits
  async getTeacherHistory(profileId: string, page = 1, limit = 20) {
    const profile = await adminRepository.getTeacherById(profileId);
    if (!profile) throw AppError.notFound('Teacher profile not found');

    const skip = (Math.max(1, page) - 1) * limit;
    const [items, total] = await Promise.all([
      ProfileChangeLog.find({ teacherProfileId: profile._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ProfileChangeLog.countDocuments({ teacherProfileId: profile._id }),
    ]);

    return {
      items,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // ── Deletion ─────────────────────────────────────────────

  async deleteTeacher(profileId: string) {
    const profile = await TeacherProfile.findById(profileId);
    if (!profile) throw AppError.notFound('Teacher profile not found');
    await Promise.all([
      TeacherProfile.findByIdAndDelete(profileId),
      profile.userId ? User.findByIdAndDelete(profile.userId) : Promise.resolve(),
    ]);
  }

  async deleteSchool(profileId: string) {
    const profile = await SchoolProfile.findById(profileId);
    if (!profile) throw AppError.notFound('School profile not found');
    await Promise.all([
      SchoolProfile.findByIdAndDelete(profileId),
      profile.userId ? User.findByIdAndDelete(profile.userId) : Promise.resolve(),
    ]);
  }

  // ── Support Tickets ──────────────────────────────────────

  async listAllTickets(status?: string, priority?: string, page = 1, limit = 20) {
    return adminRepository.listAllTickets({ status, priority, page, limit });
  }

  async getTicket(ticketId: string) {
    const ticket = await adminRepository.getTicketById(ticketId);
    if (!ticket) throw AppError.notFound('Ticket not found');
    return ticket;
  }

  async replyToTicket(ticketId: string, adminId: string, content: string) {
    if (!content?.trim()) throw AppError.badRequest('Reply content is required');
    const ticket = await adminRepository.adminReplyToTicket(ticketId, adminId, content);
    if (!ticket) throw AppError.notFound('Ticket not found');
    return ticket;
  }

  async updateTicketStatus(ticketId: string, status: string) {
    const validStatuses = ['open', 'in_progress', 'resolved', 'closed'] as const;
    if (!validStatuses.includes(status as typeof validStatuses[number])) {
      throw AppError.badRequest('Invalid status');
    }
    const ticket = await adminRepository.updateTicketStatus(ticketId, status as typeof validStatuses[number]);
    if (!ticket) throw AppError.notFound('Ticket not found');
    return ticket;
  }

  // ── Jobs (Content Moderation) ────────────────────────────

  async listAllJobs(status?: string, page = 1, limit = 20) {
    return adminRepository.listAllJobs({ status, page, limit });
  }

  async updateJobStatus(jobId: string, status: string) {
    const validStatuses = ['active', 'closed', 'expired'] as const;
    if (!validStatuses.includes(status as typeof validStatuses[number])) {
      throw AppError.badRequest('Invalid status');
    }
    const job = await adminRepository.updateJobStatus(jobId, status);
    if (!job) throw AppError.notFound('Job not found');
    return job;
  }

  // ── Enhanced Stats ───────────────────────────────────────

  async getEnhancedStats() {
    return adminRepository.getEnhancedStats();
  }

  // ── Report Generation ────────────────────────────────────

  async generateReport(type: string, dateRange: string) {
    return adminRepository.generateReport(type, dateRange);
  }
}

export const adminService = new AdminService();
