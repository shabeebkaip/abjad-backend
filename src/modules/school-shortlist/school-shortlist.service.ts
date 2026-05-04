import { schoolShortlistRepository } from './school-shortlist.repository';
import { IShortlistDocument } from '../../models/shortlist.model';
import { AppError } from '../../utils/app-error.util';

export class SchoolShortlistService {
  async createShortlist(
    schoolId: string,
    data: { name: string; description?: string; color?: string; jobId?: string }
  ): Promise<IShortlistDocument> {
    return schoolShortlistRepository.create(schoolId, data);
  }

  async listShortlists(schoolId: string, includeArchived = false): Promise<IShortlistDocument[]> {
    return schoolShortlistRepository.findBySchool(schoolId, includeArchived);
  }

  async getShortlist(schoolId: string, shortlistId: string): Promise<IShortlistDocument> {
    const shortlist = await schoolShortlistRepository.findByIdAndSchool(shortlistId, schoolId);
    if (!shortlist) throw AppError.notFound('Shortlist not found');
    return shortlist;
  }

  async updateShortlist(
    schoolId: string,
    shortlistId: string,
    data: { name?: string; description?: string; color?: string; isArchived?: boolean }
  ): Promise<IShortlistDocument> {
    const updated = await schoolShortlistRepository.update(shortlistId, schoolId, data);
    if (!updated) throw AppError.notFound('Shortlist not found');
    return updated;
  }

  async deleteShortlist(schoolId: string, shortlistId: string): Promise<void> {
    const deleted = await schoolShortlistRepository.delete(shortlistId, schoolId);
    if (!deleted) throw AppError.notFound('Shortlist not found');
  }

  async addTeacher(
    schoolId: string,
    shortlistId: string,
    teacherId: string,
    addedBy: string,
    notes?: string,
    tags?: string[]
  ): Promise<IShortlistDocument> {
    const updated = await schoolShortlistRepository.addTeacher(
      shortlistId, schoolId, teacherId, addedBy, notes, tags
    );
    if (!updated) throw AppError.notFound('Shortlist not found');
    return updated;
  }

  async removeTeacher(
    schoolId: string,
    shortlistId: string,
    teacherId: string
  ): Promise<IShortlistDocument> {
    const updated = await schoolShortlistRepository.removeTeacher(shortlistId, schoolId, teacherId);
    if (!updated) throw AppError.notFound('Shortlist not found');
    return updated;
  }
}

export const schoolShortlistService = new SchoolShortlistService();
