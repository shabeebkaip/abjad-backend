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
  // SRD 3.3.2 — proficiency pairs with `language` via $elemMatch on the same array element.
  languageProficiency?: string;
  employmentStatus?: string;
  // SRD 3.3.2 — free-text match against certifications[].name (case-insensitive substring).
  certificationsKeyword?: string;
  // SRD 3.3.2 — school's budget ceiling (SAR/mo). Selects teachers whose minimum
  // expectation is at or below this number; teachers with no minimum set are also included
  // so they can still be discovered.
  salaryMaxAcceptable?: number;
  // 'best_match' — WDRS-driven ranking (default). 'newest' / 'completion' use
  // simple DB-level sorts and skip the WDRS pipeline.
  sortBy?: 'best_match' | 'newest' | 'completion';
  page?: number;
  limit?: number;
}

// SSD §1.2 — cap for WDRS in-memory ranking. Larger pools would push us toward
// a precomputed score column on TeacherProfile.
export const RANK_FETCH_CAP = 500;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds the Mongo filter for a candidate search — shared by `search()` and
 * the WDRS path `findAllForRanking()` so the same filters apply identically.
 */
export function buildCandidateQuery(filters: CandidateSearchFilters): Record<string, unknown> {
  const query: Record<string, unknown> = { profileStatus: 'approved' };
  if (filters.subjects?.length) query['professional.subjects'] = { $in: filters.subjects };
  if (filters.gradeLevels?.length) query['professional.gradeLevels'] = { $in: filters.gradeLevels };
  if (filters.experienceRange) query['professional.experienceRange'] = filters.experienceRange;
  if (filters.city) {
    query['locationPreferences.preferredCities'] = Array.isArray(filters.city)
      ? { $in: filters.city }
      : filters.city;
  }
  if (filters.gender) query['personal.gender'] = filters.gender;
  if (filters.nationality) query['personal.nationality'] = filters.nationality;
  if (filters.degreeType) query['education.degreeType'] = filters.degreeType;
  if (filters.language) {
    const elem: Record<string, string> = { language: filters.language };
    if (filters.languageProficiency) elem.proficiency = filters.languageProficiency;
    query['languages'] = { $elemMatch: elem };
  } else if (filters.languageProficiency) {
    query['languages'] = { $elemMatch: { proficiency: filters.languageProficiency } };
  }
  if (filters.employmentStatus) query['professional.employmentStatus'] = filters.employmentStatus;
  if (filters.certificationsKeyword) {
    const re = new RegExp(escapeRegex(filters.certificationsKeyword.trim()), 'i');
    query['certifications.name'] = re;
  }
  if (filters.salaryMaxAcceptable != null && !isNaN(filters.salaryMaxAcceptable)) {
    query['$or'] = [
      { 'salaryExpectations.minMonthlySAR': { $exists: false } },
      { 'salaryExpectations.minMonthlySAR': null },
      { 'salaryExpectations.minMonthlySAR': { $lte: filters.salaryMaxAcceptable } },
    ];
  }
  return query;
}

export class SchoolCandidatesRepository {
  async findAllForRanking(filters: CandidateSearchFilters): Promise<ITeacherProfileDocument[]> {
    const query = buildCandidateQuery(filters);
    // Hard cap — beyond this we'd need a precomputed score column on TeacherProfile.
    const docs = await TeacherProfile.find(query).limit(RANK_FETCH_CAP).lean();
    return docs as ITeacherProfileDocument[];
  }

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
      // SRD 3.3.2 — pair language + proficiency on the same array element.
      const elem: Record<string, string> = { language: filters.language };
      if (filters.languageProficiency) elem.proficiency = filters.languageProficiency;
      query['languages'] = { $elemMatch: elem };
    } else if (filters.languageProficiency) {
      // Proficiency without language → match any language entry with that proficiency.
      query['languages'] = { $elemMatch: { proficiency: filters.languageProficiency } };
    }
    if (filters.employmentStatus) {
      query['professional.employmentStatus'] = filters.employmentStatus;
    }
    if (filters.certificationsKeyword) {
      const re = new RegExp(escapeRegex(filters.certificationsKeyword.trim()), 'i');
      query['certifications.name'] = re;
    }
    if (filters.salaryMaxAcceptable != null && !isNaN(filters.salaryMaxAcceptable)) {
      // Include teachers without a stated minimum (so they remain discoverable),
      // plus those whose minimum is at or below the school's ceiling.
      query['$or'] = [
        { 'salaryExpectations.minMonthlySAR': { $exists: false } },
        { 'salaryExpectations.minMonthlySAR': null },
        { 'salaryExpectations.minMonthlySAR': { $lte: filters.salaryMaxAcceptable } },
      ];
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
