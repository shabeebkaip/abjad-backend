import mongoose, { Document, Schema } from 'mongoose';

export type SchoolTeamRole = 'admin' | 'recruiter' | 'interviewer' | 'viewer';

export interface ISchoolTeamMember {
  schoolId: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId; // set after user accepts invite
  email: string;
  name: string;
  role: SchoolTeamRole;
  invitedBy: mongoose.Types.ObjectId;
  inviteToken?: string; // hashed invite token
  inviteExpiresAt?: Date;
  status: 'invited' | 'active' | 'suspended';
  joinedAt?: Date;
}

export interface ISchoolTeamMemberDocument extends ISchoolTeamMember, Document {}

const schoolTeamSchema = new Schema<ISchoolTeamMemberDocument>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    email: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    role: {
      type: String,
      enum: ['admin', 'recruiter', 'interviewer', 'viewer'],
      required: true,
    },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    inviteToken: { type: String, select: false },
    inviteExpiresAt: { type: Date },
    status: {
      type: String,
      enum: ['invited', 'active', 'suspended'],
      default: 'invited',
    },
    joinedAt: { type: Date },
  },
  { timestamps: true }
);

schoolTeamSchema.index({ schoolId: 1, status: 1 });
schoolTeamSchema.index({ schoolId: 1, email: 1 }, { unique: true });
schoolTeamSchema.index({ userId: 1, schoolId: 1 });

export default mongoose.model<ISchoolTeamMemberDocument>('SchoolTeamMember', schoolTeamSchema);
