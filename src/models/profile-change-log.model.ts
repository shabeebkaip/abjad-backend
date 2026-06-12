import mongoose, { Schema, Model, Document } from 'mongoose';

// SRD 2.2.10 — Version history for teacher profile edits.
// Recorded on every save in teacher-profile.service. Major changes also flip
// profileStatus back to 'pending' for admin re-approval.

export type ProfileSection =
  | 'personal'
  | 'professional'
  | 'education'
  | 'certifications'
  | 'languages'
  | 'locationPreferences'
  | 'salaryExpectations'
  | 'resume'
  | 'photo';

export interface IProfileFieldChange {
  field: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export interface IProfileChangeLog {
  _id?: string;
  teacherProfileId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  section: ProfileSection;
  changes: IProfileFieldChange[];
  isMajor: boolean;
  triggeredReApproval: boolean;
  createdAt?: Date;
}

export interface IProfileChangeLogDocument extends Document {
  teacherProfileId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  section: ProfileSection;
  changes: IProfileFieldChange[];
  isMajor: boolean;
  triggeredReApproval: boolean;
  createdAt: Date;
}

const fieldChangeSchema = new Schema<IProfileFieldChange>(
  {
    field: { type: String, required: true },
    oldValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const profileChangeLogSchema = new Schema<IProfileChangeLogDocument>(
  {
    teacherProfileId: { type: Schema.Types.ObjectId, ref: 'TeacherProfile', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    section: {
      type: String,
      required: true,
      enum: ['personal', 'professional', 'education', 'certifications', 'languages', 'locationPreferences', 'salaryExpectations', 'resume', 'photo'],
    },
    changes: { type: [fieldChangeSchema], default: [] },
    isMajor: { type: Boolean, default: false, index: true },
    triggeredReApproval: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

profileChangeLogSchema.index({ teacherProfileId: 1, createdAt: -1 });

const ProfileChangeLog: Model<IProfileChangeLogDocument> =
  mongoose.model<IProfileChangeLogDocument>('ProfileChangeLog', profileChangeLogSchema);

export default ProfileChangeLog;
