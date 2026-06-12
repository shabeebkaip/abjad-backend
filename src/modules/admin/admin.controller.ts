import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { adminService } from './admin.service';

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
      const school = await adminService.approveSchool(req.params['profileId'] as string, req.body.adminNotes);
      res.json({ success: true, message: 'School verified successfully', data: school });
    } catch (err) { next(err); }
  }

  // POST /admin/schools/:profileId/reject
  async rejectSchool(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { rejectionReason, adminNotes } = req.body;
      const school = await adminService.rejectSchool(req.params['profileId'] as string, rejectionReason, adminNotes);
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
      const teacher = await adminService.approveTeacher(req.params['profileId'] as string, req.body.adminNotes);
      res.json({ success: true, message: 'Teacher approved successfully', data: teacher });
    } catch (err) { next(err); }
  }

  // POST /admin/teachers/:profileId/reject
  async rejectTeacher(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { rejectionReason, adminNotes } = req.body;
      const teacher = await adminService.rejectTeacher(req.params['profileId'] as string, rejectionReason, adminNotes);
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
      const { status, priority, page, limit } = req.query;
      const result = await adminService.listAllTickets(
        status as string,
        priority as string,
        page ? Number(page) : 1,
        limit ? Number(limit) : 20,
      );
      res.json({ success: true, data: result });
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
      await adminService.deleteTeacher(req.params['profileId'] as string);
      res.json({ success: true, message: 'Teacher deleted successfully' });
    } catch (err) { next(err); }
  }

  // DELETE /admin/schools/:profileId
  async deleteSchool(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await adminService.deleteSchool(req.params['profileId'] as string);
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
      const ticket = await adminService.replyToTicket(
        req.params['ticketId'] as string,
        req.user!.userId,
        req.body.content,
      );
      res.json({ success: true, data: ticket });
    } catch (err) { next(err); }
  }

  // PATCH /admin/tickets/:ticketId/status
  async updateTicketStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const ticket = await adminService.updateTicketStatus(
        req.params['ticketId'] as string,
        req.body.status,
      );
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
      const job = await adminService.updateJobStatus(
        req.params['jobId'] as string,
        req.body.status,
      );
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
