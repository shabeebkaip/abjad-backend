import mongoose, { Document, Schema } from 'mongoose';

/**
 * Generic atomic counter for sequence-style IDs (invoice numbers, etc.).
 * Use via `nextInvoiceNumber()` in `utils/invoice-number.util.ts`.
 */
export interface ICounter extends Document {
  key: string;
  seq: number;
}

const counterSchema = new Schema<ICounter>(
  {
    key: { type: String, required: true, unique: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

export const Counter = mongoose.model<ICounter>('Counter', counterSchema);
