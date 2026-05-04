import mongoose, { Document, Schema } from 'mongoose';

export interface ICandidateNote {
  schoolId: mongoose.Types.ObjectId;
  teacherId: mongoose.Types.ObjectId;
  applicationId?: mongoose.Types.ObjectId;
  content: string;
  createdBy: mongoose.Types.ObjectId;
  tags?: string[];
}

export interface ICandidateNoteDocument extends ICandidateNote, Document {}

const candidateNoteSchema = new Schema<ICandidateNoteDocument>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application' },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tags: [{ type: String, trim: true }],
  },
  { timestamps: true }
);

candidateNoteSchema.index({ schoolId: 1, teacherId: 1 });
candidateNoteSchema.index({ schoolId: 1, applicationId: 1 });

export default mongoose.model<ICandidateNoteDocument>('CandidateNote', candidateNoteSchema);
