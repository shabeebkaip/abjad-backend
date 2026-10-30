// src/modules/auth/auth.repository.ts
// All DB queries for auth module — User, OtpCode, Session models only
// Exported as singleton instance

import mongoose from 'mongoose';
// @ts-ignore
import User from '../../models/user.model';
// @ts-ignore
import OtpCode from '../../models/otp-code.model';
// @ts-ignore
import Session from '../../models/session.model';

class AuthRepository {
  // ────────────────────────────────────────────────────────
  // USER QUERIES
  // ────────────────────────────────────────────────────────

  /**
   * Find user by email address
   */
  async findUserByEmail(email: string) {
    return User.findOne({ email: email.toLowerCase() });
  }

  /**
   * Find user by ID
   */
  async findUserById(id: string) {
    return User.findById(id);
  }

  /**
   * Find user by email with the (select:false) password hash included.
   * Used by password login — never by the OTP path.
   */
  async findUserWithPassword(email: string) {
    return User.findOne({ email: email.toLowerCase() }).select('+password');
  }

  /**
   * Find user by ID with the (select:false) password hash included.
   * Used by set-password / change-password.
   */
  async findUserByIdWithPassword(id: string) {
    return User.findById(id).select('+password');
  }

  /**
   * Create a new user on first signup
   */
  async createUser(data: {
    email: string;
    role: 'teacher' | 'school' | 'admin';
    firstName?: string;
    lastName?: string;
    schoolName?: string;
    language?: string;
    // Already-hashed password (DECISIONS LOCKED #1 — required at signup).
    passwordHash?: string;
    // Consent record (D6): version of the Terms/Privacy text the user accepted.
    termsVersion?: string;
  }) {
    const user = new User({
      email: data.email.toLowerCase(),
      role: data.role || 'teacher',
      firstName: data.firstName,
      lastName: data.lastName,
      schoolName: data.schoolName,
      language: data.language || 'ar',
      password: data.passwordHash,
      termsAcceptedVersion: data.termsVersion,
      termsAcceptedAt: data.termsVersion ? new Date() : undefined,
      status: 'active',
      isPhoneVerified: false,
      isEmailVerified: true,
      isProfileComplete: false,
      profileStep: 'basic',
      failedLoginAttempts: 0,
      loginCount: 0,
      pushNotificationsEnabled: true,
      emailNotificationsEnabled: true,
      deviceTokens: [],
    });
    return user.save();
  }

  /**
   * Update lastLoginAt timestamp
   */
  async updateLastLogin(userId: string) {
    return User.findByIdAndUpdate(
      userId,
      { lastLoginAt: new Date() },
      { new: true }
    );
  }

  /**
   * Increment failed login attempts AND apply the 15-min lock once the count
   * reaches 5 — delegates to the User schema's incrementFailedAttempts()
   * (user.model.ts) instead of a raw $inc, which used to bump the counter
   * but never actually set lockedUntil (bug: admin login's 5-strikes lock
   * was a no-op; fixed here since this is the one shared call site behind
   * admin login AND the new teacher/school password login).
   */
  async incrementFailedLogins(email: string) {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return null;
    return user.incrementFailedAttempts();
  }

