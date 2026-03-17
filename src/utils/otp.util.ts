import bcrypt from 'bcrypt';  // already installed
import { randomInt } from 'crypto';
import { config } from '../config';

// Generate a random N-digit OTP string — cryptographically secure
export const generateOtp = (): string =>
  String(randomInt(100000, 999999));  // always 6 digits

// Hash OTP before storing (so plaintext is never in DB)
export const hashOtp = async (otp: string): Promise<string> =>
  bcrypt.hash(otp, 10);

// Compare incoming OTP against stored hash
export const verifyOtp = async (otp: string, hash: string): Promise<boolean> =>
  bcrypt.compare(otp, hash);

// OTP expiry timestamp helper
export const otpExpiry = (): Date => {
  const d = new Date();
  d.setMinutes(d.getMinutes() + config.otp.expiryMinutes);
  return d;
};