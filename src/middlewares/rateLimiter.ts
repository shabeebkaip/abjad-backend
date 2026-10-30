/**
 * Per-endpoint rate limiters for security
 * - OTP endpoints: Prevent email flood & brute force
 * - Refresh endpoint: Allow reasonable burst for token rotation
 * - Global: Catch-all for all API endpoints
 */

import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';
import crypto from 'crypto';
import { config } from '../config';
import type { AuthRequest } from './auth';

// Key OTP limiters by EMAIL, not IP. Schools/offices sit behind a single
// shared IP (NAT), so IP-keying lets one busy network exhaust the budget and
// lock out everyone else on it (Concern #6). The email is the resource being
// protected, so cap per-email. Fall back to IP only when the email is absent
// (malformed request). Gross cross-email abuse from one IP is still caught by
// the global 600/15min IP limiter in app.ts.
// The IP fallback MUST go through express-rate-limit's ipKeyGenerator —
// raw req.ip would group an entire IPv6 /64 (billions of addresses one
// residential customer can rotate through) as a single key, defeating the
// limiter, and the library warns loudly (ERR_ERL_KEY_GEN_IPV6) if you don't.
const emailKey = (req: Request): string => {
  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
  if (email) return email;
  return req.ip ? ipKeyGenerator(req.ip) : 'unknown';
};

// Client rollout override — testers on the prod-mode EC2 box kept getting
// locked out (e.g. strictLimiter's 3/hour/IP on their FIRST real reset-
// password attempt). Independent of NODE_ENV on purpose — they're testing
// WITH NODE_ENV=production, so gating this behind dev/test checks wouldn't
// reach them. Reversible: unset the env var and every limiter is back to
// normal with no code change. Also short-circuits the auth.service account
// lockout (see assertAccountNotLocked / verifyAndConsumeOtp / incrementFailedLogins).
// TODO(launch blocker): unset AUTH_THROTTLE_DISABLED before real production.
export const isAuthThrottleDisabled = (): boolean => process.env.AUTH_THROTTLE_DISABLED === 'true';

if (isAuthThrottleDisabled()) {
  // Loud on purpose, printed on every boot for as long as the flag is set.
  console.warn(
    '⚠️  AUTH_THROTTLE_DISABLED=true — all auth rate limits AND account lockouts are OFF. NEVER run this in real production. Unset before launch.',
  );
}

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
  skip: (_req) => isAuthThrottleDisabled() || process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
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
  skip: (_req) => isAuthThrottleDisabled() || process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
});

// Same token source the refresh controller reads (cookie, else body).
const refreshTokenOf = (req: Request): string | undefined =>
  req.cookies?.[config.cookie.refreshTokenName] || req.body?.refreshToken;

/**
 * Refresh limiter: 10 requests per 5 minutes PER SESSION
 * Applied to: POST /auth/refresh
 * Reason: Allow burst renewals (tab switching, app background/foreground)
 *         but prevent token farming attacks.
 * Keyed by a hash of the refresh token (never the raw token) so users behind
 * one NAT don't share a budget (B1). Calls without any token are skipped: they
 * can only ever get a cheap 400, and counting them let anonymous page loads
 * (/login, /register, marketing) burn the budget of real users on the same IP.
 * The global 600/15min IP limiter in app.ts still bounds them.
 */
export const refreshLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10,
  keyGenerator: (req) => {
    const token = refreshTokenOf(req);
    return token ? `rt:${crypto.createHash('sha256').update(token).digest('hex')}` : req.ip ? ipKeyGenerator(req.ip) : 'unknown';
  },
  message: { success: false, message: 'Too many refresh requests' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isAuthThrottleDisabled() || process.env.NODE_ENV === 'test' || !refreshTokenOf(req),
});

/**
 * Login limiter: 10 requests per 10 minutes PER EMAIL
 * Applied to: POST /auth/login (password login)
 * Reason: mirrors otpLimiter/verifyOtpLimiter's per-email keying — schools
 * share NAT IPs, so IP-keying would let one busy network's failures lock out
 * every other school on it. The per-user account lock (5 failed → 15min,
 * shared with OTP) is the primary brute-force defense; this is a secondary
 * ceiling against high-volume credential stuffing across many emails.
 */
export const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10,
  keyGenerator: emailKey,
  message: { success: false, message: 'Too many login attempts' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (_req) => isAuthThrottleDisabled() || process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
});

/**
 * Password-operation limiters (set / change / reset): 3 per hour PER ACCOUNT.
 * They sit AFTER validation in auth.routes so malformed requests don't spend
 * a slot. Business failures (wrong current password, wrong reset code) do
 * count — that is the brute-force cap we want.
 *
 * One instance (= one bucket) per endpoint, deliberately: a user who fat-
 * fingers their current password 3 times on change-password must still be
 * able to use the forgot-password recovery path.
 *
 * Keys: set/change -> authenticated user id (limiter runs after authenticate);
 * reset -> normalized email (no session yet). Both fall back to the IP key.
 * Per-account keying alone would let one IP spray many accounts, so
 * passwordIpLimiter adds a loose 30/hour per-IP backstop (shared across the
 * three endpoints; generous enough for a school NAT).
 */
const userKey = (req: Request): string => {
  const id = (req as AuthRequest).user?.userId;
  return id ? `u:${id}` : req.ip ? ipKeyGenerator(req.ip) : 'unknown';
};

const passwordAccountLimiter = (keyGenerator: (req: Request) => string) =>
  rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,
    keyGenerator,
    message: { success: false, message: 'Too many attempts. Try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (_req) => isAuthThrottleDisabled() || process.env.NODE_ENV === 'test',
  });

export const setPasswordLimiter = passwordAccountLimiter(userKey);
export const changePasswordLimiter = passwordAccountLimiter(userKey);
export const resetPasswordLimiter = passwordAccountLimiter(emailKey);

// NOT mounted yet: there is no 'trust proxy', so req.ip is the reverse proxy for
// everyone and this would be ONE platform-wide bucket. Mount it only after the
// real client IP is resolved (QA plan Wave 3).
export const passwordIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  keyGenerator: (req) => (req.ip ? ipKeyGenerator(req.ip) : 'unknown'),
  message: { success: false, message: 'Too many attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (_req) => isAuthThrottleDisabled() || process.env.NODE_ENV === 'test',
});