  /**
   * Reset failed login counter and clear lockout
   */
  async resetFailedLogins(email: string) {
    return User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { failedLoginAttempts: 0, otpFailedAttempts: 0, otpLastFailedAt: null, lockedUntil: null },
      { new: true }
    );
  }

  /**
   * Atomically register one OTP verification attempt for the user and return
   * the new count (0 if no such user). Called BEFORE the code is compared, so
   * concurrent guesses each get a distinct count and the caller can refuse
   * everything past the cap — no check-then-act race. The counter is separate
   * from the password one (shared lockedUntil) and survives OTP resends. It
   * restarts at 1 when the previous attempt is older than `windowMs` (the lock
   * window), so stale failures don't accumulate forever. It is deliberately NOT
   * zeroed when the lock is applied: it stays above the cap for the lock's
   * duration, which also rejects stragglers that passed the lock gate just
   * before it was set. Cleared by resetFailedLogins on success.
   */
  async registerOtpAttempt(email: string, windowMs: number): Promise<number> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - windowMs);
    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      [
        {
          $set: {
            otpFailedAttempts: {
              $cond: [
                { $and: [{ $ne: [{ $type: '$otpLastFailedAt' }, 'missing'] }, { $lt: ['$otpLastFailedAt', cutoff] }] },
                1,
                { $add: [{ $ifNull: ['$otpFailedAttempts', 0] }, 1] },
              ],
            },
            otpLastFailedAt: now,
          },
        },
      ],
      { new: true, updatePipeline: true },
    );
    return user?.otpFailedAttempts ?? 0;
  }

  /**
   * Lock account until a specific time
   */
  async lockAccount(email: string, until: Date) {
    return User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { lockedUntil: until },
      { new: true }
    );
  }

  /**
   * Set the account-level status ('active' | 'suspended' | ...). issueSession
   * and /refresh refuse suspended/blocked users, so this gates every login door.
   */
  async setUserStatus(userId: string, status: 'active' | 'suspended' | 'blocked' | 'pending') {
    return User.findByIdAndUpdate(userId, { status }, { new: true });
  }

  /**
   * Update the account-level UI language preference ('ar' | 'en').
   * Panel i18n M1 task 2 — follows the user across devices instead of
   * living only in frontend localStorage.
   */
  async updateLanguage(userId: string, language: 'ar' | 'en') {
    return User.findByIdAndUpdate(userId, { language }, { new: true });
  }

  // ────────────────────────────────────────────────────────
  // OTP CODE QUERIES
  // ────────────────────────────────────────────────────────

  /**
   * Upsert OTP record for email+purpose.
   * Uses findOneAndUpdate with upsert: true to avoid race conditions.
   */
  async upsertOtp(data: {
    email: string;
    purpose: 'signup' | 'login' | 'reset';
    code: string;  // hashed code
    expiresAt: Date;
  }) {
    return OtpCode.findOneAndUpdate(
      { email: data.email.toLowerCase(), purpose: data.purpose },
      {
        code: data.code,
        expiresAt: data.expiresAt,
        attempts: 0,
      },
      { upsert: true, new: true }
    );
  }

  /**
   * Find a LIVE OTP by email and purpose with code field included.
   * Expiry is enforced here, not left to the Mongo TTL monitor (runs ~60s).
   */
  async findOtp(email: string, purpose: string) {
    return OtpCode.findOne({ email: email.toLowerCase(), purpose, expiresAt: { $gt: new Date() } }).select('+code');
  }

  /**
   * Atomically increment OTP verification attempts
   */
  async incrementOtpAttempts(otpId: string) {
    return OtpCode.findByIdAndUpdate(
      otpId,
      { $inc: { attempts: 1 } },
      { new: true }
    );
  }

  /**
   * Delete OTP after successful verification by email+purpose
   */
  async deleteOtp(email: string, purpose: string) {
    return OtpCode.findOneAndDelete({ email: email.toLowerCase(), purpose });
  }

  // ────────────────────────────────────────────────────────
  // SESSION QUERIES
  // ────────────────────────────────────────────────────────

  /**
   * Create a new session record
   */
  async createSession(data: {
    userId: string;
    refreshTokenHash: string;
    deviceInfo?: {
      userAgent?: string;
      ip?: string;
      platform?: string;
    };
    ipAddress: string;
    expiresAt: Date;
    rememberDevice?: boolean;
  }) {
    const session = new Session({
      userId: data.userId,
      refreshTokenHash: data.refreshTokenHash,
      deviceInfo: data.deviceInfo || {},
      ipAddress: data.ipAddress,
      expiresAt: data.expiresAt,
      isRevoked: false,
      rememberDevice: data.rememberDevice ?? true,
    });
    return session.save();
  }

  /**
   * Find session by refresh token hash
   */
  async findSession(refreshTokenHash: string) {
    return Session.findOne({
      refreshTokenHash,
      isRevoked: false,
      expiresAt: { $gt: new Date() },
    });
  }

  /**
   * True if the session exists, belongs to the user, is not revoked and has
   * not expired. Backs the per-request check in the authenticate middleware
   * (primary-key lookup, no document hydration).
   */
  async isSessionActive(sessionId: string, userId: string): Promise<boolean> {
    if (!mongoose.isValidObjectId(sessionId)) return false;
    return !!(await Session.exists({
      _id: sessionId,
      userId,
      isRevoked: false,
      expiresAt: { $gt: new Date() },
    }));
  }

  /**
   * Revoke a single session
   */
  async revokeSession(sessionId: string) {
    return Session.findByIdAndUpdate(
      sessionId,
      { isRevoked: true },
      { new: true }
    );
  }

  /**
   * Revoke all sessions for a user (logout all devices)
   */
  async revokeAllSessions(userId: string) {
    return Session.updateMany(
      { userId },
      { isRevoked: true }
    );
  }

  /**
   * Revoke every session for a user EXCEPT the caller's own, identified by
   * session id and/or refresh-token hash. Used by change-password (W2) —
   * rotating the password kills every OTHER device but not the one making the
   * change. With neither given, everything is revoked (safe default).
   */
  async revokeAllSessionsExcept(userId: string, except: { refreshTokenHash?: string; sessionId?: string } = {}) {
    const keep: Record<string, unknown>[] = [];
    if (except.refreshTokenHash) keep.push({ refreshTokenHash: except.refreshTokenHash });
    if (except.sessionId && mongoose.isValidObjectId(except.sessionId)) keep.push({ _id: except.sessionId });
    return Session.updateMany(
      { userId, ...(keep.length ? { $nor: keep } : {}) },
      { isRevoked: true }
    );
  }

  /**
   * Get all active sessions for a user (non-revoked, non-expired)
   */
  async getUserSessions(userId: string) {
    return Session.find({
      userId,
      isRevoked: false,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });
  }
}

export default new AuthRepository();