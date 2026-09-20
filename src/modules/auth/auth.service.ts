// src/modules/auth/auth.service.ts
// Business logic for auth — calls repository + utils, never touches HTTP
// Throws AppError objects (caught by global error handler)
// Exported as singleton instance

import authRepository from './auth.repository';
import { SendOtpDTO, VerifyOtpDTO, AuthResponseDTO, LoginDTO, ResetPasswordDTO } from './auth.types';
import { config } from '../../config';
import { generateOtp, hashOtp, otpExpiry, verifyOtp as verifyOtpHash } from '../../utils/otp.util';
import { sendOtpEmail } from '../../utils/otp-sender.util';
import { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken, JwtPayload } from '../../utils/jwt.util';
import { hashPassword, comparePassword } from '../../utils/password.util';
import { AppError } from '../../utils/app-error.util';
import type { UserDocument } from '../../models/user.model';

class AuthService {
  // ── Shared helpers (task 1.2 — kills the OTP-vs-admin-login divergence) ──

  /**
   * Throws if the account is locked. Shared by sendOtp, verifyOtp, the new
   * password login, and password-reset — one lock, checked the same way
   * everywhere, so neither OTP nor password brute-force can bypass a lock
   * set by the other (DECISIONS LOCKED risk #2).
   */
  private assertAccountNotLocked(user: { lockedUntil?: Date } | null): void {
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      const lockExpiresIn = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw AppError.tooManyRequests(`Account temporarily locked due to too many failed attempts. Please try again in ${lockExpiresIn} minutes.`);
    }
  }

  /**
   * Verify an OTP code for email+purpose and consume it (delete on success).
   * Shared by verifyOtp (signup/login/reset-via-verify) and resetPassword —
   * same max-attempts lockout + increment behavior either way.
   */
  private async verifyAndConsumeOtp(email: string, purpose: 'signup' | 'login' | 'reset', code: string): Promise<void> {
    const otpRecord = await authRepository.findOtp(email, purpose);
    if (!otpRecord) {
      throw AppError.notFound(`No OTP found for ${email}. Please request a new OTP.`);
    }

    if (otpRecord.attempts >= config.otp.maxAttempts) {
      const lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      await authRepository.lockAccount(email, lockUntil);
      throw AppError.tooManyRequests(`Too many failed OTP verification attempts (${otpRecord.attempts}/${config.otp.maxAttempts}). Account locked for 15 minutes. Please try again later.`);
    }

    const valid = await verifyOtpHash(code, otpRecord.code);
    if (!valid) {
      await authRepository.incrementOtpAttempts(otpRecord._id!.toString());
      const remainingAttempts = config.otp.maxAttempts - (otpRecord.attempts + 1);
      throw AppError.unauthorized(`Invalid OTP code. You have ${remainingAttempts} attempt(s) remaining.`);
    }

    await authRepository.deleteOtp(email, purpose);
  }

  /**
   * Reset failed logins → update lastLogin → sign access+refresh → persist
   * session. The ONE code path behind OTP verify, the new password login,
   * AND admin login (admin.service.ts) — task 1.2. rememberDevice controls
   * both the refresh-token TTL and the cookie maxAge the controller applies;
   * admin login pins it to true (30d) via the param, preserving its existing
   * behavior unchanged.
   */
  async issueSession(
    user: Pick<UserDocument, 'email' | 'role'> & { _id?: unknown },
    opts: {
      rememberDevice?: boolean;
      deviceInfo?: { userAgent?: string; ip?: string; platform?: string };
      ipAddress?: string;
    } = {},
  ): Promise<{ accessToken: string; refreshToken: string; rememberDevice: boolean }> {
    const rememberDevice = opts.rememberDevice !== false;
    const userId = (user._id as { toString(): string }).toString();

    await authRepository.resetFailedLogins(user.email);
    await authRepository.updateLastLogin(userId);

    const payload: JwtPayload = { userId, role: user.role, email: user.email };
    const accessToken = signAccessToken(payload);
    const refreshTokenTtl = rememberDevice ? '30d' : '1d';
    const refreshToken = signRefreshToken(payload, refreshTokenTtl);

    const sessionTtlMs = rememberDevice ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + sessionTtlMs);
    await authRepository.createSession({
      userId,
      refreshTokenHash: hashToken(refreshToken),
      deviceInfo: opts.deviceInfo || {},
      ipAddress: opts.deviceInfo?.ip || opts.ipAddress || 'unknown',
      expiresAt,
      rememberDevice,
    });

    return { accessToken, refreshToken, rememberDevice };
  }

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
    this.assertAccountNotLocked(user);

    // Only signup may create a new account. login / reset for an unknown email
    // must be rejected here — otherwise the OTP flow proceeds and verifyOtp
    // would silently create a blank, nameless account (LOGIN-002).
    if (purpose !== 'signup' && !user) {
      throw AppError.notFound('No account found for this email. Please sign up first.');
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
  async verifyOtp(dto: VerifyOtpDTO): Promise<[AuthResponseDTO, string, boolean]> {
    const { email, code, purpose, deviceInfo } = dto;
    // SRD 2.1.2 — "Remember this device" defaults to true (30d). Unchecked → 1d session.
    const rememberDevice = dto.rememberDevice !== false;

    // 0. Check if ACCOUNT is locked (defensive — should also be blocked in sendOtp)
    let user = await authRepository.findUserByEmail(email);
    this.assertAccountNotLocked(user);

    // 1-4. Verify + consume the OTP (shared with resetPassword)
    await this.verifyAndConsumeOtp(email, purpose, code);

    // 5. Find or create user (user already fetched in step 0)
    const isNewUser = !user;

    if (!user) {
      // Defense in depth: only signup creates accounts. A login/reset that
      // reaches here with no user (e.g. a direct verify-otp API call that
      // bypassed sendOtp's guard) must NOT create a blank account.
      if (purpose !== 'signup') {
        throw AppError.notFound('No account found for this email. Please sign up first.');
      }
      // Password is required at signup (DECISIONS LOCKED #1); enforced by
      // verifyOtpSchema's superRefine, so dto.password is always present here.
      const passwordHash = dto.password ? await hashPassword(dto.password) : undefined;
      // Create new user on signup — persist name fields from registration form
      user = await authRepository.createUser({
        email,
        role: dto.role || 'teacher',
        firstName: dto.firstName,
        lastName: dto.lastName,
        // For school accounts: prefer schoolName; contactName is the admin's name
        schoolName: dto.schoolName,
        passwordHash,
      });
    } else if (purpose === 'signup' && dto.role && dto.role !== user.role) {
      // User already exists but re-registering with a different role — update role + names
      user = await authRepository.updateUserRole(email, dto.role, {
        firstName: dto.firstName,
        lastName: dto.lastName,
        schoolName: dto.schoolName,
      }) ?? user;
    }

    // 6-8. Reset failed attempts, update lastLogin, sign tokens, persist session
    const { accessToken, refreshToken, rememberDevice: rd } = await this.issueSession(user, { rememberDevice, deviceInfo });

    // Return tuple: [authResponse, refreshToken, rememberDevice]
    // Controller uses rememberDevice to decide cookie maxAge (persistent vs session)
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
      rd,
    ];
  }

  /**
   * Email + password login for teacher/school accounts (Milestone 1, task
   * 1.3). Admins are rejected here — they use POST /admin/auth/login, whose
   * service logic (admin.service.ts) shares this same issueSession() helper.
   * Every failure mode returns the SAME generic message (DECISIONS LOCKED #6
   * — no account-enumeration): unknown email, wrong password, and "no
   * password set yet" (OTP-only user) are indistinguishable to the caller.
   */
  async login(dto: LoginDTO): Promise<[AuthResponseDTO, string, boolean]> {
    const { email, password, rememberDevice, deviceInfo } = dto;
    const invalidCredentials = () => AppError.unauthorized('Invalid email or password');

    const user = await authRepository.findUserWithPassword(email);
    if (!user || user.role === 'admin') {
      // Unknown email AND admin accounts (wrong door) get the same generic
      // error — don't leak which case it was.
      throw invalidCredentials();
    }

    // Shared lock — 5 failed attempts of EITHER kind (OTP or password) locks
    // both methods for 15 min (DECISIONS LOCKED risk #2).
    this.assertAccountNotLocked(user);

    if (!user.password) {
      // OTP-only user — never reveal that no password is set.
      throw invalidCredentials();
    }

    const match = await comparePassword(password, user.password);
    if (!match) {
      await authRepository.incrementFailedLogins(email);
      throw invalidCredentials();
    }

    const { accessToken, refreshToken, rememberDevice: rd } = await this.issueSession(user, { rememberDevice, deviceInfo });

    return [
      {
        user: this.mapToAuthUserDTO(user),
        tokens: { accessToken, expiresIn: 900 },
        isNewUser: false,
      },
      refreshToken,
      rd,
    ];
  }

  /**
   * Set a password for a user who doesn't have one yet (OTP-only account).
   * Rejects if a password already exists — must use changePassword instead.
   */
  async setPassword(userId: string, newPassword: string): Promise<void> {
    const user = await authRepository.findUserByIdWithPassword(userId);
    if (!user) throw AppError.notFound('User not found');
    if (user.password) throw AppError.conflict('Password already set. Use change-password instead.');

    user.password = await hashPassword(newPassword);
    await user.save();
  }

  /**
   * Change an existing password — requires the correct current password.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await authRepository.findUserByIdWithPassword(userId);
    if (!user) throw AppError.notFound('User not found');
    if (!user.password) throw AppError.badRequest('No password set yet. Use set-password instead.');

    const match = await comparePassword(currentPassword, user.password);
    if (!match) throw AppError.unauthorized('Current password is incorrect');

    user.password = await hashPassword(newPassword);
    await user.save();
  }

  /**
   * Password reset — rides the existing OTP purpose:'reset' infra
   * (DECISIONS LOCKED #2, code-based). Same account-lock gate as every other
   * OTP purpose (assertAccountNotLocked, matching sendOtp) — an ACTIVELY
   * locked account can't reset either, it must wait out the 15 min like any
   * other OTP action. Once verified, also clears any lingering
   * failedLoginAttempts counter (e.g. left over from a lock that already
   * expired naturally) so the next login starts clean.
   */
  async resetPassword(dto: ResetPasswordDTO): Promise<void> {
    const { email, code, newPassword } = dto;

    const user = await authRepository.findUserByEmail(email);
    this.assertAccountNotLocked(user);

    await this.verifyAndConsumeOtp(email, 'reset', code);

    // send-otp already rejects 'reset' for unknown emails, but a direct API
    // call could bypass that (same defense-in-depth pattern as verifyOtp).
    if (!user) throw AppError.notFound('No account found for this email.');

    user.password = await hashPassword(newPassword);
    await user.save();
    await authRepository.resetFailedLogins(email);
  }

  /**
   * Map user document to AuthUserDTO
   */
  private mapToAuthUserDTO(user: any) {
    return {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      schoolName: user.schoolName,
      isEmailVerified: user.isEmailVerified,
      isProfileComplete: user.isProfileComplete,
      profileStep: user.profileStep,
      language: user.language,
    };
  }

  /**
   * Refresh tokens — idempotent, no rotation.
   * - Verifies refresh token signature
   * - Checks the session exists and isn't revoked
   * - Issues a new access token; the same refresh token is returned as-is
   */
  async refreshTokens(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; rememberDevice: boolean }> {
    // 1. Verify JWT signature
    let payload: JwtPayload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (error) {
      throw AppError.unauthorized('Refresh token is invalid or expired. Please login again.');
    }

    // 2. Find session by hash
    const hash = hashToken(refreshToken);
    const session = await authRepository.findSession(hash);

    if (!session || session.isRevoked) {
      throw AppError.unauthorized('Session not found or already revoked. Please login again.');
    }

    // 2b. Validate the user still exists and is active. JWT signature alone
    // isn't enough — the User row can have been deleted or suspended since
    // the token was minted.
    const user = await authRepository.findUserById(payload.userId);
    if (!user) {
      // Orphaned session — revoke it so the next request fails fast.
      await authRepository.revokeSession(session._id!.toString());
      throw AppError.unauthorized('User account no longer exists. Please sign in again.');
    }
    // Same policy as /me: only hard-block suspended / blocked. "pending" must
    // not gate auth — it's an admin workflow flag, not an email-verification
    // flag (OTP IS the verification).
    if (user.status === 'suspended' || user.status === 'blocked') {
      await authRepository.revokeSession(session._id!.toString());
      throw AppError.forbidden(`Account is ${user.status}.`);
    }

    // 3. Issue a new access token only — the session and refresh token stay put
    const rememberDevice = session.rememberDevice !== false;
    const newAccessToken = signAccessToken({
      userId: payload.userId,
      role: payload.role,
      email: payload.email,
    });

    return {
      accessToken: newAccessToken,
      refreshToken,
      rememberDevice,
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