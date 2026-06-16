import mongoose, { Document, Schema } from 'mongoose';

export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded';
export type PaymentMethod =
  | 'moyasar_card' | 'mada' | 'apple_pay' | 'stcpay' | 'bank_transfer' | 'manual';

export interface IPayment extends Document {
  invoiceId: mongoose.Types.ObjectId;
  amountHalala: number;
  method: PaymentMethod;
  status: PaymentStatus;

  // Provider attribution — populated by webhook handler
  moyasarPaymentId?: string;

  // Bank transfer manual flow
  bankReference?: string;
  markedPaidBy?: mongoose.Types.ObjectId;   // ref User (admin)
  markedPaidAt?: Date;

  // Audit / debug
  failureReason?: string;
  rawProviderPayload?: unknown;             // full webhook body for forensic review

  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
    amountHalala: { type: Number, required: true, min: 0 },
    method: {
      type: String,
      required: true,
      enum: ['moyasar_card', 'mada', 'apple_pay', 'stcpay', 'bank_transfer', 'manual'],
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'succeeded', 'failed', 'refunded'],
      default: 'pending',
    },
    moyasarPaymentId: { type: String, index: true, sparse: true },
    bankReference: { type: String, trim: true },
    markedPaidBy: { type: Schema.Types.ObjectId, ref: 'User' },
    markedPaidAt: { type: Date },
    failureReason: { type: String, maxlength: 1000 },
    rawProviderPayload: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

paymentSchema.index({ status: 1, createdAt: -1 });

export const Payment = mongoose.model<IPayment>('Payment', paymentSchema);
