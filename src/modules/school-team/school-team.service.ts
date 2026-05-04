import { schoolTeamRepository } from './school-team.repository';
import { ISchoolTeamMemberDocument, SchoolTeamRole } from '../../models/school-team.model';
import { AppError } from '../../utils/app-error.util';

export class SchoolTeamService {
  async addMember(
    schoolId: string,
    invitedBy: string,
    data: { email: string; name: string; role: SchoolTeamRole }
  ): Promise<ISchoolTeamMemberDocument> {
    const existing = await schoolTeamRepository.findByEmailAndSchool(data.email, schoolId);
    if (existing) throw AppError.conflict('This person is already a team member');

    return schoolTeamRepository.create({
      schoolId,
      email: data.email,
      name: data.name,
      role: data.role,
      invitedBy,
    });
  }

  async listMembers(schoolId: string): Promise<ISchoolTeamMemberDocument[]> {
    return schoolTeamRepository.findBySchool(schoolId);
  }

  async getMyRole(userId: string, schoolId: string): Promise<ISchoolTeamMemberDocument | null> {
    return schoolTeamRepository.findByUserIdAndSchool(userId, schoolId);
  }

  async updateRole(
    schoolId: string,
    memberId: string,
    role: SchoolTeamRole,
    requesterId: string
  ): Promise<ISchoolTeamMemberDocument> {
    // Prevent demoting self if last admin
    if (role !== 'admin') {
      const member = await schoolTeamRepository.findByIdAndSchool(memberId, schoolId);
      if (member?.userId?.toString() === requesterId && member?.role === 'admin') {
        const adminCount = await schoolTeamRepository.countAdmins(schoolId);
        if (adminCount <= 1) throw AppError.badRequest('Cannot demote the last admin');
      }
    }

    const updated = await schoolTeamRepository.updateRole(memberId, schoolId, role);
    if (!updated) throw AppError.notFound('Team member not found');
    return updated;
  }

  async removeMember(schoolId: string, memberId: string, requesterId: string): Promise<void> {
    const member = await schoolTeamRepository.findByIdAndSchool(memberId, schoolId);
    if (!member) throw AppError.notFound('Team member not found');

    // Prevent removing last admin
    if (member.role === 'admin') {
      const adminCount = await schoolTeamRepository.countAdmins(schoolId);
      if (adminCount <= 1) throw AppError.badRequest('Cannot remove the last admin');
    }

    // Prevent self-removal if they are the primary school account
    if (member.userId?.toString() === requesterId && !member.invitedBy) {
      throw AppError.badRequest('Cannot remove the primary school account');
    }

    await schoolTeamRepository.remove(memberId, schoolId);
  }
}

export const schoolTeamService = new SchoolTeamService();
