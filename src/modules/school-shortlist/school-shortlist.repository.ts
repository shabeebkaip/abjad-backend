import mongoose from 'mongoose';
import Shortlist, { IShortlistDocument } from '../../models/shortlist.model';

export class SchoolShortlistRepository {
  async create(
    schoolId: string,
    data: { name: string; description?: string; color?: string; jobId?: string }
  ): Promise<IShortlistDocument> {
    return Shortlist.create({
      schoolId: new mongoose.Types.ObjectId(schoolId),
      name: data.name,
      description: data.description,
      color: data.color,
      jobId: data.jobId ? new mongoose.Types.ObjectId(data.jobId) : undefined,
      teachers: [],
    });
  }

  async findBySchool(schoolId: string, includeArchived = false): Promise<IShortlistDocument[]> {
    const query: Record<string, unknown> = { schoolId: new mongoose.Types.ObjectId(schoolId) };
    if (!includeArchived) query.isArchived = false;
    return Shortlist.find(query).sort({ createdAt: -1 });
  }

  async findByIdAndSchool(shortlistId: string, schoolId: string): Promise<IShortlistDocument | null> {
    return Shortlist.findOne({
      _id: new mongoose.Types.ObjectId(shortlistId),
      schoolId: new mongoose.Types.ObjectId(schoolId),
    });
  }

  async update(
    shortlistId: string,
    schoolId: string,
    data: { name?: string; description?: string; color?: string; isArchived?: boolean }
  ): Promise<IShortlistDocument | null> {
    return Shortlist.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(shortlistId), schoolId: new mongoose.Types.ObjectId(schoolId) },
      { $set: data },
      { new: true }
    );
  }

  async delete(shortlistId: string, schoolId: string): Promise<boolean> {
    const result = await Shortlist.deleteOne({
      _id: new mongoose.Types.ObjectId(shortlistId),
      schoolId: new mongoose.Types.ObjectId(schoolId),
    });
    return result.deletedCount > 0;
  }

  async addTeacher(
    shortlistId: string,
    schoolId: string,
    teacherId: string,
    addedBy: string,
    notes?: string,
    tags?: string[]
  ): Promise<IShortlistDocument | null> {
    // Remove if already present, then push fresh entry
    await Shortlist.updateOne(
      { _id: new mongoose.Types.ObjectId(shortlistId), schoolId: new mongoose.Types.ObjectId(schoolId) },
      { $pull: { teachers: { teacherId: new mongoose.Types.ObjectId(teacherId) } } }
    );

    return Shortlist.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(shortlistId), schoolId: new mongoose.Types.ObjectId(schoolId) },
      {
        $push: {
          teachers: {
            teacherId: new mongoose.Types.ObjectId(teacherId),
            addedBy: new mongoose.Types.ObjectId(addedBy),
            addedAt: new Date(),
            notes,
            tags,
          },
        },
      },
      { new: true }
    );
  }

  async removeTeacher(
    shortlistId: string,
    schoolId: string,
    teacherId: string
  ): Promise<IShortlistDocument | null> {
    return Shortlist.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(shortlistId), schoolId: new mongoose.Types.ObjectId(schoolId) },
      { $pull: { teachers: { teacherId: new mongoose.Types.ObjectId(teacherId) } } },
      { new: true }
    );
  }
}

export const schoolShortlistRepository = new SchoolShortlistRepository();
