import mongoose, { Document, Schema } from 'mongoose';

export interface IShortlistTeacher {
  teacherId: mongoose.Types.ObjectId;
  addedAt: Date;
  addedBy: mongoose.Types.ObjectId;
  notes?: string;
  tags?: string[];
}

export interface IShortlist {
  schoolId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  color?: string;
  jobId?: mongoose.Types.ObjectId;
  teachers: IShortlistTeacher[];
  isArchived: boolean;
}

export interface IShortlistDocument extends IShortlist, Document {}

const shortlistSchema = new Schema<IShortlistDocument>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500 },
    color: { type: String, trim: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job' },

    teachers: [
      {
        teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        addedAt: { type: Date, default: Date.now },
        addedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        notes: { type: String, trim: true, maxlength: 1000 },
        tags: [{ type: String, trim: true }],
        _id: false,
      },
    ],

    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

shortlistSchema.index({ schoolId: 1, isArchived: 1 });
shortlistSchema.index({ schoolId: 1, jobId: 1 });

export default mongoose.model<IShortlistDocument>('Shortlist', shortlistSchema);
