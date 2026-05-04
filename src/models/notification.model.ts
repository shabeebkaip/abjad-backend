import mongoose, { Document, Schema } from 'mongoose';

export type NotificationType =
  | 'job_match'
  | 'application_status'
  | 'interview_invitation'
  | 'interview_reminder'
  | 'offer_received'
  | 'message'
  | 'profile_status'
  | 'system';

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  data?: {
    jobId?: string;
    applicationId?: string;
    interviewId?: string;
    offerId?: string;
    ticketId?: string;
    [key: string]: string | undefined;
  };
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: ['job_match','application_status','interview_invitation','interview_reminder','offer_received','message','profile_status','system'],
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    data: { type: Schema.Types.Mixed },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }); // auto-delete after 90 days

export const Notification = mongoose.model<INotification>('Notification', notificationSchema);
