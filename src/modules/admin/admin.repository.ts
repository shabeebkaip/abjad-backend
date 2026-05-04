import SchoolProfile from '../../models/school-profile.model';
import TeacherProfile from '../../models/teacher-profile.model';

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
}

export const adminRepository = new AdminRepository();
