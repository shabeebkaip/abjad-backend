import mongoose, { Document, Schema } from 'mongoose';

export type FeedbackType = 'post_hire' | 'platform' | 'suggestion' | 'report';

export interface IFeedback extends Document {
  userId: mongoose.Types.ObjectId;
  type: FeedbackType;
  rating?: number;
  content: string;
  isAnonymous: boolean;
  relatedId?: mongoose.Types.ObjectId;
  relatedModel?: 'Job' | 'Application' | 'Interview';
  createdAt: Date;
}

const feedbackSchema = new Schema<IFeedback>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['post_hire','platform','suggestion','report'], required: true },
    rating: { type: Number, min: 1, max: 5 },
    content: { type: String, required: true, maxlength: 2000 },
    isAnonymous: { type: Boolean, default: false },
    relatedId: { type: Schema.Types.ObjectId },
    relatedModel: { type: String, enum: ['Job','Application','Interview'] },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Feedback = mongoose.model<IFeedback>('Feedback', feedbackSchema);
