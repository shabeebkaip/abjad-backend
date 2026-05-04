import mongoose from 'mongoose';
import SchoolTeamMember, { ISchoolTeamMemberDocument, SchoolTeamRole } from '../../models/school-team.model';

export class SchoolTeamRepository {
  async create(data: {
    schoolId: string;
    email: string;
    name: string;
    role: SchoolTeamRole;
    invitedBy: string;
  }): Promise<ISchoolTeamMemberDocument> {
    return SchoolTeamMember.create({
      schoolId: new mongoose.Types.ObjectId(data.schoolId),
      email: data.email,
      name: data.name,
      role: data.role,
      invitedBy: new mongoose.Types.ObjectId(data.invitedBy),
      status: 'active',
      joinedAt: new Date(),
    });
  }

  async findBySchool(schoolId: string): Promise<ISchoolTeamMemberDocument[]> {
    return SchoolTeamMember.find({
      schoolId: new mongoose.Types.ObjectId(schoolId),
      status: { $ne: 'suspended' },
    }).sort({ createdAt: -1 });
  }

  async findByIdAndSchool(
    memberId: string,
    schoolId: string
  ): Promise<ISchoolTeamMemberDocument | null> {
    return SchoolTeamMember.findOne({
      _id: new mongoose.Types.ObjectId(memberId),
      schoolId: new mongoose.Types.ObjectId(schoolId),
    });
  }

  async findByEmailAndSchool(
    email: string,
    schoolId: string
  ): Promise<ISchoolTeamMemberDocument | null> {
    return SchoolTeamMember.findOne({
      email: email.toLowerCase(),
      schoolId: new mongoose.Types.ObjectId(schoolId),
    });
  }

  async findByUserIdAndSchool(
    userId: string,
    schoolId: string
  ): Promise<ISchoolTeamMemberDocument | null> {
    return SchoolTeamMember.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      schoolId: new mongoose.Types.ObjectId(schoolId),
    });
  }

  async updateRole(
    memberId: string,
    schoolId: string,
    role: SchoolTeamRole
  ): Promise<ISchoolTeamMemberDocument | null> {
    return SchoolTeamMember.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(memberId), schoolId: new mongoose.Types.ObjectId(schoolId) },
      { $set: { role } },
      { new: true }
    );
  }

  async remove(memberId: string, schoolId: string): Promise<boolean> {
    const result = await SchoolTeamMember.deleteOne({
      _id: new mongoose.Types.ObjectId(memberId),
      schoolId: new mongoose.Types.ObjectId(schoolId),
    });
    return result.deletedCount > 0;
  }

  async countAdmins(schoolId: string): Promise<number> {
    return SchoolTeamMember.countDocuments({
      schoolId: new mongoose.Types.ObjectId(schoolId),
      role: 'admin',
      status: 'active',
    });
  }
}

export const schoolTeamRepository = new SchoolTeamRepository();
