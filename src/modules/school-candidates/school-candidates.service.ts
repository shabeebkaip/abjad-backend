import mongoose from 'mongoose';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { schoolCandidatesRepository, CandidateSearchFilters } from './school-candidates.repository';
import { ITeacherProfileDocument } from '../../models/teacher-profile.model';
import { ICandidateNoteDocument } from '../../models/candidate-note.model';
import { AppError } from '../../utils/app-error.util';
import { Application } from '../../models/application.model';
import { Interview } from '../../models/interview.model';
import { Offer } from '../../models/offer.model';
import Shortlist from '../../models/shortlist.model';
import CandidateNote from '../../models/candidate-note.model';
import User from '../../models/user.model';
import { Subscription, ISubscription } from '../../models/subscription.model';
import {
  computeWDRS, getWDRSConfig, applyPremiumPoolOrdering, isTeacherPremiumGateOpen,
  ActivitySignals, WDRSBreakdown, TeacherForRanking,
} from '../ranking/ranking.service';

// A teacher-profile row decorated with WDRS data for candidate-search responses.
export type RankedTeacher = ITeacherProfileDocument & {
  wdrs?: WDRSBreakdown;
  isPremium?: boolean;
};

export class SchoolCandidatesService {
  async searchCandidates(
    filters: CandidateSearchFilters
  ): Promise<{ teachers: RankedTeacher[]; total: number; page: number; totalPages: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

    // SSD §3.3.4 — default to "Best Match" (WDRS) ordering.
    const sortBy = filters.sortBy ?? 'best_match';

    if (sortBy !== 'best_match') {
      const { teachers, total } = await schoolCandidatesRepository.search({ ...filters, sortBy });
      return {
        teachers: teachers as RankedTeacher[],
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    }

    // WDRS path — fetch the filtered set (capped), decorate, sort, paginate.
    const allMatches = await schoolCandidatesRepository.findAllForRanking(filters);
    const ranked = await this._rankCandidates(allMatches);
    const total = ranked.length;
    const start = (page - 1) * limit;
    const sliced = ranked.slice(start, start + limit);

    return {
      teachers: sliced,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Decorates a list of teacher profiles with WDRS scores + isPremium and
   * returns them ordered per SSD §1.2 (premium pool above standard,
   * 5-pt score bands within each pool, daily rotation within band).
   */
  private async _rankCandidates(profiles: ITeacherProfileDocument[]): Promise<RankedTeacher[]> {
    if (profiles.length === 0) return [];

    const [weights, premiumGate, batchedSignals] = await Promise.all([
      getWDRSConfig(),
      isTeacherPremiumGateOpen(),
      this._batchActivitySignals(profiles),
    ]);

    const { subByUser, activityById } = batchedSignals;

    const decorated: RankedTeacher[] = profiles.map((p) => {
      const userId = p.userId.toString();
      const sub = subByUser.get(userId) ?? null;
      const activity = activityById.get(userId) ?? {
        invitationsReceived: 0,
        invitationsAccepted: 0,
      };
      // Narrow the document down to just the fields the ranker reads —
      // avoids ITeacherProfile._id (string) vs Document._id (ObjectId) conflicts.
      const wdrsInput: Partial<TeacherForRanking> = {
        professional: p.professional,
        education: p.education,
        certifications: p.certifications,
      };
      const wdrs = computeWDRS(wdrsInput, sub, activity, weights);
      // Premium pool participation is gated by the activation flag (SSD §1.3:
      // not active until 30 verified profiles exist).
      const isPremium = premiumGate && !!sub
        && (sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due');
      const r: RankedTeacher = p as RankedTeacher;
      r.wdrs = wdrs;
      r.isPremium = isPremium;
      return r;
    });

    // Apply premium-pool ordering with 5-pt bands + daily rotation.
    const rankInputs = decorated.map((d) => ({
      teacherId: d.userId.toString(),
      wdrs: d.wdrs!.total,
      isPremium: !!d.isPremium,
      __ref: d,
    }));
    const ordered = applyPremiumPoolOrdering(rankInputs);
    return ordered.map((r) => r.__ref);
  }

  /**
   * Batch loads the activity signals each WDRS calc needs:
   *   - active Subscription per teacher (for tier scoring + premium pool)
   *   - User.lastLoginAt (for recency scoring)
   *   - Interview accept-rate (TODO: deferred — populated as zeros for v1)
   */
  private async _batchActivitySignals(profiles: ITeacherProfileDocument[]): Promise<{
    subByUser: Map<string, ISubscription>;
    activityById: Map<string, ActivitySignals>;
  }> {
    const userIds = profiles.map((p) => p.userId);

    const [users, subs] = await Promise.all([
      User.find({ _id: { $in: userIds } }).select('_id lastLoginAt').lean(),
      Subscription.find({
        ownerId: { $in: userIds },
        ownerType: 'teacher',
        status: { $in: ['active', 'trialing', 'past_due'] },
      }).lean(),
    ]);

    const subByUser = new Map<string, ISubscription>();
    for (const s of subs) {
      subByUser.set(s.ownerId.toString(), s as unknown as ISubscription);
    }

    const activityById = new Map<string, ActivitySignals>();
    for (const u of users) {
      const id = (u._id as { toString(): string }).toString();
      activityById.set(id, {
        lastLoginAt: u.lastLoginAt,
        // TODO Phase C+: aggregate Interview model invite counts per teacher.
        invitationsReceived: 0,
        invitationsAccepted: 0,
      });
    }

    return { subByUser, activityById };
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

  // SRD 3.4.3 — Profile History: all interactions between THIS school and THIS teacher.
  // Scoped per-school to protect the candidate's privacy across other schools.
  async getCandidateHistory(schoolId: string, teacherId: string): Promise<{
    applications: Array<{ _id: string; status: string; matchScore?: number; coverLetter?: string; referenceNumber?: string; createdAt: Date; updatedAt?: Date; job: { _id: string; title: string; city?: string } | null }>;
    interviews:   Array<{ _id: string; type: string; status: string; scheduledAt: Date; duration?: number; meetingLink?: string; feedback?: unknown; job: { _id: string; title: string } | null }>;
    offers:       Array<{ _id: string; status: string; position?: string; salary?: unknown; sentAt?: Date; respondedAt?: Date; expiresAt?: Date; job: { _id: string; title: string } | null }>;
    notes:        Array<{ _id: string; content: string; tags?: string[]; applicationId?: string; createdAt: Date }>;
    shortlistMemberships: Array<{ shortlistId: string; shortlistName: string; color?: string; addedAt: Date }>;
  }> {
    const schoolObjId  = new mongoose.Types.ObjectId(schoolId);
    const teacherObjId = new mongoose.Types.ObjectId(teacherId);

    const [applications, interviews, offers, notes, shortlists] = await Promise.all([
      Application.find({ schoolId: schoolObjId, teacherId: teacherObjId })
        .populate('jobId', 'title city')
        .sort({ createdAt: -1 })
        .lean(),
      Interview.find({ schoolId: schoolObjId, teacherId: teacherObjId })
        .populate('jobId', 'title')
        .sort({ scheduledAt: -1 })
        .lean(),
      Offer.find({ schoolId: schoolObjId, teacherId: teacherObjId })
        .populate('jobId', 'title')
        .sort({ createdAt: -1 })
        .lean(),
      CandidateNote.find({ schoolId: schoolObjId, teacherId: teacherObjId })
        .sort({ createdAt: -1 })
        .lean(),
      Shortlist.find({ schoolId: schoolObjId, 'teachers.teacherId': teacherObjId })
        .lean(),
    ]);

    type LeanRef<T> = T & { _id: mongoose.Types.ObjectId };

    return {
      applications: (applications as unknown as Array<{
        _id: mongoose.Types.ObjectId; status: string; matchScore?: number;
        coverLetter?: string; referenceNumber?: string; createdAt: Date; updatedAt?: Date;
        jobId?: LeanRef<{ title: string; city?: string }>;
      }>).map((a) => ({
        _id: a._id.toString(),
        status: a.status,
        matchScore: a.matchScore,
        coverLetter: a.coverLetter,
        referenceNumber: a.referenceNumber,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        job: a.jobId ? { _id: a.jobId._id.toString(), title: a.jobId.title, city: a.jobId.city } : null,
      })),
      interviews: (interviews as unknown as Array<{
        _id: mongoose.Types.ObjectId; type: string; status: string; scheduledAt: Date;
        duration?: number; meetingLink?: string; feedback?: unknown;
        jobId?: LeanRef<{ title: string }>;
      }>).map((i) => ({
        _id: i._id.toString(),
        type: i.type,
        status: i.status,
        scheduledAt: i.scheduledAt,
        duration: i.duration,
        meetingLink: i.meetingLink,
        feedback: i.feedback,
        job: i.jobId ? { _id: i.jobId._id.toString(), title: i.jobId.title } : null,
      })),
      offers: (offers as unknown as Array<{
        _id: mongoose.Types.ObjectId; status: string; position?: string;
        salary?: unknown; sentAt?: Date; respondedAt?: Date; expiresAt?: Date;
        jobId?: LeanRef<{ title: string }>;
      }>).map((o) => ({
        _id: o._id.toString(),
        status: o.status,
        position: o.position,
        salary: o.salary,
        sentAt: o.sentAt,
        respondedAt: o.respondedAt,
        expiresAt: o.expiresAt,
        job: o.jobId ? { _id: o.jobId._id.toString(), title: o.jobId.title } : null,
      })),
      notes: (notes as unknown as Array<{
        _id: mongoose.Types.ObjectId; content: string; tags?: string[];
        applicationId?: mongoose.Types.ObjectId; createdAt: Date;
      }>).map((n) => ({
        _id: n._id.toString(),
        content: n.content,
        tags: n.tags,
        applicationId: n.applicationId?.toString(),
        createdAt: n.createdAt,
      })),
      shortlistMemberships: shortlists.flatMap((sl) => {
        const entry = sl.teachers.find((t) => t.teacherId.toString() === teacherId);
        if (!entry) return [];
        return [{
          shortlistId: (sl as { _id: mongoose.Types.ObjectId })._id.toString(),
          shortlistName: sl.name,
          color: sl.color,
          addedAt: entry.addedAt,
        }];
      }),
    };
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
