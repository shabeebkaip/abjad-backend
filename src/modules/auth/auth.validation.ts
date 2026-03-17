import { z } from 'zod';
import { validate } from '../../utils/validate.util';

// Saudi phone regex: +966XXXXXXXXX or 05XXXXXXXX
const phoneSchema = z.string().regex(
  /^(\+9665|05)\d{8}$/,
  'Invalid Saudi phone number'
);

// Request body schemas
export const sendOtpSchema = z.object({
  phone: phoneSchema,
  purpose: z.enum(['signup', 'login', 'reset']),
});

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: z.string().length(6, 'OTP must be 6 digits').regex(/^\d+$/, 'OTP must contain only digits'),
  purpose: z.enum(['signup', 'login', 'reset']),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required').optional(),
});

// Middleware validators
export const validateSendOtp = validate(sendOtpSchema);
export const validateVerifyOtp = validate(verifyOtpSchema);
export const validateRefreshToken = validate(refreshTokenSchema);