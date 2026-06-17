import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { adminService } from './admin.service';
import { auditService, actorFromRequest } from '../audit/audit.service';

class AdminController {
  // POST /admin/auth/login
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required' });
      }
      const result = await adminService.login(email, password);
      return res.json({ success: true, data: result });
    } catch (err) { return next(err); }
  }

  // GET /admin/stats
  async getStats(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const stats = await adminService.getDashboardStats();
      res.json({ success: true, data: stats });
    } catch (err) { next(err); }
  }

  // GET /admin/sidebar-counts
  async getSidebarCounts(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const counts = await adminService.getSidebarCounts();
      res.json({ success: true, data: counts });
    } catch (err) { next(err); }
  }

  // GET /admin/dashboard-charts
  async getDashboardCharts(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const charts = await adminService.getDashboardCharts();
      res.json({ success: true, data: charts });
    } catch (err) { next(err); }
  }

  // ── Schools ───────────────────────────────────────────────

  // GET /admin/schools?status=pending&page=1&limit=20
  async listSchools(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { status, page, limit } = req.query;
      const result = await adminService.listSchools(
        status as string | undefined,
        page ? Number(page) : 1,
        limit ? Number(limit) : 20,
      );
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  // GET /admin/schools/:profileId
  async getSchool(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const school = await adminService.getSchool(req.params['profileId'] as string);
      res.json({ success: true, data: school });
    } catch (err) { next(err); }
  }

  // POST /admin/schools/:profileId/approve
  async approveSchool(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const profileId = req.params['profileId'] as string;
      const school = await adminService.approveSchool(profileId, req.body.adminNotes);
      void auditService.record({
        actor: actorFromRequest(req),
        action: 'school.approve',
        targetType: 'SchoolProfile',
        targetId: profileId,
        targetLabel: school?.nameEn ?? school?.nameAr,
        notes: req.body.adminNotes,
        req,
      });
      res.json({ success: true, message: 'School verified successfully', data: school });
    } catch (err) { next(err); }
  }

  // POST /admin/schools/:profileId/reject
  async rejectSchool(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { rejectionReason, adminNotes } = req.body;
      const profileId = req.params['profileId'] as string;
      const school = await adminService.rejectSchool(profileId, rejectionReason, adminNotes);
      void auditService.record({
        actor: actorFromRequest(req),
        action: 'school.reject',
        targetType: 'SchoolProfile',
        targetId: profileId,
        targetLabel: school?.nameEn ?? school?.nameAr,
        reason: rejectionReason,
        notes: adminNotes,
        req,
      });
      res.json({ success: true, message: 'School rejected', data: school });
    } catch (err) { next(err); }
  }

  // ── Teachers ──────────────────────────────────────────────

  // GET /admin/teachers?status=pending&page=1&limit=20
  async listTeachers(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { status, page, limit } = req.query;
      const result = await adminService.listTeachers(
        status as string | undefined,
        page ? Number(page) : 1,
        limit ? Number(limit) : 20,
      );
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  // GET /admin/teachers/:profileId
  async getTeacher(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const teacher = await adminService.getTeacher(req.params['profileId'] as string);
      res.json({ success: true, data: teacher });
    } catch (err) { next(err); }
  }

  // POST /admin/teachers/:profileId/approve
  async approveTeacher(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const profileId = req.params['profileId'] as string;
      const teacher = await adminService.approveTeacher(profileId, req.body.adminNotes);
      void auditService.record({
        actor: actorFromRequest(req),
        action: 'teacher.approve',
        targetType: 'TeacherProfile',
        targetId: profileId,
        targetLabel: teacher?.personal?.fullNameEn ?? teacher?.personal?.fullNameAr,
        notes: req.body.adminNotes,
        req,
      });
      res.json({ success: true, message: 'Teacher approved successfully', data: teacher });
    } catch (err) { next(err); }
  }

  // POST /admin/teachers/:profileId/reject
  async rejectTeacher(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { rejectionReason, adminNotes } = req.body;
      const profileId = req.params['profileId'] as string;
      const teacher = await adminService.rejectTeacher(profileId, rejectionReason, adminNotes);
      void auditService.record({
        actor: actorFromRequest(req),
        action: 'teacher.reject',
        targetType: 'TeacherProfile',
        targetId: profileId,
        targetLabel: teacher?.personal?.fullNameEn ?? teacher?.personal?.fullNameAr,
        reason: rejectionReason,
        notes: adminNotes,
        req,
      });
      res.json({ success: true, message: 'Teacher rejected', data: teacher });
    } catch (err) { next(err); }
  }

  // GET /admin/teachers/:profileId/history — SRD 2.2.10 version history
  async getTeacherHistory(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit } = req.query;
      const result = await adminService.getTeacherHistory(
        req.params['profileId'] as string,
        page ? Number(page) : 1,
        limit ? Number(limit) : 20,
      );
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  // ── Interviews ────────────────────────────────────────────

  // GET /admin/interviews
  async listInterviews(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { status, period, page, limit } = req.query;
      const result = await adminService.listAllInterviews(
        status as string,
        (period as 'upcoming' | 'past' | 'all') ?? 'all',
        page ? Number(page) : 1,
        limit ? Number(limit) : 50,
      );
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  // ── Applications ──────────────────────────────────────────

  // GET /admin/applications
  async listApplications(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { status, page, limit } = req.query;
      const result = await adminService.listAllApplications(
        status as string,
        page ? Number(page) : 1,
        limit ? Number(limit) : 30,
      );
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  // ── Support Tickets ────────────────────────────────────────

  // GET /admin/tickets
  async listTickets(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { status, priority, assignee, page, limit } = req.query;
      // Tier 2 #10 — "assignee=me" resolves to the caller server-side so the
      // client doesn't have to round-trip its own userId.
      const resolvedAssignee = assignee === 'me' ? req.user!.userId : (assignee as string | undefined);
      const result = await adminService.listAllTickets(
        status as string,
        priority as string,
        resolvedAssignee,
        page ? Number(page) : 1,
        limit ? Number(limit) : 20,
      );
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  // POST /admin/tickets/:ticketId/assign
  async assignTicket(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const ticketId = req.params['ticketId'] as string;
      // Body: { adminId: string | null }. null/empty unassigns.
      const raw = req.body?.adminId;
      const adminId: string | null = raw && typeof raw === 'string' ? raw : null;
      const ticket = await adminService.assignTicket(ticketId, adminId);
      void auditService.record({
        actor: actorFromRequest(req),
        action: 'ticket.assign',
        targetType: 'Ticket',
        targetId: ticketId,
        after: { assignedTo: adminId },
        req,
      });
      res.json({ success: true, data: ticket });
    } catch (err) { next(err); }
  }

  // GET /admin/admins — list of admin users for the assignment picker
  async listAdmins(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const admins = await adminService.listAdmins();
      res.json({ success: true, data: admins });
    } catch (err) { next(err); }
  }

  // GET /admin/teachers/:profileId/activity
  async getTeacherActivity(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await adminService.getTeacherActivity(req.params['profileId'] as string);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  // GET /admin/schools/:profileId/activity
  async getSchoolActivity(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await adminService.getSchoolActivity(req.params['profileId'] as string);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  // DELETE /admin/teachers/:profileId
  async deleteTeacher(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const profileId = req.params['profileId'] as string;
      // Snapshot the teacher BEFORE delete so the audit entry has a label.
      const before = await adminService.getTeacher(profileId).catch(() => null);
      await adminService.deleteTeacher(profileId);
      void auditService.record({
        actor: actorFromRequest(req),
        action: 'teacher.delete',
        targetType: 'TeacherProfile',
        targetId: profileId,
        targetLabel: before?.personal?.fullNameEn ?? before?.personal?.fullNameAr,
        before,
        req,
      });
      res.json({ success: true, message: 'Teacher deleted successfully' });
    } catch (err) { next(err); }
  }

  // DELETE /admin/schools/:profileId
  async deleteSchool(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const profileId = req.params['profileId'] as string;
      const before = await adminService.getSchool(profileId).catch(() => null);
      await adminService.deleteSchool(profileId);
      void auditService.record({
        actor: actorFromRequest(req),
        action: 'school.delete',
        targetType: 'SchoolProfile',
        targetId: profileId,
        targetLabel: before?.nameEn ?? before?.nameAr,
        before,
        req,
      });
      res.json({ success: true, message: 'School deleted successfully' });
    } catch (err) { next(err); }
  }

  // GET /admin/tickets/:ticketId
  async getTicket(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const ticket = await adminService.getTicket(req.params['ticketId'] as string);
      res.json({ success: true, data: ticket });
    } catch (err) { next(err); }
  }

  // POST /admin/tickets/:ticketId/reply
  async replyToTicket(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const ticketId = req.params['ticketId'] as string;
      const ticket = await adminService.replyToTicket(
        ticketId,
        req.user!.userId,
        req.body.content,
      );
      void auditService.record({
        actor: actorFromRequest(req),
        action: 'ticket.reply',
        targetType: 'Ticket',
        targetId: ticketId,
        notes: req.body.content?.slice(0, 200),
        req,
      });
      res.json({ success: true, data: ticket });
    } catch (err) { next(err); }
  }

  // PATCH /admin/tickets/:ticketId/status
  async updateTicketStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const ticketId = req.params['ticketId'] as string;
      const ticket = await adminService.updateTicketStatus(ticketId, req.body.status);
      void auditService.record({
        actor: actorFromRequest(req),
        action: 'ticket.status_change',
        targetType: 'Ticket',
        targetId: ticketId,
        after: { status: req.body.status },
        req,
      });
      res.json({ success: true, data: ticket });
    } catch (err) { next(err); }
  }

  // ── Jobs (Content Moderation) ──────────────────────────────

  // GET /admin/jobs
  async listJobs(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { status, page, limit } = req.query;
      const result = await adminService.listAllJobs(
        status as string,
        page ? Number(page) : 1,
        limit ? Number(limit) : 20,
      );
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  // PATCH /admin/jobs/:jobId/status
  async updateJobStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const jobId = req.params['jobId'] as string;
      const job = await adminService.updateJobStatus(jobId, req.body.status);
      void auditService.record({
        actor: actorFromRequest(req),
        action: 'job.moderate',
        targetType: 'Job',
        targetId: jobId,
        targetLabel: job?.title,
        after: { status: req.body.status },
        req,
      });
      res.json({ success: true, data: job });
    } catch (err) { next(err); }
  }

  // ── Reports ────────────────────────────────────────────────

  // GET /admin/reports
  async getReports(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await adminService.getEnhancedStats();
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  // GET /admin/reports/generate?type=&dateRange=
  async generateReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { type = 'applications', dateRange = 'this_month' } = req.query;
      const result = await adminService.generateReport(type as string, dateRange as string);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }
}

export const adminController = new AdminController();
