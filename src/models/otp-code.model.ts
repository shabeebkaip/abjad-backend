import mongoose, { Schema, Model } from 'mongoose';

export interface IOtpCode {
  _id?: string;
  phone: string;
  code: string;        // bcrypt hashed
  purpose: 'signup' | 'login' | 'reset';
  attempts: number;
  expiresAt: Date;
  createdAt?: Date;
}

const otpCodeSchema = new Schema<IOtpCode>(
  {
    phone:    { type: String, required: true, index: true },
    code:     { type: String, required: true, select: false },
    purpose:  { type: String, enum: ['signup', 'login', 'reset'], required: true },
    attempts: { type: Number, default: 0 },
    expiresAt:{ type: Date, required: true },
  },
  { timestamps: true }
);

// Auto-delete expired OTPs via MongoDB TTL index
otpCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// One active OTP per phone+purpose
otpCodeSchema.index({ phone: 1, purpose: 1 }, { unique: true });

const OtpCode: Model<IOtpCode> =
  mongoose.models.OtpCode || mongoose.model<IOtpCode>('OtpCode', otpCodeSchema);

export default OtpCode;