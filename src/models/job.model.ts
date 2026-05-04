import mongoose, { Document, Schema } from 'mongoose';

export type Subject =
  | 'islamic_studies' | 'arabic' | 'english' | 'math' | 'science'
  | 'physics' | 'chemistry' | 'biology' | 'computer_science'
  | 'social_studies' | 'pe' | 'art' | 'other';

export type GradeLevel =
  | 'kg'
  | 'elementary_1' | 'elementary_2' | 'elementary_3' | 'elementary_4' | 'elementary_5' | 'elementary_6'
  | 'middle_7' | 'middle_8' | 'middle_9'
  | 'high_10' | 'high_11' | 'high_12';

export type ExperienceRange = '0-1' | '1-3' | '3-5' | '5-10' | '10+';

export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'temporary';

export type SalaryDisplay = 'show' | 'negotiable' | 'hidden';

export type LanguageRequirement = 'arabic' | 'english' | 'bilingual' | 'other';

export type DegreeType = 'bachelor' | 'master' | 'phd' | 'diploma' | 'other';

export type JobStatus = 'draft' | 'active' | 'closed' | 'expired';

export type ContractDurationType = 'day' | 'month' | 'year';

export interface IJob extends Document {
  uuid: string;
  schoolId: mongoose.Types.ObjectId;
  title: string;
  subjects: Subject[];
  gradeLevels: GradeLevel[];
  description: string;
  employmentType: EmploymentType;
  salary: {
    min?: number;
    max?: number;
    dailyRate?: number;
    display: SalaryDisplay;
  };
  contractDuration: {
    type: ContractDurationType;
    value?: number;
  };
  positions: number;
  startDate?: Date;
  deadline?: Date;
  city: string;
  languageRequirement: LanguageRequirement;
  experienceRequired?: ExperienceRange;
  degreeRequired?: DegreeType;
  certificationsRequired?: string[];
  certificationsPreferred?: string[];
  teachingLicenseRequired: boolean;
  genderPreference?: 'male' | 'female' | 'any';
  nationalityPreferences?: string[];
  specialRequirements?: string;
  status: JobStatus;
  applicationsCount: number;
  viewsCount: number;
  isAnonymous: boolean;
  maxApplications?: number;
  autoCloseOnMax: boolean;
  // Populated by repository (not stored in DB)
  school?: { name: string; logoUrl?: string };
  createdAt: Date;
  updatedAt: Date;
}

const jobSchema = new Schema<IJob>(
  {
    uuid: { type: String, required: true, unique: true, default: () => new mongoose.Types.ObjectId().toString() },
    schoolId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    subjects: [{ type: String, enum: ['islamic_studies','arabic','english','math','science','physics','chemistry','biology','computer_science','social_studies','pe','art','other'] }],
    gradeLevels: [{ type: String, enum: ['kg','elementary_1','elementary_2','elementary_3','elementary_4','elementary_5','elementary_6','middle_7','middle_8','middle_9','high_10','high_11','high_12'] }],
    description: { type: String, required: true, maxlength: 10000 },
    employmentType: { type: String, enum: ['full_time','part_time','contract','temporary'], required: true },
    salary: {
      min: { type: Number },
      max: { type: Number },
      dailyRate: { type: Number },
      display: { type: String, enum: ['show','negotiable','hidden'], default: 'negotiable' },
    },
    contractDuration: {
      type: { type: String, enum: ['day','month','year'], default: 'month' },
      value: { type: Number },
    },
    positions: { type: Number, default: 1, min: 1 },
    startDate: { type: Date },
    deadline: { type: Date, index: true },
    city: { type: String, required: true, trim: true },
    languageRequirement: { type: String, enum: ['arabic','english','bilingual','other'], default: 'arabic' },
    experienceRequired: { type: String, enum: ['0-1','1-3','3-5','5-10','10+'] },
    degreeRequired: { type: String, enum: ['bachelor','master','phd','diploma','other'] },
    certificationsRequired: [{ type: String }],
    certificationsPreferred: [{ type: String }],
    teachingLicenseRequired: { type: Boolean, default: false },
    genderPreference: { type: String, enum: ['male','female','any'], default: 'any' },
    nationalityPreferences: [{ type: String }],
    specialRequirements: { type: String, maxlength: 1000 },
    status: { type: String, enum: ['draft','active','closed','expired'], default: 'draft', index: true },
    applicationsCount: { type: Number, default: 0 },
    viewsCount: { type: Number, default: 0 },
    isAnonymous: { type: Boolean, default: false },
    maxApplications: { type: Number },
    autoCloseOnMax: { type: Boolean, default: false },
  },
  { timestamps: true }
);

jobSchema.index({ status: 1, deadline: 1 });
jobSchema.index({ subjects: 1 });
jobSchema.index({ gradeLevels: 1 });
jobSchema.index({ city: 1 });
jobSchema.index({ employmentType: 1 });
jobSchema.index({ 'salary.min': 1, 'salary.max': 1 });
jobSchema.index({ createdAt: -1 });

export const Job = mongoose.model<IJob>('Job', jobSchema);
