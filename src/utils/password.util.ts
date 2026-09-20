import bcrypt from 'bcrypt';

// Same cost factor as OTP hashing (utils/otp.util.ts) and the existing admin
// password login (admin.service.ts) — one constant, reused everywhere a
// password/OTP gets hashed so a future cost bump is a one-line change.
const SALT_ROUNDS = 10;

export const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, SALT_ROUNDS);

export const comparePassword = (password: string, hash: string): Promise<boolean> => bcrypt.compare(password, hash);

// W1 fix — timing-safe login. A fixed, pre-computed bcrypt hash (same cost
// factor as real password hashes) with no corresponding real password.
// auth.service.login() runs a real bcrypt.compare() against this on every
// early-return branch (unknown email / admin account / no password set) so
// those branches take the same ~cost-10-bcrypt latency as the wrong-password
// branch — closing a timing side-channel that would otherwise let an
// attacker distinguish "no such account" from "account exists" by response
// time alone. The plaintext behind this hash was never real and is discarded.
export const DUMMY_PASSWORD_HASH = '$2b$10$okyrA00KD1.HJEC1.j29UO5jvj2oICnaa46QnW./RRF1it0ZMkctu';
