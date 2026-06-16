import mongoose, { Document, Schema } from 'mongoose';

export type LedgerEntryType =
  | 'invoice_issued'
  | 'payment_received'
  | 'refund_issued'
  | 'manual_adjustment'
  | 'void';

export type LedgerDirection = 'credit' | 'debit';

/**
 * Full per-owner ledger — every halala of subscription revenue is reflected here.
 * The admin dashboard reads this collection to produce the payment/audit views
 * required by Phase D (memory: SRD 3.x planning, every-halala requirement).
 *
 * Conventions (Abjad's books):
 *  - invoice_issued  → credit (we owe the service)
 *  - payment_received → debit (cash in)
 *  - refund_issued   → credit (cash out)
 *  - manual_adjustment → either direction, set by admin
 */
export interface ILedgerEntry extends Document {
  invoiceId?: mongoose.Types.ObjectId;
  paymentId?: mongoose.Types.ObjectId;
  ownerType: 'school' | 'teacher';
  ownerId: mongoose.Types.ObjectId;
  type: LedgerEntryType;
  direction: LedgerDirection;
  amountHalala: number;
  // Running balance per owner AFTER this entry. Convenience for UI; truth is in the sum.
  balanceHalala: number;
  notes?: string;
  createdBy?: mongoose.Types.ObjectId;   // admin user id when manual
  createdAt: Date;
  updatedAt: Date;
}

const ledgerEntrySchema = new Schema<ILedgerEntry>(
  {
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', index: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', index: true },
    ownerType: { type: String, required: true, enum: ['school', 'teacher'] },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      required: true,
      enum: ['invoice_issued', 'payment_received', 'refund_issued', 'manual_adjustment', 'void'],
    },
    direction: { type: String, required: true, enum: ['credit', 'debit'] },
    amountHalala: { type: Number, required: true, min: 0 },
    balanceHalala: { type: Number, required: true },
    notes: { type: String, maxlength: 1000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

ledgerEntrySchema.index({ ownerType: 1, ownerId: 1, createdAt: -1 });
ledgerEntrySchema.index({ type: 1, createdAt: -1 });

export const LedgerEntry = mongoose.model<ILedgerEntry>('LedgerEntry', ledgerEntrySchema);
