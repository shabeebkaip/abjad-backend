import { schoolCandidatesRepository, CandidateSearchFilters } from './school-candidates.repository';
import { ITeacherProfileDocument } from '../../models/teacher-profile.model';
import { ICandidateNoteDocument } from '../../models/candidate-note.model';
import { AppError } from '../../utils/app-error.util';

export class SchoolCandidatesService {
  async searchCandidates(
    filters: CandidateSearchFilters
  ): Promise<{ teachers: ITeacherProfileDocument[]; total: number; page: number; totalPages: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const { teachers, total } = await schoolCandidatesRepository.search(filters);
    return { teachers, total, page, totalPages: Math.ceil(total / limit) };
  }

  async getCandidateProfile(teacherId: string): Promise<ITeacherProfileDocument> {
    const profile = await schoolCandidatesRepository.findById(teacherId);
    if (!profile) throw AppError.notFound('Candidate not found');
    return profile;
  }

  async addNote(
    schoolId: string,
    teacherId: string,
    data: { content: string; applicationId?: string; tags?: string[] },
    createdBy: string
  ): Promise<ICandidateNoteDocument> {
    // Verify teacher exists
    const teacher = await schoolCandidatesRepository.findById(teacherId);
    if (!teacher) throw AppError.notFound('Candidate not found');
    return schoolCandidatesRepository.createNote(schoolId, teacherId, data, createdBy);
  }

  async getNotes(schoolId: string, teacherId: string): Promise<ICandidateNoteDocument[]> {
    return schoolCandidatesRepository.getNotes(schoolId, teacherId);
  }

  async updateNote(
    schoolId: string,
    noteId: string,
    data: { content?: string; tags?: string[] }
  ): Promise<ICandidateNoteDocument> {
    const updated = await schoolCandidatesRepository.updateNote(noteId, schoolId, data);
    if (!updated) throw AppError.notFound('Note not found');
    return updated;
  }

  async deleteNote(schoolId: string, noteId: string): Promise<void> {
    const deleted = await schoolCandidatesRepository.deleteNote(noteId, schoolId);
    if (!deleted) throw AppError.notFound('Note not found');
  }
}

export const schoolCandidatesService = new SchoolCandidatesService();
