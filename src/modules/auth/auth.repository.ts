// src/modules/auth/auth.repository.ts
// All DB queries for auth module — User, OtpCode, Session models only
// Exported as singleton instance

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
   * Create a new user on first signup
   */
  async createUser(data: {
    email: string;
    role: 'teacher' | 'school' | 'admin';
    firstName?: string;
    lastName?: string;
    schoolName?: string;
    language?: string;
  }) {
    const user = new User({
      email: data.email.toLowerCase(),
      role: data.role || 'teacher',
      firstName: data.firstName,
      lastName: data.lastName,
      schoolName: data.schoolName,
      language: data.language || 'ar',
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
   * Update a user's role (e.g. when re-registering with a different role)
   */
  async updateUserRole(
    email: string,
    role: 'teacher' | 'school' | 'admin',
    nameFields?: { firstName?: string; lastName?: string; schoolName?: string },
  ) {
    return User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { role, ...nameFields },
      { new: true }
    );
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
   * Atomically increment failed login attempts
   */
  async incrementFailedLogins(email: string) {
    return User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { $inc: { failedLoginAttempts: 1 } },
      { new: true }
    );
  }

  /**
   * Reset failed login counter and clear lockout
   */
  async resetFailedLogins(email: string) {
    return User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { failedLoginAttempts: 0, lockedUntil: null },
      { new: true }
    );
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
   * Find OTP by email and purpose with code field included
   */
  async findOtp(email: string, purpose: string) {
    return OtpCode.findOne({ email: email.toLowerCase(), purpose }).select('+code');
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