// src/modules/auth/auth.service.ts
// Business logic for auth — calls repository + utils, never touches HTTP
// Throws AppError objects (caught by global error handler)
// Exported as singleton instance

import authRepository from './auth.repository';
import { SendOtpDTO, VerifyOtpDTO, AuthResponseDTO } from './auth.types';
import { config } from '../../config';
import { generateOtp, hashOtp, otpExpiry, verifyOtp as verifyOtpHash } from '../../utils/otp.util';
import { sendOtpEmail } from '../../utils/otp-sender.util';
import { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken, JwtPayload } from '../../utils/jwt.util';
import { AppError } from '../../utils/app-error.util';

class AuthService {
  /**
   * Send OTP to user's email
   * - Checks account lock status (defensive)
   * - Generates + hashes OTP
   * - Stores in database (upsert to handle multiple requests)
   * - Delivers via Email
   */
  async sendOtp(dto: SendOtpDTO): Promise<void> {
    const { email, purpose } = dto;

    // Check if account is locked (defensive check)
    const user = await authRepository.findUserByEmail(email);
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      const lockExpiresIn = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw AppError.tooManyRequests(`Account temporarily locked due to too many failed attempts. Please try again in ${lockExpiresIn} minutes.`);
    }

    // Generate + hash OTP
    const otp = generateOtp();
    const hash = await hashOtp(otp);
    const expiresAt = otpExpiry();

    // Upsert replaces any existing OTP for this email+purpose
    // (handles race condition if multiple requests come in simultaneously)
    await authRepository.upsertOtp({
      email,
      purpose,
      code: hash,
      expiresAt,
    });

    // Deliver OTP via Email
    await sendOtpEmail(email, otp);
  }

  /**
   * Verify OTP and authenticate user
   * - Checks account lock status (defensive)
   * - Validates OTP code against stored hash
   * - Implements lockout logic on max failed attempts
   * - Creates user on signup, or finds existing user
   * - Issues access and refresh tokens
   * - Persists session in database
   * - Returns tuple: [authResponse, refreshToken] for controller to set cookie
   */
  async verifyOtp(dto: VerifyOtpDTO): Promise<[AuthResponseDTO, string]> {
    const { email, code, purpose, deviceInfo } = dto;

    // 0. Check if ACCOUNT is locked (defensive — should also be blocked in sendOtp)
    let user = await authRepository.findUserByEmail(email);
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      const lockExpiresIn = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw AppError.tooManyRequests(`Account temporarily locked due to too many failed attempts. Please try again in ${lockExpiresIn} minutes.`);
    }

    // 1. Find OTP record
    const otpRecord = await authRepository.findOtp(email, purpose);
    if (!otpRecord) {
      throw AppError.notFound(`No OTP found for ${email}. Please request a new OTP.`);
    }

    // 2. Check max OTP attempts — lock account if exceeded
    if (otpRecord.attempts >= config.otp.maxAttempts) {
      const lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      await authRepository.lockAccount(email, lockUntil);
      throw AppError.tooManyRequests(`Too many failed OTP verification attempts (${otpRecord.attempts}/${config.otp.maxAttempts}). Account locked for 15 minutes. Please try again later.`);
    }

    // 3. Verify OTP code against hash
    const valid = await verifyOtpHash(code, otpRecord.code);
    if (!valid) {
      // Increment OTP verification attempts (atomic $inc)
      await authRepository.incrementOtpAttempts(otpRecord._id!.toString());
      const remainingAttempts = config.otp.maxAttempts - (otpRecord.attempts + 1);
      throw AppError.unauthorized(`Invalid OTP code. You have ${remainingAttempts} attempt(s) remaining.`);
    }

    // 4. Delete used OTP (successful verification)
    await authRepository.deleteOtp(email, purpose);

    // 5. Find or create user (user already fetched in step 0)
    const isNewUser = !user;

    if (!user) {
      // Create new user on signup
      user = await authRepository.createUser({
        email,
        role: dto.role || 'teacher',
      });
    }

    // 6. Reset failed attempts + update lastLoginAt
    await authRepository.resetFailedLogins(email);
    await authRepository.updateLastLogin(user._id!.toString());

    // 7. Issue tokens
    const payload: JwtPayload = {
      userId: user._id!.toString(),
      role: user.role,
      email,
    };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    // 8. Persist session (store token hash, not raw token)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const refreshTokenHash = hashToken(refreshToken);
    await authRepository.createSession({
      userId: user._id!.toString(),
      refreshTokenHash,
      deviceInfo: deviceInfo || {},
      ipAddress: deviceInfo?.ip || 'unknown',
      expiresAt,
    });

    // Return tuple: [authResponse, refreshToken]
    // Controller destructures and sets refreshToken as secure cookie
    return [
      {
        user: this.mapToAuthUserDTO(user),
        tokens: {
          accessToken,
          expiresIn: 900, // 15 minutes
        },
        isNewUser,
        nextStep: isNewUser ? 'complete-profile' : undefined,
      },
      refreshToken,
    ];
  }

  /**
   * Map user document to AuthUserDTO
   */
  private mapToAuthUserDTO(user: any) {
    return {
      _id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      isProfileComplete: user.isProfileComplete,
      profileStep: user.profileStep,
      language: user.language,
    };
  }

  /**
   * Refresh tokens with reuse detection and rotation
   * - Verifies refresh token signature
   * - Checks if session exists (reuse detection)
   * - Revokes all sessions if reuse attack detected
   * - Revokes old session and issues new tokens
   * - Creates new session with new refresh token hash
   */
  async refreshTokens(refreshToken: string, _deviceInfo?: { userAgent?: string; ip?: string; platform?: string }): Promise<{ accessToken: string; refreshToken: string }> {
    // 1. Verify JWT signature
    let payload: JwtPayload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (error) {
      throw new Error('Refresh token is invalid or expired. Please login again.');
    }

    // 2. Find session by hash
    const hash = hashToken(refreshToken);
    const session = await authRepository.findSession(hash);

    if (!session) {
      // Token not in DB — possible reuse attack. Revoke ALL sessions for this user.
      await authRepository.revokeAllSessions(payload.userId);
      throw new Error('Potential security issue detected: Refresh token reuse detected. All your sessions have been revoked for security. Please login again.');
    }

    if (session.isRevoked) {
      throw new Error('Your session has been revoked. Please login again.');
    }

    // 3. Revoke old session
    await authRepository.revokeSession(session._id!.toString());

    // 4. Issue new tokens
    const newPayload: JwtPayload = {
      userId: payload.userId,
      role: payload.role,
      email: payload.email,
    };
    const newAccessToken = signAccessToken(newPayload);
    const newRefreshToken = signRefreshToken(newPayload);

    // 5. Create new session
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const newTokenHash = hashToken(newRefreshToken);
    await authRepository.createSession({
      userId: payload.userId,
      refreshTokenHash: newTokenHash,
      deviceInfo: session.deviceInfo,
      ipAddress: session.deviceInfo?.ip || session.ipAddress || 'unknown',
      expiresAt,
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Logout — revoke single session by refresh token
   */
  async logout(refreshToken: string): Promise<void> {
    const hash = hashToken(refreshToken);
    const session = await authRepository.findSession(hash);
    if (session) {
      await authRepository.revokeSession(session._id!.toString());
    }
  }

  /**
   * Logout all devices — revoke all sessions for a user
   */
  async logoutAll(userId: string): Promise<void> {
    await authRepository.revokeAllSessions(userId);
  }

  /**
   * Return active sessions for current user
   */
  async getUserSessions(userId: string) {
    return authRepository.getUserSessions(userId);
  }
}

export default new AuthService();