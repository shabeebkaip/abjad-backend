import TeacherProfile, { IDocumentReview as TeacherReview, ITeacherProfileDocument } from '../../models/teacher-profile.model';
import SchoolProfile, { ISchoolProfileDocument } from '../../models/school-profile.model';
import { AppError } from '../../utils/app-error.util';

// Tier 2 #9 — Per-document approval. The advisory state lives as an embedded
// array (`documentReviews`) on each profile model. This service abstracts
// over the heterogeneous document shapes on the two profile types and
// provides a uniform inventory + approve/reject surface.

export type DocAudience = 'teacher' | 'school';
export type DocReviewStatus = 'pending' | 'approved' | 'rejected';

export interface DocumentInventoryItem {
  // Stable key (e.g. "photo", "cv", "certification:abc123").
  key: string;
  // Human-readable label shown in the admin UI.
  label: string;
  // Where the file lives. Empty when the user hasn't uploaded yet.
  fileUrl?: string;
  originalName?: string;
  uploadedAt?: Date;
  // True for slots the user must populate; false for optional bonus uploads.
  required: boolean;
  // Current review state derived from documentReviews (defaults to pending
  // when no decision exists and a file is present, or 'missing' when not
  // uploaded).
  status: DocReviewStatus | 'missing';
  reason?: string;
  decidedAt?: Date;
  decidedBy?: string;
}

// ── Inventory builders ─────────────────────────────────────────────────────

interface RawSlot {
  key: string;
  label: string;
  required: boolean;
  fileUrl?: string;
  originalName?: string;
  uploadedAt?: Date;
}

function teacherSlots(p: ITeacherProfileDocument): RawSlot[] {
  const slots: RawSlot[] = [];

  slots.push({
    key: 'photo',
    label: 'Profile photo',
    required: false,
    fileUrl: p.personal?.photoUrl,
  });
  slots.push({
    key: 'degree_certificate',
    label: 'Degree certificate',
    required: true,
    fileUrl: p.education?.certificateUrl,
  });
  slots.push({
    key: 'cv',
    label: 'Resume / CV',
    required: true,
    fileUrl: p.resume?.fileUrl,
    originalName: p.resume?.originalName,
    uploadedAt: p.resume?.uploadedAt,
  });

  (p.certifications ?? []).forEach((c) => {
    if (!c._id) return;
    slots.push({
      key: `certification:${c._id}`,
      label: `Certification — ${c.name || 'Untitled'}`,
      required: false,
      fileUrl: c.fileUrl,
    });
  });

  return slots;
}

function schoolSlots(p: ISchoolProfileDocument): RawSlot[] {
  const slots: RawSlot[] = [];

  slots.push({
    key: 'logo',
    label: 'School logo',
    required: false,
    fileUrl: p.logoUrl,
  });
  slots.push({
    key: 'commercial_registration',
    label: 'Commercial registration',
    required: true,
    fileUrl: p.documents?.commercialRegistration?.url,
    uploadedAt: p.documents?.commercialRegistration?.uploadedAt,
  });
  slots.push({
    key: 'ministry_license',
    label: 'Ministry of Education license',
    required: true,
    fileUrl: p.documents?.ministryLicense?.url,
    uploadedAt: p.documents?.ministryLicense?.uploadedAt,
  });

  (p.documents?.otherDocuments ?? []).forEach((d, idx) => {
    slots.push({
      key: `other_document:${idx}`,
      label: `Other — ${d.name || `Document ${idx + 1}`}`,
      required: false,
      fileUrl: d.url,
      uploadedAt: d.uploadedAt,
    });
  });

  return slots;
}

class DocumentReviewService {
  async inventory(audience: DocAudience, profileId: string): Promise<DocumentInventoryItem[]> {
    if (audience === 'teacher') {
      const p = await TeacherProfile.findById(profileId);
      if (!p) throw AppError.notFound('Teacher profile not found');
      return this.merge(teacherSlots(p), p.documentReviews);
    }
    const p = await SchoolProfile.findById(profileId);
    if (!p) throw AppError.notFound('School profile not found');
    return this.merge(schoolSlots(p), p.documentReviews);
  }

  private merge(slots: RawSlot[], reviews: TeacherReview[]): DocumentInventoryItem[] {
    const reviewByKey = new Map(reviews.map((r) => [r.docKey, r]));
    return slots.map((s) => {
      const r = reviewByKey.get(s.key);
      const hasFile = !!s.fileUrl;
      return {
        key: s.key,
        label: s.label,
        required: s.required,
        fileUrl: s.fileUrl,
        originalName: s.originalName,
        uploadedAt: s.uploadedAt,
        status: !hasFile ? 'missing'
              : r?.status ?? 'pending',
        reason: r?.reason,
        decidedAt: r?.decidedAt,
        decidedBy: r?.decidedBy?.toString(),
      };
    });
  }

  async decide(
    audience: DocAudience,
    profileId: string,
    docKey: string,
    decision: { status: 'approved' | 'rejected'; reason?: string },
    adminId: string,
  ) {
    if (decision.status === 'rejected' && !decision.reason?.trim()) {
      throw AppError.badRequest('A reason is required when rejecting a document');
    }

    // Validate the docKey actually exists on the profile's inventory so we
    // don't accept reviews for ghost keys.
    const inv = await this.inventory(audience, profileId);
    const slot = inv.find((x) => x.key === docKey);
    if (!slot) throw AppError.badRequest('Unknown document key for this profile');
    if (slot.status === 'missing') throw AppError.badRequest('Cannot review a document that has not been uploaded');

    const entry = {
      docKey,
      status: decision.status,
      reason: decision.reason?.trim(),
      decidedAt: new Date(),
      decidedBy: adminId,
    };

    // Two-step write keeps the array clean — pull any existing entry for the
    // same docKey, then push the new decision. Mongoose unions over Model
    // types confuse TS, so we branch on audience instead of holding a
    // polymorphic Model reference.
    if (audience === 'teacher') {
      await TeacherProfile.updateOne({ _id: profileId }, { $pull: { documentReviews: { docKey } } });
      await TeacherProfile.updateOne({ _id: profileId }, { $push: { documentReviews: entry } });
    } else {
      await SchoolProfile.updateOne({ _id: profileId }, { $pull: { documentReviews: { docKey } } });
      await SchoolProfile.updateOne({ _id: profileId }, { $push: { documentReviews: entry } });
    }

    return this.inventory(audience, profileId);
  }

  async resetDecision(audience: DocAudience, profileId: string, docKey: string) {
    if (audience === 'teacher') {
      await TeacherProfile.updateOne({ _id: profileId }, { $pull: { documentReviews: { docKey } } });
    } else {
      await SchoolProfile.updateOne({ _id: profileId }, { $pull: { documentReviews: { docKey } } });
    }
    return this.inventory(audience, profileId);
  }
}

export const documentReviewService = new DocumentReviewService();
