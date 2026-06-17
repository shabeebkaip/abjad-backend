import mongoose, { Document, Schema } from 'mongoose';

export interface IDocument {
  url: string;
  key: string;
  uploadedAt: Date;
}

// Tier 2 #9 — Per-document approval state (advisory). Mirrors the shape on
// TeacherProfile so a single review service can manage both audiences.
export type DocumentReviewStatus = 'pending' | 'approved' | 'rejected';

export interface IDocumentReview {
  docKey: string;
  status: DocumentReviewStatus;
  reason?: string;
  decidedAt: Date;
  decidedBy?: mongoose.Types.ObjectId;
}

export interface IAdminContact {
  name: string;
  jobTitle: string;
  phone: string;
  email: string;
}

export interface IHeadOfSchool {
  name?: string;
  jobTitle?: string;
  phone?: string;
  email?: string;
}

export type Curriculum = 'saudi' | 'british' | 'american' | 'ib' | 'cambridge';

export interface ISchoolProfile {
  userId: mongoose.Types.ObjectId;

  // Basic info
  nameAr: string;
  nameEn: string;
  type: 'government' | 'private' | 'international' | 'ahli';
  educationLevel: 'elementary' | 'middle' | 'high' | 'k12' | 'mixed';
  curriculum?: Curriculum;
  gender: 'male' | 'female' | 'mixed';

  // Location
  city: string;
  district?: string;
  address?: string;

  // Contact
  website?: string;
  phone?: string;
  email?: string;

  // Info
  foundedYear?: number;
  studentsCount?: '<100' | '100-500' | '500-1000' | '1000-5000' | '>5000';

  // Branding
  logoUrl?: string;
  logoKey?: string;

  // Admin contact person (operational contact for the platform)
  adminContact?: IAdminContact;

  // Head of school / principal (named separately from the operational admin)
  headOfSchool?: IHeadOfSchool;

  // Compensation defaults — used to prefill new job posts and surface a benchmark
  defaultSalaryRange?: { min?: number; max?: number };
  defaultDailyRate?: number;

  // Verification credentials (number values; the file uploads live under documents)
  crNumber?: string;        // Commercial Registration number
  licenseNumber?: string;   // Ministry of Education / educational license number

  // Verification documents
  documents: {
    commercialRegistration?: IDocument;
    ministryLicense?: IDocument;
    otherDocuments?: Array<{ name: string } & IDocument>;
  };

  // Status
  profileStatus: 'draft' | 'pending' | 'verified' | 'rejected' | 'suspended';
  rejectionReason?: string;
  adminNotes?: string;
  submittedAt?: Date;
  verifiedAt?: Date;

  completionPercentage: number;

  // Tier 2 #9 — Advisory per-document decisions
  documentReviews: IDocumentReview[];
}

export interface ISchoolProfileDocument extends ISchoolProfile, Document {}

const documentSchema = new Schema<IDocument>(
  {
    url: { type: String, required: true },
    key: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const schoolProfileSchema = new Schema<ISchoolProfileDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },

    nameAr: { type: String, trim: true },
    nameEn: { type: String, trim: true },
    type: { type: String, enum: ['government', 'private', 'international', 'ahli'] },
    educationLevel: { type: String, enum: ['elementary', 'middle', 'high', 'k12', 'mixed'] },
    curriculum: { type: String, enum: ['saudi', 'british', 'american', 'ib', 'cambridge'] },
    gender: { type: String, enum: ['male', 'female', 'mixed'] },

    city: { type: String, trim: true },
    district: { type: String, trim: true },
    address: { type: String, trim: true },

    website: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },

    foundedYear: { type: Number },
    studentsCount: { type: String, enum: ['<100', '100-500', '500-1000', '1000-5000', '>5000'] },

    logoUrl: { type: String },
    logoKey: { type: String },

    adminContact: {
      name: { type: String, trim: true },
      jobTitle: { type: String, trim: true },
      phone: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
      _id: false,
    },

    headOfSchool: {
      name: { type: String, trim: true },
      jobTitle: { type: String, trim: true },
      phone: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
      _id: false,
    },

    defaultSalaryRange: {
      min: { type: Number },
      max: { type: Number },
      _id: false,
    },
    defaultDailyRate: { type: Number },

    crNumber: { type: String, trim: true },
    licenseNumber: { type: String, trim: true },

    documents: {
      commercialRegistration: { type: documentSchema },
      ministryLicense: { type: documentSchema },
      otherDocuments: [
        {
          name: { type: String },
          url: { type: String },
          key: { type: String },
          uploadedAt: { type: Date, default: Date.now },
          _id: false,
        },
      ],
      _id: false,
    },

    profileStatus: {
      type: String,
      enum: ['draft', 'pending', 'verified', 'rejected', 'suspended'],
      default: 'draft',
    },
    rejectionReason: { type: String },
    adminNotes: { type: String },
    submittedAt: { type: Date },
    verifiedAt: { type: Date },

    completionPercentage: { type: Number, default: 0, min: 0, max: 100 },

    // Tier 2 #9 — per-document review decisions (advisory)
    documentReviews: {
      type: [{
        docKey:    { type: String, required: true },
        status:    { type: String, enum: ['pending', 'approved', 'rejected'], required: true },
        reason:    { type: String, trim: true },
        decidedAt: { type: Date, default: Date.now },
        decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        _id: false,
      }],
      default: [],
    },
  },
  { timestamps: true }
);

schoolProfileSchema.index({ profileStatus: 1 });
schoolProfileSchema.index({ city: 1 });

export default mongoose.model<ISchoolProfileDocument>('SchoolProfile', schoolProfileSchema);
