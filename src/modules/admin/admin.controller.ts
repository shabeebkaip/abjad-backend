import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { adminService } from './admin.service';

class AdminController {
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
}

export const adminController = new AdminController();
