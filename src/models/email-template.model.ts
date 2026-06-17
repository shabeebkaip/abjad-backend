import mongoose, { Document, Schema } from 'mongoose';

// Tier 2 #12 — One row per *customised* email template. Templates that have
// never been edited stay out of this collection — the registry default is
// authoritative until somebody saves an override. A reset() deletes the row.

export interface IEmailTemplate extends Document {
  key: string;
  subject: string;
  body: string;
  updatedAt: Date;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const emailTemplateSchema = new Schema<IEmailTemplate>(
  {
    key:     { type: String, required: true, unique: true, index: true },
    subject: { type: String, required: true, maxlength: 500 },
    body:    { type: String, required: true, maxlength: 50_000 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export const EmailTemplate = mongoose.model<IEmailTemplate>('EmailTemplate', emailTemplateSchema);
