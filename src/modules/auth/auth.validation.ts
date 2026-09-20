import { z } from 'zod';
import { validate } from '../../utils/validate.util';

// max(254) — RFC 5321 max email length. Bounds the input so a 5000+ char
// local-part can't reach the DB / bcrypt path (LOGIN-008).
const emailSchema = z.string().max(254, 'Email is too long').email('Invalid email address').toLowerCase();

// Request body schemas
export const sendOtpSchema = z.object({
  email: emailSchema,
  purpose: z.enum(['signup', 'login', 'reset']),
});

// ── Password rules (DECISIONS LOCKED #4, NIST 800-63B aligned) ──────
// min 8, max 128, no forced complexity/rotation, reject a common-password
// blocklist. Small, deliberately short list — not a full breach-corpus check
// (that would need an external service); covers the obvious top offenders.
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwerty123', 'qwertyuiop', 'letmein123', 'welcome123', 'admin12345', 'iloveyou1',
  'abc123456', '11111111', '00000000', 'passw0rd1', 'sunshine1', 'football1',
  'monkey1234', 'dragon1234', 'baseball1', 'princess1', 'trustno1x', 'starwars1',
  'changeme1', '87654321',
]);

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine((val) => !COMMON_PASSWORDS.has(val.toLowerCase()), {
    message: 'This password is too common. Please choose a stronger one.',
  });

export const verifyOtpSchema = z
  .object({
    email: emailSchema,
    code: z.string().length(6, 'OTP must be 6 digits').regex(/^\d+$/, 'OTP must contain only digits'),
    purpose: z.enum(['signup', 'login', 'reset']),
    role: z.enum(['teacher', 'school']).optional(),
    rememberDevice: z.boolean().optional(),
    // Registration fields passed through from the signup form (not stored on User — used to
    // populate profile on createUser). phone/city/subject/etc are intentionally omitted.
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    schoolName: z.string().optional(),
    contactName: z.string().optional(),
    // OPTIONAL for now — rollout decision 2026-09-20: DECISIONS LOCKED #1
    // wants password REQUIRED at signup, but the current register form
    // doesn't send one yet, so requiring it here would break prod signups.
    // If provided, it's still validated + stored; if absent, the account is
    // created OTP-only (same as any pre-existing OTP-only user) and can add
    // a password later via /auth/set-password.
    // TODO(M3): make signup password REQUIRED once the frontend register
    // form collects+sends it (DECISIONS LOCKED #1 — deferred for safe rollout).
    password: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.purpose !== 'signup') return;
    if (!data.password) return; // optional for now — see TODO(M3) above
    const result = passwordSchema.safeParse(data.password);
    if (!result.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['password'], message: result.error.issues[0].message });
    }
  });

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required').optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  // Deliberately not passwordSchema here — a previously-set password must
  // still authenticate even if it predates the blocklist/length rules.
  // Bounded to 128 chars so an oversized string can't reach bcrypt (mirrors
  // the LOGIN-008 email-length defense above).
  password: z.string().min(1, 'Password is required').max(128, 'Password is too long'),
  rememberDevice: z.boolean().optional(),
});

export const setPasswordSchema = z.object({
  newPassword: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

export const resetPasswordSchema = z.object({
  email: emailSchema,
  code: z.string().length(6, 'OTP must be 6 digits').regex(/^\d+$/, 'OTP must contain only digits'),
  newPassword: passwordSchema,
});

// Middleware validators
export const validateSendOtp = validate(sendOtpSchema);
export const validateVerifyOtp = validate(verifyOtpSchema);
export const validateRefreshToken = validate(refreshTokenSchema);
export const validateLogin = validate(loginSchema);
export const validateSetPassword = validate(setPasswordSchema);
export const validateChangePassword = validate(changePasswordSchema);
export const validateResetPassword = validate(resetPasswordSchema);