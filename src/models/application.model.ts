import mongoose, { Document, Schema } from 'mongoose';

export type ApplicationStatus =
  | 'submitted'
  | 'reviewing'
  | 'shortlisted'
  | 'interview_scheduled'
  | 'offer_extended'
  | 'hired'
  | 'rejected'
  | 'withdrawn';

export interface IStatusHistoryEntry {
  status: ApplicationStatus;
  timestamp: Date;
  note?: string;
  changedBy?: mongoose.Types.ObjectId;
}

export interface IApplication extends Document {
  referenceNumber: string;
  jobId: mongoose.Types.ObjectId;
  teacherId: mongoose.Types.ObjectId;
  teacherProfileId: mongoose.Types.ObjectId;
  schoolId: mongoose.Types.ObjectId;
  coverLetter?: string;
  status: ApplicationStatus;
  statusHistory: IStatusHistoryEntry[];
  matchScore?: number;
  rejectionReason?: string;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const statusHistorySchema = new Schema<IStatusHistoryEntry>(
  {
    status: { type: String, enum: ['submitted','reviewing','shortlisted','interview_scheduled','offer_extended','hired','rejected','withdrawn'], required: true },
    timestamp: { type: Date, default: Date.now },
    note: { type: String },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const applicationSchema = new Schema<IApplication>(
  {
    referenceNumber: { type: String, required: true, unique: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    teacherProfileId: { type: Schema.Types.ObjectId, ref: 'TeacherProfile', required: true },
    schoolId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    coverLetter: { type: String, maxlength: 500 },
    status: {
      type: String,
      enum: ['submitted','reviewing','shortlisted','interview_scheduled','offer_extended','hired','rejected','withdrawn'],
      default: 'submitted',
      index: true,
    },
    statusHistory: [statusHistorySchema],
    matchScore: { type: Number, min: 0, max: 100 },
    rejectionReason: { type: String },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

applicationSchema.index({ teacherId: 1, status: 1 });
applicationSchema.index({ jobId: 1, status: 1 });
applicationSchema.index({ teacherId: 1, jobId: 1 }, { unique: true });
applicationSchema.index({ createdAt: -1 });

export const Application = mongoose.model<IApplication>('Application', applicationSchema);
