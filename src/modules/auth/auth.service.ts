// src/modules/auth/auth.service.ts
// Business logic for auth — calls repository + utils, never touches HTTP
// Throws plain Error objects (caught by global error handler)
// Exported as singleton instance

import authRepository from './auth.repository';
import { SendOtpDTO, VerifyOtpDTO, AuthResponseDTO } from './auth.types';
import { config } from '../../config';
import { generateOtp, hashOtp, otpExpiry, verifyOtp as verifyOtpHash } from '../../utils/otp.util';
import { sendOtpSms } from '../../utils/otp-sender.util';
import { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken, JwtPayload } from '../../utils/jwt.util';

class AuthService {
  /**
   * Send OTP to user's phone
   * - Checks account lock status
   * - Generates + hashes OTP
   * - Stores in database (upsert to handle multiple requests)
   * - Delivers via SMS
   */
  async sendOtp(dto: SendOtpDTO): Promise<void> {
    const { phone, purpose } = dto;

    // Check if account is locked
    const user = await authRepository.findUserByPhone(phone);
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      throw new Error('Account locked. Try again later.');
    }

    // Generate + hash OTP
    const otp = generateOtp();
    const hash = await hashOtp(otp);
    const expiresAt = otpExpiry();

    // Upsert replaces any existing OTP for this phone+purpose
    // (handles race condition if multiple requests come in simultaneously)
    await authRepository.upsertOtp({
      phone,
      purpose,
      code: hash,
      expiresAt,
    });

    // Deliver OTP via SMS
    await sendOtpSms(phone, otp);
  }

  /**
   * Verify OTP and authenticate user
   * - Validates OTP code against stored hash
   * - Implements lockout logic on max failed attempts
   * - Creates user on signup, or finds existing user
   * - Issues access and refresh tokens
   * - Persists session in database
   * - Returns tuple: [authResponse, refreshToken] for controller to set cookie
   */
  async verifyOtp(dto: VerifyOtpDTO): Promise<[AuthResponseDTO, string]> {
    const { phone, code, purpose, deviceInfo } = dto;

    // 1. Find OTP record
    const otpRecord = await authRepository.findOtp(phone, purpose);
    if (!otpRecord) {
      throw new Error('OTP not found or expired');
    }

    // 2. Check max attempts — lock account if exceeded
    if (otpRecord.attempts >= config.otp.maxAttempts) {
      const lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      await authRepository.lockAccount(phone, lockUntil);
      throw new Error('Too many failed attempts. Account locked for 15 minutes.');
    }

    // 3. Verify OTP code against hash
    const valid = await verifyOtpHash(code, otpRecord.code);
    if (!valid) {
      // Increment failed attempts
      await authRepository.incrementOtpAttempts(otpRecord._id!);
      throw new Error('Invalid OTP');
    }

    // 4. Delete used OTP
    await authRepository.deleteOtp(phone, purpose);

    // 5. Find or create user
    let user = await authRepository.findUserByPhone(phone);
    const isNewUser = !user;

    if (!user) {
      // Create new user on signup
      user = await authRepository.createUser({
        phone,
        role: 'teacher', // default role
      });
    }

    // 6. Reset failed logins + update lastLoginAt
    await authRepository.resetFailedLogins(phone);
    await authRepository.updateLastLogin(user._id!.toString());

    // 7. Issue tokens
    const payload: JwtPayload = {
      userId: user._id!.toString(),
      role: user.role,
      phone,
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
      phone: user.phone,
      name: user.name,
      role: user.role,
      isPhoneVerified: user.isPhoneVerified,
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
  async refreshTokens(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    // 1. Verify JWT signature
    let payload: JwtPayload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (error) {
      throw new Error('Invalid or expired refresh token');
    }

    // 2. Find session by hash
    const hash = hashToken(refreshToken);
    const session = await authRepository.findSession(hash);

    if (!session) {
      // Token not in DB — possible reuse attack. Revoke ALL sessions for this user.
      await authRepository.revokeAllSessions(payload.userId);
      throw new Error('Refresh token reuse detected. All sessions revoked.');
    }

    if (session.isRevoked) {
      throw new Error('Session revoked');
    }

    // 3. Revoke old session
    await authRepository.revokeSession(session._id!);

    // 4. Issue new tokens
    const newPayload: JwtPayload = {
      userId: payload.userId,
      role: payload.role,
      phone: payload.phone,
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
      await authRepository.revokeSession(session._id!);
    }
  }

  /**
   * Logout all devices — revoke all sessions for a user
   */
  async logoutAll(userId: string): Promise<void> {
    await authRepository.revokeAllSessions(userId);
  }
}

export default new AuthService();