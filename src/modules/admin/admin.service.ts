import { adminRepository } from './admin.repository';
import { AppError } from '../../utils/app-error.util';

export class AdminService {
  // ── Stats ─────────────────────────────────────────────────

  async getDashboardStats() {
    return adminRepository.getStats();
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
    return adminRepository.approveSchool(profileId, adminNotes);
  }

  async rejectSchool(profileId: string, rejectionReason: string, adminNotes?: string) {
    if (!rejectionReason?.trim()) throw AppError.badRequest('Rejection reason is required');
    const school = await adminRepository.getSchoolById(profileId);
    if (!school) throw AppError.notFound('School profile not found');
    return adminRepository.rejectSchool(profileId, rejectionReason, adminNotes);
  }

  // ── Teachers ──────────────────────────────────────────────

  async listTeachers(status?: string, page = 1, limit = 20) {
    return adminRepository.listTeachers({ status, page, limit });
  }

  async getTeacher(profileId: string) {
    const teacher = await adminRepository.getTeacherById(profileId);
    if (!teacher) throw AppError.notFound('Teacher profile not found');
    return teacher;
  }

  async approveTeacher(profileId: string, adminNotes?: string) {
    const teacher = await adminRepository.getTeacherById(profileId);
    if (!teacher) throw AppError.notFound('Teacher profile not found');
    if (teacher.profileStatus === 'approved') throw AppError.badRequest('Teacher is already approved');
    return adminRepository.approveTeacher(profileId, adminNotes);
  }

  async rejectTeacher(profileId: string, rejectionReason: string, adminNotes?: string) {
    if (!rejectionReason?.trim()) throw AppError.badRequest('Rejection reason is required');
    const teacher = await adminRepository.getTeacherById(profileId);
    if (!teacher) throw AppError.notFound('Teacher profile not found');
    return adminRepository.rejectTeacher(profileId, rejectionReason, adminNotes);
  }
}

export const adminService = new AdminService();
