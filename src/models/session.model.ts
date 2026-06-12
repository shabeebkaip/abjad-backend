import mongoose, { Schema, Model, Document } from 'mongoose';

export interface ISession {
  _id?: string;
  userId: mongoose.Types.ObjectId;
  refreshTokenHash: string;    // SHA-256 hash of refresh token
  deviceInfo: {
    userAgent?: string;
    ip?: string;
    platform?: string;
  };
  ipAddress: string;           // Top-level IP address field
  expiresAt: Date;
  isRevoked: boolean;
  rememberDevice: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ISessionDocument extends Document {
  userId: mongoose.Types.ObjectId;
  refreshTokenHash: string;
  deviceInfo: {
    userAgent?: string;
    ip?: string;
    platform?: string;
  };
  ipAddress: string;
  expiresAt: Date;
  isRevoked: boolean;
  rememberDevice: boolean;
}

const sessionSchema = new Schema<ISessionDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    refreshTokenHash: { type: String, required: true },
    deviceInfo: {
      userAgent: { type: String },
      ip: { type: String },
      platform: { type: String },
    },
    ipAddress: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    isRevoked: { type: Boolean, default: false },
    rememberDevice: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// TTL index — auto-deletes expired sessions
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ userId: 1 });
sessionSchema.index({ refreshTokenHash: 1 });
sessionSchema.index({ ipAddress: 1 });

const Session: Model<ISessionDocument> = mongoose.model<ISessionDocument>('Session', sessionSchema);

export default Session;