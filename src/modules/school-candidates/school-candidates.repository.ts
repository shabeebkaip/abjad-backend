import mongoose from 'mongoose';
import TeacherProfile, { ITeacherProfileDocument } from '../../models/teacher-profile.model';
import CandidateNote, { ICandidateNoteDocument } from '../../models/candidate-note.model';

export interface CandidateSearchFilters {
  subjects?: string[];
  gradeLevels?: string[];
  experienceRange?: string;
  city?: string | string[];
  gender?: string;
  nationality?: string;
  degreeType?: string;
  language?: string;
  employmentStatus?: string;
  sortBy?: 'newest' | 'completion';
  page?: number;
  limit?: number;
}

export class SchoolCandidatesRepository {
  async search(
    filters: CandidateSearchFilters
  ): Promise<{ teachers: ITeacherProfileDocument[]; total: number }> {
    const query: Record<string, unknown> = { profileStatus: 'approved' };

    if (filters.subjects?.length) {
      query['professional.subjects'] = { $in: filters.subjects };
    }
    if (filters.gradeLevels?.length) {
      query['professional.gradeLevels'] = { $in: filters.gradeLevels };
    }
    if (filters.experienceRange) {
      query['professional.experienceRange'] = filters.experienceRange;
    }
    if (filters.city) {
      query['locationPreferences.preferredCities'] = Array.isArray(filters.city)
        ? { $in: filters.city }
        : filters.city;
    }
    if (filters.gender) {
      query['personal.gender'] = filters.gender;
    }
    if (filters.nationality) {
      query['personal.nationality'] = filters.nationality;
    }
    if (filters.degreeType) {
      query['education.degreeType'] = filters.degreeType;
    }
    if (filters.language) {
      query['languages'] = { $elemMatch: { language: filters.language } };
    }
    if (filters.employmentStatus) {
      query['professional.employmentStatus'] = filters.employmentStatus;
    }

    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 50);
    const skip = (page - 1) * limit;

    const sortBy = filters.sortBy ?? 'newest';
    const sort: Record<string, 1 | -1> =
      sortBy === 'completion' ? { completionPercentage: -1 } : { createdAt: -1 };

    const [teachers, total] = await Promise.all([
      TeacherProfile.find(query).sort(sort).skip(skip).limit(limit).lean(),
      TeacherProfile.countDocuments(query),
    ]);

    return { teachers: teachers as ITeacherProfileDocument[], total };
  }

  async findById(teacherProfileId: string): Promise<ITeacherProfileDocument | null> {
    return TeacherProfile.findOne({
      userId: new mongoose.Types.ObjectId(teacherProfileId),
      profileStatus: 'approved',
    });
  }

  // Notes
  async createNote(
    schoolId: string,
    teacherId: string,
    data: { content: string; applicationId?: string; tags?: string[] },
    createdBy: string
  ): Promise<ICandidateNoteDocument> {
    return CandidateNote.create({
      schoolId: new mongoose.Types.ObjectId(schoolId),
      teacherId: new mongoose.Types.ObjectId(teacherId),
      applicationId: data.applicationId ? new mongoose.Types.ObjectId(data.applicationId) : undefined,
      content: data.content,
      tags: data.tags,
      createdBy: new mongoose.Types.ObjectId(createdBy),
    });
  }

  async getNotes(schoolId: string, teacherId: string): Promise<ICandidateNoteDocument[]> {
    return CandidateNote.find({
      schoolId: new mongoose.Types.ObjectId(schoolId),
      teacherId: new mongoose.Types.ObjectId(teacherId),
    }).sort({ createdAt: -1 });
  }

  async findNoteByIdAndSchool(
    noteId: string,
    schoolId: string
  ): Promise<ICandidateNoteDocument | null> {
    return CandidateNote.findOne({
      _id: new mongoose.Types.ObjectId(noteId),
      schoolId: new mongoose.Types.ObjectId(schoolId),
    });
  }

  async updateNote(
    noteId: string,
    schoolId: string,
    data: { content?: string; tags?: string[] }
  ): Promise<ICandidateNoteDocument | null> {
    return CandidateNote.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(noteId), schoolId: new mongoose.Types.ObjectId(schoolId) },
      { $set: data },
      { new: true }
    );
  }

  async deleteNote(noteId: string, schoolId: string): Promise<boolean> {
    const result = await CandidateNote.deleteOne({
      _id: new mongoose.Types.ObjectId(noteId),
      schoolId: new mongoose.Types.ObjectId(schoolId),
    });
    return result.deletedCount > 0;
  }
}

export const schoolCandidatesRepository = new SchoolCandidatesRepository();
