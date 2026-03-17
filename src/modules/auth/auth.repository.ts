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
   * Find user by phone number
   */
  async findUserByPhone(phone: string) {
    return User.findOne({ phone });
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
    phone: string;
    role: 'teacher' | 'school' | 'admin';
    language?: string;
  }) {
    const user = new User({
      phone: data.phone,
      role: data.role || 'teacher',
      language: data.language || 'ar',
      isPhoneVerified: true,
      isActive: true,
      isProfileComplete: false,
      profileStep: 'basic',
      failedLoginAttempts: 0,
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
   * Atomically increment failed login attempts
   */
  async incrementFailedLogins(phone: string) {
    return User.findOneAndUpdate(
      { phone },
      { $inc: { failedLoginAttempts: 1 } },
      { new: true }
    );
  }

  /**
   * Reset failed login counter and clear lockout
   */
  async resetFailedLogins(phone: string) {
    return User.findOneAndUpdate(
      { phone },
      { failedLoginAttempts: 0, lockedUntil: null },
      { new: true }
    );
  }

  /**
   * Lock account until a specific time
   */
  async lockAccount(phone: string, until: Date) {
    return User.findOneAndUpdate(
      { phone },
      { lockedUntil: until },
      { new: true }
    );
  }

  // ────────────────────────────────────────────────────────
  // OTP CODE QUERIES
  // ────────────────────────────────────────────────────────

  /**
   * Upsert OTP record for phone+purpose.
   * Uses findOneAndUpdate with upsert: true to avoid race conditions.
   */
  async upsertOtp(data: {
    phone: string;
    purpose: 'signup' | 'login' | 'reset';
    code: string;  // hashed code
    expiresAt: Date;
  }) {
    return OtpCode.findOneAndUpdate(
      { phone: data.phone, purpose: data.purpose },
      {
        code: data.code,
        expiresAt: data.expiresAt,
        attempts: 0,
      },
      { upsert: true, new: true }
    );
  }

  /**
   * Find OTP by phone and purpose with code field included
   */
  async findOtp(phone: string, purpose: string) {
    return OtpCode.findOne({ phone, purpose }).select('+code');
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
   * Delete OTP after successful verification by phone+purpose
   */
  async deleteOtp(phone: string, purpose: string) {
    return OtpCode.findOneAndDelete({ phone, purpose });
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
    expiresAt: Date;
  }) {
    const session = new Session({
      userId: data.userId,
      refreshTokenHash: data.refreshTokenHash,
      deviceInfo: data.deviceInfo || {},
      expiresAt: data.expiresAt,
      isRevoked: false,
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