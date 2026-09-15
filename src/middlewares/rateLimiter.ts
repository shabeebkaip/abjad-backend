/**
 * Per-endpoint rate limiters for security
 * - OTP endpoints: Prevent email flood & brute force
 * - Refresh endpoint: Allow reasonable burst for token rotation
 * - Global: Catch-all for all API endpoints
 */

import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

// Key OTP limiters by EMAIL, not IP. Schools/offices sit behind a single
// shared IP (NAT), so IP-keying lets one busy network exhaust the budget and
// lock out everyone else on it (Concern #6). The email is the resource being
// protected, so cap per-email. Fall back to IP only when the email is absent
// (malformed request). Gross cross-email abuse from one IP is still caught by
// the global 600/15min IP limiter in app.ts.
const emailKey = (req: Request): string => {
  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
  return email || req.ip || 'unknown';
};

/**
 * OTP limiter: 5 requests per 10 minutes PER EMAIL
 * Applied to: POST /auth/send-otp
 * Reason: Prevent email flood and brute force attacks
 */
export const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5,
  keyGenerator: emailKey,
  message: { success: false, message: 'Too many OTP requests' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (_req) => process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
});

/**
 * Verify-OTP limiter: 15 requests per 10 minutes
 * Applied to: POST /auth/verify-otp
 * Reason: A few mistyped codes shouldn't exhaust the send-otp budget.
 * Brute-forcing the code itself is separately protected by the
 * account-lockout logic in auth.service (per-user attempt counter).
 */
export const verifyOtpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 15,
  keyGenerator: emailKey, // per-email, not per-IP (shared-IP schools) — Concern #6
  message: { success: false, message: 'Too many verification attempts' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (_req) => process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
});

/**
 * Refresh limiter: 10 requests per 5 minutes
 * Applied to: POST /auth/refresh
 * Reason: Allow burst renewals (tab switching, app background/foreground)
 *         but prevent token farming attacks
 */
export const refreshLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10,
  message: { success: false, message: 'Too many refresh requests' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (_req) => process.env.NODE_ENV === 'test',
});

/**
 * Strict limiter for sensitive operations (future use)
 * Example: Password reset, account deletion
 */
export const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: { success: false, message: 'Too many attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
