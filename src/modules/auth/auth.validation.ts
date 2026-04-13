import { z } from 'zod';
import { validate } from '../../utils/validate.util';

const emailSchema = z.string().email('Invalid email address').toLowerCase();

// Request body schemas
export const sendOtpSchema = z.object({
  email: emailSchema,
  purpose: z.enum(['signup', 'login', 'reset']),
});

export const verifyOtpSchema = z.object({
  email: emailSchema,
  code: z.string().length(6, 'OTP must be 6 digits').regex(/^\d+$/, 'OTP must contain only digits'),
  purpose: z.enum(['signup', 'login', 'reset']),
  role: z.enum(['teacher', 'school']).optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required').optional(),
});

// Middleware validators
export const validateSendOtp = validate(sendOtpSchema);
export const validateVerifyOtp = validate(verifyOtpSchema);
export const validateRefreshToken = validate(refreshTokenSchema);