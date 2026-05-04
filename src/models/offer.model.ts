import mongoose, { Document, Schema } from 'mongoose';

export type OfferStatus = 'sent' | 'viewed' | 'accepted' | 'declined' | 'negotiating' | 'expired';

export interface INegotiationEntry {
  from: 'teacher' | 'school';
  message: string;
  counterSalary?: number;
  timestamp: Date;
}

export interface ITeacherOfferResponse {
  action: 'accepted' | 'declined' | 'negotiate';
  reason?: string;
  counterSalary?: number;
  respondedAt: Date;
}

export interface IOffer extends Document {
  applicationId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  teacherId: mongoose.Types.ObjectId;
  schoolId: mongoose.Types.ObjectId;
  position: string;
  salary: number;
  contractDuration?: string;
  startDate?: Date;
  benefits?: string;
  terms?: string;
  deadline: Date;
  status: OfferStatus;
  offerLetterUrl?: string;
  teacherResponse?: ITeacherOfferResponse;
  negotiationHistory: INegotiationEntry[];
  viewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const offerSchema = new Schema<IOffer>(
  {
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true, index: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    schoolId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    position: { type: String, required: true },
    salary: { type: Number, required: true },
    contractDuration: { type: String },
    startDate: { type: Date },
    benefits: { type: String },
    terms: { type: String },
    deadline: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ['sent','viewed','accepted','declined','negotiating','expired'],
      default: 'sent',
      index: true,
    },
    offerLetterUrl: { type: String },
    teacherResponse: {
      action: { type: String, enum: ['accepted','declined','negotiate'] },
      reason: { type: String },
      counterSalary: { type: Number },
      respondedAt: { type: Date },
    },
    negotiationHistory: [
      {
        from: { type: String, enum: ['teacher','school'], required: true },
        message: { type: String, required: true },
        counterSalary: { type: Number },
        timestamp: { type: Date, default: Date.now },
        _id: false,
      },
    ],
    viewedAt: { type: Date },
  },
  { timestamps: true }
);

offerSchema.index({ teacherId: 1, status: 1 });
offerSchema.index({ deadline: 1, status: 1 });

export const Offer = mongoose.model<IOffer>('Offer', offerSchema);
