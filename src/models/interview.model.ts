import mongoose, { Document, Schema } from 'mongoose';

export type InterviewType = 'in_person' | 'video' | 'phone' | 'abjad_coordinated';
export type InterviewStatus = 'pending' | 'accepted' | 'declined' | 'rescheduled' | 'completed' | 'cancelled';
export type InterviewRecommendation = 'hire' | 'maybe' | 'reject';

export interface IInterviewFeedback {
  rating: number;
  strengths?: string;
  weaknesses?: string;
  recommendation: InterviewRecommendation;
  notes?: string;
  evaluator?: string;
  submittedAt: Date;
}

export interface ITeacherResponse {
  action: 'accepted' | 'declined' | 'reschedule_requested';
  reason?: string;
  proposedTime?: Date;
  respondedAt: Date;
}

export interface IInterview extends Document {
  applicationId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  teacherId: mongoose.Types.ObjectId;
  schoolId: mongoose.Types.ObjectId;
  type: InterviewType;
  scheduledAt: Date;
  duration: number;
  location?: string;
  meetingLink?: string;
  interviewers: { name: string; email?: string }[];
  instructions?: string;
  status: InterviewStatus;
  teacherResponse?: ITeacherResponse;
  feedback?: IInterviewFeedback;
  reminders: { type: '24h' | '1h'; sentAt: Date }[];
  responseDeadline?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const interviewSchema = new Schema<IInterview>(
  {
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true, index: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    schoolId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['in_person','video','phone','abjad_coordinated'], required: true },
    scheduledAt: { type: Date, required: true, index: true },
    duration: { type: Number, default: 60 },
    location: { type: String },
    meetingLink: { type: String },
    interviewers: [
      {
        name: { type: String, required: true },
        email: { type: String },
        _id: false,
      },
    ],
    instructions: { type: String },
    status: {
      type: String,
      enum: ['pending','accepted','declined','rescheduled','completed','cancelled'],
      default: 'pending',
      index: true,
    },
    teacherResponse: {
      action: { type: String, enum: ['accepted','declined','reschedule_requested'] },
      reason: { type: String },
      proposedTime: { type: Date },
      respondedAt: { type: Date },
    },
    feedback: {
      rating: { type: Number, min: 1, max: 5 },
      strengths: { type: String },
      weaknesses: { type: String },
      recommendation: { type: String, enum: ['hire','maybe','reject'] },
      notes: { type: String },
      evaluator: { type: String },
      submittedAt: { type: Date },
    },
    reminders: [
      {
        type: { type: String, enum: ['24h','1h'] },
        sentAt: { type: Date },
        _id: false,
      },
    ],
    responseDeadline: { type: Date },
  },
  { timestamps: true }
);

interviewSchema.index({ teacherId: 1, status: 1 });
interviewSchema.index({ teacherId: 1, scheduledAt: 1 });

export const Interview = mongoose.model<IInterview>('Interview', interviewSchema);
