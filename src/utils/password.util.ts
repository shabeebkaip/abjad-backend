import bcrypt from 'bcrypt';

// Same cost factor as OTP hashing (utils/otp.util.ts) and the existing admin
// password login (admin.service.ts) — one constant, reused everywhere a
// password/OTP gets hashed so a future cost bump is a one-line change.
const SALT_ROUNDS = 10;

export const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, SALT_ROUNDS);

export const comparePassword = (password: string, hash: string): Promise<boolean> => bcrypt.compare(password, hash);
