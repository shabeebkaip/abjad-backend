/**
 * Per-endpoint rate limiters for security
 * - OTP endpoints: Prevent email flood & brute force
 * - Refresh endpoint: Allow reasonable burst for token rotation
 * - Global: Catch-all for all API endpoints
 */

import rateLimit from 'express-rate-limit';

/**
 * OTP limiter: 5 requests per 10 minutes
 * Applied to: POST /auth/send-otp, POST /auth/verify-otp
 * Reason: Prevent email flood and brute force attacks
 */
export const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5,
  message: { success: false, message: 'Too many OTP requests' },
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
