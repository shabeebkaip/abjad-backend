import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// ─── Enums ────────────────────────────────────────────────────

export type Subject =
  | 'islamic_studies'
  | 'arabic'
  | 'english'
  | 'math'
  | 'science'
  | 'physics'
  | 'chemistry'
  | 'biology'
  | 'computer_science'
  | 'social_studies'
  | 'pe'
  | 'art'
  | 'other';

export type GradeLevel =
  | 'kg'
  | 'elementary_1' | 'elementary_2' | 'elementary_3'
  | 'elementary_4' | 'elementary_5' | 'elementary_6'
  | 'middle_7' | 'middle_8' | 'middle_9'
  | 'high_10' | 'high_11' | 'high_12';

export type ExperienceRange = '0-1' | '1-3' | '3-5' | '5-10' | '10+';

export type EmploymentStatus = 'employed' | 'unemployed' | 'freelance';

export type DegreeType = 'bachelor' | 'master' | 'phd' | 'diploma' | 'other';

export type LanguageProficiency = 'native' | 'fluent' | 'intermediate' | 'basic';

export type ContractType = 'full_time' | 'part_time' | 'contract' | 'substitute';

export type ProfileStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'suspended';

export type PreferredCity =
  | 'riyadh' | 'jeddah' | 'khobar' | 'dammam'
  | 'mecca' | 'medina' | 'abha' | 'tabuk' | 'other';

// ─── Sub-document Interfaces ──────────────────────────────────

export interface IPersonalInfo {
  fullNameAr?: string;
  fullNameEn?: string;
  nationalId?: string;       // National ID or Iqama number
  dateOfBirth?: Date;
  gender?: 'male' | 'female';
  nationality?: string;
  photoUrl?: string;
  photoKey?: string;         // storage key for deletion
  whatsapp?: string;
}

export interface IProfessionalInfo {
  subjects: Subject[];
  gradeLevels: GradeLevel[];
  experienceRange?: ExperienceRange;
  employmentStatus?: EmploymentStatus;
  // Only meaningful when employmentStatus === 'employed' (SRD 2.2.2).
  // Days of notice the teacher must give their current employer.
  noticePeriodDays?: number;
}

export interface IEducation {
  degreeType?: DegreeType;
  major?: string;
  university?: string;
  graduationYear?: number;
  country?: string;
  certificateUrl?: string;
  certificateKey?: string;
}

export interface ICertification {
  _id?: string;
  name: string;
  issuer: string;
  issueDate?: Date;
  expiryDate?: Date;
  hasExpiry: boolean;
  fileUrl?: string;
  fileKey?: string;
}

export interface ILanguageEntry {
  language: string;           // e.g. 'arabic', 'english', or custom
  proficiency: LanguageProficiency;
}

export interface ILocationPreferences {
  preferredCities: PreferredCity[];
  willingToRelocate: boolean;
}

export interface ISalaryExpectations {
  minMonthlySAR?: number;
  maxMonthlySAR?: number;
  contractTypes: ContractType[];
}

export interface IResumeInfo {
  fileUrl?: string;
  fileKey?: string;
  originalName?: string;
  uploadedAt?: Date;
}

// ─── Main Interface ───────────────────────────────────────────

export interface ITeacherProfile {
  _id?: string;
  uuid: string;
  userId: mongoose.Types.ObjectId;

  personal: IPersonalInfo;
  professional: IProfessionalInfo;
  education: IEducation;
  certifications: ICertification[];
  languages: ILanguageEntry[];
  locationPreferences: ILocationPreferences;
  salaryExpectations: ISalaryExpectations;
  resume: IResumeInfo;

  profileStatus: ProfileStatus;
  completionPercentage: number;
  adminNotes?: string;
  rejectionReason?: string;
  submittedAt?: Date;
  approvedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export interface ITeacherProfileDocument extends Omit<ITeacherProfile, '_id'>, Document {}

// ─── Sub-schemas ──────────────────────────────────────────────

const personalInfoSchema = new Schema<IPersonalInfo>(
  {
    fullNameAr: { type: String, trim: true },
    fullNameEn: { type: String, trim: true },
    nationalId: { type: String, trim: true },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ['male', 'female'] },
    nationality: { type: String, trim: true },
    photoUrl: { type: String },
    photoKey: { type: String },
    whatsapp: { type: String, trim: true },
  },
  { _id: false },
);

