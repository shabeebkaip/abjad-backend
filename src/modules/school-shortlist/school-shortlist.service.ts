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

  // SRD 3.3.5 — bulk add teachers to a shortlist in one call.
  // Returns { shortlist, added, skipped } so the client can confirm.
  async addTeachersBulk(
    schoolId: string,
    shortlistId: string,
    teacherIds: string[],
    addedBy: string,
  ): Promise<{ shortlist: IShortlistDocument; added: number; skipped: number }> {
    if (!Array.isArray(teacherIds) || teacherIds.length === 0) {
      throw AppError.badRequest('teacherIds must be a non-empty array');
    }
    let shortlist: IShortlistDocument | null = null;
    let added = 0;
    let skipped = 0;
    for (const teacherId of teacherIds) {
      const before = shortlist;
      shortlist = await schoolShortlistRepository.addTeacher(
        shortlistId, schoolId, teacherId, addedBy,
      );
      if (!shortlist) throw AppError.notFound('Shortlist not found');
      // repo silently no-ops on duplicate teacher — detect via teacher count delta
      const beforeCount = before?.teachers.length ?? -1;
      if (shortlist.teachers.length > beforeCount) added++;
      else if (before) skipped++;
      else added++;
    }
    return { shortlist: shortlist as IShortlistDocument, added, skipped };
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
