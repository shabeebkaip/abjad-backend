import mongoose, { Schema, Model, Document } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IUser {
  _id?: string;
  uuid: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  schoolName?: string;
  email: string;
  phone?: string;
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
  // SRD 2.8.2 — extra channel toggles + per-type opt-out map
  soundEnabled: boolean;
  notificationPreferences: INotificationPreferences;
  deviceTokens: string[];
  language: 'ar' | 'en';
  suspensionReason?: string;
  // ── Phase B billing — trial + grandfathering (SSD §2.1.5) ────────
  // legacyAccess: set to true for accounts that existed BEFORE the paywall
  // flipped on. These accounts bypass subscription checks forever.
  legacyAccess?: boolean;
  // Trial bookkeeping. Only meaningful for role=school.
  trialStartedAt?: Date;
  trialEndsAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

// SRD 2.8.2 — per-type opt-out for each of the 8 notification kinds.
// Default true (opt-in) so existing behaviour is unchanged.
export interface INotificationPreferences {
  job_match: boolean;
  application_status: boolean;
  interview_invitation: boolean;
  interview_reminder: boolean;
  offer_received: boolean;
  message: boolean;
  profile_status: boolean;
  system: boolean;
}

export interface IUserDocument extends Document {
  uuid: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  schoolName?: string;
  email: string;
  phone?: string;
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
  soundEnabled: boolean;
  notificationPreferences: INotificationPreferences;
  deviceTokens: string[];
  language: 'ar' | 'en';
  suspensionReason?: string;
  legacyAccess?: boolean;
  trialStartedAt?: Date;
  trialEndsAt?: Date;
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
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    schoolName: { type: String, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
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
      // "active" by default — OTP signup IS the email verification. There is
      // no separate "pending email verification" state in this codebase, so a
      // pending default would silently lock new accounts out of /me. The
      // "pending" enum value stays for admin workflows but must never gate
      // auth — see /me + /refresh which now only reject suspended/blocked.
      default: "active",
    },
    isPhoneVerified: { type: Boolean, default: false },
    isEmailVerified: { type: Boolean, default: true },
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
    soundEnabled: { type: Boolean, default: true },
    notificationPreferences: {
      job_match:            { type: Boolean, default: true },
      application_status:   { type: Boolean, default: true },
      interview_invitation: { type: Boolean, default: true },
      interview_reminder:   { type: Boolean, default: true },
      offer_received:       { type: Boolean, default: true },
      message:              { type: Boolean, default: true },
      profile_status:       { type: Boolean, default: true },
      system:               { type: Boolean, default: true },
    },
    deviceTokens: [{ type: String }],
    language: { type: String, enum: ["ar", "en"], default: "ar" },
    suspensionReason: { type: String, trim: true },
    // Phase B billing
    legacyAccess: { type: Boolean, default: false, index: true },
    trialStartedAt: { type: Date },
    trialEndsAt: { type: Date, index: true },
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