const professionalInfoSchema = new Schema<IProfessionalInfo>(
  {
    subjects: [
      {
        type: String,
        enum: [
          'islamic_studies', 'arabic', 'english', 'math', 'science',
          'physics', 'chemistry', 'biology', 'computer_science',
          'social_studies', 'pe', 'art', 'other',
        ],
      },
    ],
    gradeLevels: [
      {
        type: String,
        enum: [
          'kg',
          'elementary_1', 'elementary_2', 'elementary_3',
          'elementary_4', 'elementary_5', 'elementary_6',
          'middle_7', 'middle_8', 'middle_9',
          'high_10', 'high_11', 'high_12',
        ],
      },
    ],
    experienceRange: {
      type: String,
      enum: ['0-1', '1-3', '3-5', '5-10', '10+'],
    },
    employmentStatus: {
      type: String,
      enum: ['employed', 'unemployed', 'freelance'],
    },
    noticePeriodDays: {
      type: Number,
      min: 0,
      max: 180,
    },
  },
  { _id: false },
);

const educationSchema = new Schema<IEducation>(
  {
    degreeType: {
      type: String,
      enum: ['bachelor', 'master', 'phd', 'diploma', 'other'],
    },
    major: { type: String, trim: true },
    university: { type: String, trim: true },
    graduationYear: { type: Number, min: 1950, max: new Date().getFullYear() + 1 },
    country: { type: String, trim: true },
    certificateUrl: { type: String },
    certificateKey: { type: String },
  },
  { _id: false },
);

const certificationSchema = new Schema<ICertification>(
  {
    name: { type: String, required: true, trim: true },
    issuer: { type: String, required: true, trim: true },
    issueDate: { type: Date },
    expiryDate: { type: Date },
    hasExpiry: { type: Boolean, default: false },
    fileUrl: { type: String },
    fileKey: { type: String },
  },
);

const languageEntrySchema = new Schema<ILanguageEntry>(
  {
    language: { type: String, required: true, trim: true, lowercase: true },
    proficiency: {
      type: String,
      required: true,
      enum: ['native', 'fluent', 'intermediate', 'basic'],
    },
  },
  { _id: false },
);

const locationPreferencesSchema = new Schema<ILocationPreferences>(
  {
    preferredCities: [
      {
        type: String,
        enum: ['riyadh', 'jeddah', 'khobar', 'dammam', 'mecca', 'medina', 'abha', 'tabuk', 'other'],
      },
    ],
    willingToRelocate: { type: Boolean, default: false },
  },
  { _id: false },
);

const salaryExpectationsSchema = new Schema<ISalaryExpectations>(
  {
    minMonthlySAR: { type: Number, min: 0 },
    maxMonthlySAR: { type: Number, min: 0 },
    contractTypes: [
      {
        type: String,
        enum: ['full_time', 'part_time', 'contract', 'substitute'],
      },
    ],
  },
  { _id: false },
);

const resumeInfoSchema = new Schema<IResumeInfo>(
  {
    fileUrl: { type: String },
    fileKey: { type: String },
    originalName: { type: String, trim: true },
    uploadedAt: { type: Date },
  },
  { _id: false },
);

// ─── Main Schema ──────────────────────────────────────────────

const teacherProfileSchema = new Schema<ITeacherProfileDocument>(
  {
    uuid: {
      type: String,
      required: true,
      unique: true,
      default: () => uuidv4(),
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },

    personal: { type: personalInfoSchema, default: () => ({}) },
    professional: {
      type: professionalInfoSchema,
      default: () => ({ subjects: [], gradeLevels: [], contractTypes: [] }),
    },
    education: { type: educationSchema, default: () => ({}) },
    certifications: { type: [certificationSchema], default: [] },
    languages: { type: [languageEntrySchema], default: [] },
    locationPreferences: {
      type: locationPreferencesSchema,
      default: () => ({ preferredCities: [], willingToRelocate: false }),
    },
    salaryExpectations: {
      type: salaryExpectationsSchema,
      default: () => ({ contractTypes: [] }),
    },
    resume: { type: resumeInfoSchema, default: () => ({}) },

    profileStatus: {
      type: String,
      enum: ['draft', 'pending', 'approved', 'rejected', 'suspended'],
      default: 'draft',
    },
    completionPercentage: { type: Number, default: 0, min: 0, max: 100 },
    adminNotes: { type: String, trim: true },
    rejectionReason: { type: String, trim: true },
    submittedAt: { type: Date },
    approvedAt: { type: Date },
  },
  { timestamps: true },
);

// ─── Indexes ──────────────────────────────────────────────────

teacherProfileSchema.index({ profileStatus: 1 });
teacherProfileSchema.index({ 'professional.subjects': 1 });
teacherProfileSchema.index({ 'professional.gradeLevels': 1 });
teacherProfileSchema.index({ 'locationPreferences.preferredCities': 1 });
teacherProfileSchema.index({ completionPercentage: -1 });
teacherProfileSchema.index({ profileStatus: 1, completionPercentage: -1 });

// ─── Model ────────────────────────────────────────────────────

const TeacherProfile: Model<ITeacherProfileDocument> = mongoose.model<ITeacherProfileDocument>(
  'TeacherProfile',
  teacherProfileSchema,
);

export default TeacherProfile;
