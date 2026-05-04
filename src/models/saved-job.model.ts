import mongoose, { Document, Schema } from 'mongoose';

export interface ISavedJob extends Document {
  teacherId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  createdAt: Date;
}

const savedJobSchema = new Schema<ISavedJob>(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

savedJobSchema.index({ teacherId: 1, jobId: 1 }, { unique: true });

export const SavedJob = mongoose.model<ISavedJob>('SavedJob', savedJobSchema);
