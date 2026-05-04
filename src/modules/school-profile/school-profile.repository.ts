import SchoolProfile, { ISchoolProfileDocument } from '../../models/school-profile.model';

export class SchoolProfileRepository {
  async findByUserId(userId: string): Promise<ISchoolProfileDocument | null> {
    return SchoolProfile.findOne({ userId });
  }

  async create(userId: string): Promise<ISchoolProfileDocument> {
    return SchoolProfile.create({ userId, documents: {} });
  }

  async updateSection(
    userId: string,
    section: string,
    data: Record<string, unknown>
  ): Promise<ISchoolProfileDocument | null> {
    const set: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      set[`${section}.${k}`] = v;
    }
    return SchoolProfile.findOneAndUpdate({ userId }, { $set: set }, { new: true });
  }

  async updateRoot(
    userId: string,
    data: Record<string, unknown>
  ): Promise<ISchoolProfileDocument | null> {
    return SchoolProfile.findOneAndUpdate({ userId }, { $set: data }, { new: true });
  }

  async updateCompletionPercentage(userId: string, pct: number): Promise<void> {
    await SchoolProfile.updateOne({ userId }, { $set: { completionPercentage: pct } });
  }

  async submitForVerification(userId: string): Promise<ISchoolProfileDocument | null> {
    return SchoolProfile.findOneAndUpdate(
      { userId },
      { $set: { profileStatus: 'pending', submittedAt: new Date() } },
      { new: true }
    );
  }
}

export const schoolProfileRepository = new SchoolProfileRepository();
