import mongoose from 'mongoose';
import TeacherProfile, { ITeacherProfileDocument } from '../../models/teacher-profile.model';

type ITeacherProfile = ITeacherProfileDocument;

export class TeacherProfileRepository {
  async findByUserId(userId: string): Promise<ITeacherProfile | null> {
    return TeacherProfile.findOne({ userId: new mongoose.Types.ObjectId(userId) });
  }

  async findById(id: string): Promise<ITeacherProfile | null> {
    return TeacherProfile.findById(id);
  }

  async create(userId: string): Promise<ITeacherProfile> {
    const profile = new TeacherProfile({
      uuid: new mongoose.Types.ObjectId().toString(),
      userId: new mongoose.Types.ObjectId(userId),
      profileStatus: 'draft',
      completionPercentage: 0,
    });
    return profile.save();
  }

  async updateSection(userId: string, section: string, data: Record<string, unknown>): Promise<ITeacherProfile | null> {
    const update: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      update[`${section}.${key}`] = value;
    }
    return TeacherProfile.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(userId) },
      { $set: update },
      { new: true, runValidators: true }
    );
  }

  async updateRoot(userId: string, data: Record<string, unknown>): Promise<ITeacherProfile | null> {
    return TeacherProfile.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(userId) },
      { $set: data },
      { new: true, runValidators: true }
    );
  }

  async addCertification(userId: string, cert: Record<string, unknown>): Promise<ITeacherProfile | null> {
    return TeacherProfile.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(userId) },
      { $push: { certifications: cert } },
      { new: true, runValidators: true }
    );
  }

  async removeCertification(userId: string, certId: string): Promise<ITeacherProfile | null> {
    return TeacherProfile.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(userId) },
      { $pull: { certifications: { _id: new mongoose.Types.ObjectId(certId) } } },
      { new: true }
    );
  }

  async submitForApproval(userId: string): Promise<ITeacherProfile | null> {
    return TeacherProfile.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(userId) },
      { $set: { profileStatus: 'pending', submittedAt: new Date() } },
      { new: true }
    );
  }

  async updateCompletionPercentage(userId: string, pct: number): Promise<void> {
    await TeacherProfile.updateOne(
      { userId: new mongoose.Types.ObjectId(userId) },
      { $set: { completionPercentage: pct } }
    );
  }
}

export const teacherProfileRepository = new TeacherProfileRepository();
