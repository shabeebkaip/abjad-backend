import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
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

  // SRD 3.3.5 — export a set of candidate profiles as a multi-page PDF report.
  async exportToPdf(teacherIds: string[]): Promise<Buffer> {
    if (!Array.isArray(teacherIds) || teacherIds.length === 0) {
      throw AppError.badRequest('teacherIds must be a non-empty array');
    }
    if (teacherIds.length > 100) {
      throw AppError.badRequest('Cannot export more than 100 candidates at once');
    }

    const profiles = await Promise.all(
      teacherIds.map((id) => schoolCandidatesRepository.findById(id)),
    );
    const valid = profiles.filter((p): p is ITeacherProfileDocument => !!p);
    if (valid.length === 0) throw AppError.notFound('No candidates found');

    const pdf = await PDFDocument.create();
    const font     = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const PAGE_W = 595; // A4
    const PAGE_H = 842;
    const MARGIN = 50;
    const LABEL = rgb(0.45, 0.45, 0.5);
    const TEXT  = rgb(0.12, 0.14, 0.2);
    const ACCENT = rgb(0.32, 0.27, 0.85);

    valid.forEach((profile, idx) => {
      const page = pdf.addPage([PAGE_W, PAGE_H]);
      let y = PAGE_H - MARGIN;

      page.drawText('Candidate Report', { x: MARGIN, y, size: 10, font, color: LABEL });
      page.drawText(`${idx + 1} of ${valid.length}`, { x: PAGE_W - MARGIN - 60, y, size: 9, font, color: LABEL });
      y -= 18;

      const name = profile.personal?.fullNameEn || profile.personal?.fullNameAr || 'Unnamed Candidate';
      page.drawText(name, { x: MARGIN, y, size: 18, font: fontBold, color: TEXT });
      y -= 26;

      const drawKV = (label: string, value: string | undefined | null) => {
        if (!value) return;
        page.drawText(label, { x: MARGIN, y, size: 8, font, color: LABEL });
        y -= 11;
        const lines = wrapText(String(value), 80);
        for (const line of lines) {
          page.drawText(line, { x: MARGIN, y, size: 10, font, color: TEXT });
          y -= 13;
        }
        y -= 4;
      };
      const drawSection = (title: string) => {
        y -= 4;
        page.drawText(title.toUpperCase(), { x: MARGIN, y, size: 9, font: fontBold, color: ACCENT });
        y -= 14;
      };

      drawSection('Personal');
      drawKV('Nationality', profile.personal?.nationality);
      drawKV('Gender',      profile.personal?.gender);

      drawSection('Professional');
      drawKV('Subjects',     profile.professional?.subjects?.join(', '));
      drawKV('Grade Levels', profile.professional?.gradeLevels?.join(', '));
      drawKV('Experience',   profile.professional?.experienceRange);
      drawKV('Employment',   profile.professional?.employmentStatus);

      drawSection('Education');
      drawKV('Degree',  profile.education?.degreeType);
      drawKV('Major',   profile.education?.major);

      if (profile.certifications && profile.certifications.length > 0) {
        drawSection('Certifications');
        for (const c of profile.certifications) {
          drawKV(c.issuer, c.name);
        }
      }

      if (profile.languages && profile.languages.length > 0) {
        drawSection('Languages');
        drawKV('Spoken', profile.languages.map((l) => `${l.language} (${l.proficiency})`).join(', '));
      }

      drawSection('Salary');
      const min = profile.salaryExpectations?.minMonthlySAR;
      const max = profile.salaryExpectations?.maxMonthlySAR;
      drawKV(
        'Expectations',
        min != null || max != null ? `SAR ${min ?? '—'} – ${max ?? '—'} / month` : 'Not specified',
      );

      if (profile.locationPreferences?.preferredCities && profile.locationPreferences.preferredCities.length > 0) {
        drawSection('Location');
        drawKV('Preferred Cities', profile.locationPreferences.preferredCities.join(', '));
      }

      const today = new Date().toISOString().slice(0, 10);
      page.drawText(`Generated by Abjad · ${today}`, { x: MARGIN, y: 30, size: 8, font, color: LABEL });
    });

    const bytes = await pdf.save();
    return Buffer.from(bytes);
  }
}

// Helvetica at 10pt fits ~80 chars across the body width.
function wrapText(s: string, maxChars: number): string[] {
  if (!s) return [];
  const words = String(s).split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > maxChars) {
      if (line) lines.push(line);
      line = w;
    } else {
      line = line ? `${line} ${w}` : w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export const schoolCandidatesService = new SchoolCandidatesService();
