import mongoose, { Schema, Model, Document } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IUser {
  _id?: string;
  uuid: string;
  name?: string;
  phone: string;
  email?: string;
  password?: string;
  role: 'teacher' | 'school' | 'admin';
  status: 'active' | 'suspended' | 'blocked' | 'pending';
  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  isProfileComplete: boolean;
  profileStep: 'basic' | 'profile' | 'documents' | 'complete';
  failedLoginAttempts: number;
  lockedUntil?: Date;
  lastLoginAt?: Date;
  loginCount: number;
  pushNotificationsEnabled: boolean;
  emailNotificationsEnabled: boolean;
  deviceTokens: string[];
  language: 'ar' | 'en';
  suspensionReason?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IUserDocument extends Document {
  uuid: string;
  name?: string;
  phone: string;
  email?: string;
  password?: string;
  role: 'teacher' | 'school' | 'admin';
  status: 'active' | 'suspended' | 'blocked' | 'pending';
  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  isProfileComplete: boolean;
  profileStep: 'basic' | 'profile' | 'documents' | 'complete';
  failedLoginAttempts: number;
  lockedUntil?: Date;
  lastLoginAt?: Date;
  loginCount: number;
  pushNotificationsEnabled: boolean;
  emailNotificationsEnabled: boolean;
  deviceTokens: string[];
  language: 'ar' | 'en';
  suspensionReason?: string;
}

export interface IUserMethods {
  isLocked(): boolean;
  canLogin(): boolean;
  incrementFailedAttempts(): Promise<IUserDocument>;
  resetFailedAttempts(): Promise<IUserDocument>;
  incrementLoginCount(): Promise<IUserDocument>;
  suspend(reason: string): Promise<IUserDocument>;
  unsuspend(): Promise<IUserDocument>;
  toSafeObject(): Omit<IUser, 'failedLoginAttempts' | 'lockedUntil' | 'deviceTokens' | 'password'>;
}

export type UserDocument = IUserDocument & IUserMethods;

// ─── Schema ──────────────────────────────────────────────────
const userSchema = new Schema<UserDocument>(
  {
    uuid: {
      type: String,
      required: true,
      unique: true,
      default: () => uuidv4(),
    },
    name: { type: String, trim: true },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
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
    status: {
      type: String,
      enum: ["active", "suspended", "blocked", "pending"],
      default: "pending",
    },
    isPhoneVerified: { type: Boolean, default: false },
    isEmailVerified: { type: Boolean, default: false },
    isProfileComplete: { type: Boolean, default: false },
    profileStep: {
      type: String,
      enum: ["basic", "profile", "documents", "complete"],
      default: "basic",
    },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date },
    lastLoginAt: { type: Date },
    loginCount: { type: Number, default: 0 },
    pushNotificationsEnabled: { type: Boolean, default: true },
    emailNotificationsEnabled: { type: Boolean, default: true },
    deviceTokens: [{ type: String }],
    language: { type: String, enum: ["ar", "en"], default: "ar" },
    suspensionReason: { type: String, trim: true },
  },
  { timestamps: true },
);

// ─── Indexes ─────────────────────────────────────────────────
// Query Indexes (unique constraints are defined at field level above)
userSchema.index({ role: 1 }); // role → index
userSchema.index({ status: 1 }); // status → index
userSchema.index({ createdAt: -1 }); // createdAt → index

// Composite & Special Indexes
userSchema.index({ role: 1, status: 1 }); // Compound: find users by role + status
userSchema.index({ loginCount: -1 }); // Top active users
userSchema.index({ lockedUntil: 1 }, { expireAfterSeconds: 0 }); // TTL - auto-delete

// ─── Instance Methods ─────────────────────────────────────────
userSchema.methods.isLocked = function (this: UserDocument): boolean {
  return !!(this.lockedUntil && this.lockedUntil > new Date());
};

userSchema.methods.canLogin = function (this: UserDocument): boolean {
  return this.status === 'active' && !this.isLocked();
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

userSchema.methods.incrementLoginCount = function (this: UserDocument) {
  this.loginCount += 1;
  this.lastLoginAt = new Date();
  return this.save();
};

userSchema.methods.suspend = function (this: UserDocument, reason: string) {
  this.status = 'suspended';
  this.suspensionReason = reason;
  return this.save();
};

userSchema.methods.unsuspend = function (this: UserDocument) {
  this.status = 'active';
  this.suspensionReason = undefined;
  return this.save();
};

userSchema.methods.toSafeObject = function (this: UserDocument) {
  const obj = this.toObject();
  delete obj.deviceTokens;
  delete obj.failedLoginAttempts;
  delete obj.lockedUntil;
  delete obj.password;
  delete obj.__v;
  return obj;
};

// ─── Model ───────────────────────────────────────────────────
const User: Model<UserDocument> = mongoose.model<UserDocument>('User', userSchema);

export default User;
