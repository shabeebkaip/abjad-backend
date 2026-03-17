import mongoose, { Schema, Model, Document } from 'mongoose';

export interface IUser {
  _id?: string;
  name: string;
  phone: string;
  email?: string;
  password?: string;
  role: 'teacher' | 'school' | 'admin';
  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  isActive: boolean;
  isProfileComplete: boolean;
  profileStep: 'basic' | 'profile' | 'documents' | 'complete';
  failedLoginAttempts: number;
  lockedUntil?: Date;
  lastLoginAt?: Date;
  deviceTokens: string[];
  language: 'ar' | 'en';
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IUserDocument extends Document {
  name: string;
  phone: string;
  email?: string;
  password?: string;
  role: 'teacher' | 'school' | 'admin';
  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  isActive: boolean;
  isProfileComplete: boolean;
  profileStep: 'basic' | 'profile' | 'documents' | 'complete';
  failedLoginAttempts: number;
  lockedUntil?: Date;
  lastLoginAt?: Date;
  deviceTokens: string[];
  language: 'ar' | 'en';
}

export interface IUserMethods {
  isLocked(): boolean;
  incrementFailedAttempts(): Promise<IUserDocument>;
  resetFailedAttempts(): Promise<IUserDocument>;
  toSafeObject(): Omit<IUser, 'failedLoginAttempts' | 'lockedUntil' | 'deviceTokens'>;
}

export type UserDocument = IUserDocument & IUserMethods;

// ─── Schema ──────────────────────────────────────────────────
const userSchema = new Schema<UserDocument>(
  {
    name: { type: String, required: true, trim: true },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
      validate: {
        validator: (v: string) => /^\+9665[0-9]{8}$/.test(v),
        message: "Invalid Saudi mobile number (+9665xxxxxxxx)",
      },
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      sparse: true,
      unique: true,
    },
    password: { type: String, select: false }, // optional for OTP
    role: {
      type: String,
      enum: ["teacher", "school", "admin"],
      required: true,
    },
    isPhoneVerified: { type: Boolean, default: false },
    isEmailVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    isProfileComplete: { type: Boolean, default: false },
    profileStep: {
      type: String,
      enum: ["basic", "profile", "documents", "complete"],
      default: "basic",
    },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date },
    lastLoginAt: { type: Date },
    deviceTokens: [{ type: String }],
    language: { type: String, enum: ["ar", "en"], default: "ar" },
  },
  { timestamps: true },
);

// ─── Indexes ─────────────────────────────────────────────────
userSchema.index({ phone: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ lockedUntil: 1 }, { expireAfterSeconds: 0 }); // TTL

// ─── Instance Methods ─────────────────────────────────────────
userSchema.methods.isLocked = function (this: UserDocument): boolean {
  return !!(this.lockedUntil && this.lockedUntil > new Date());
};

userSchema.methods.incrementFailedAttempts = function (this: UserDocument) {
  this.failedLoginAttempts += 1;
  if (this.failedLoginAttempts >= 5) {
    this.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
  }
  return this.save();
};

userSchema.methods.resetFailedAttempts = function (this: UserDocument) {
  this.failedLoginAttempts = 0;
  this.lockedUntil = undefined;
  return this.save();
};

userSchema.methods.toSafeObject = function (this: UserDocument) {
  const obj = this.toObject();
  delete obj.deviceTokens;
  delete obj.failedLoginAttempts;
  delete obj.lockedUntil;
  delete obj.__v;
  return obj;
};

// ─── Model ───────────────────────────────────────────────────
const User: Model<UserDocument> = mongoose.model<UserDocument>('User', userSchema);

export default User;
