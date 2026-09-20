// ── Request DTOs ──────────────────────────────────

export interface SendOtpDTO {
  email: string;
  purpose: 'signup' | 'login' | 'reset';
}

export interface VerifyOtpDTO {
  email: string;
  code: string;
  purpose: 'signup' | 'login' | 'reset';
  role?: 'teacher' | 'school';
  // Teacher registration fields
  firstName?: string;
  lastName?: string;
  // School registration fields
  schoolName?: string;
  contactName?: string;
  phone?: string;
  city?: string;
  schoolType?: string;
  deviceInfo?: {
    userAgent?: string;
    ip?: string;
    platform?: string;
  };
  rememberDevice?: boolean;
  // Required when purpose === 'signup' (DECISIONS LOCKED #1) — hashed before
  // being persisted via createUser. Validated by verifyOtpSchema's superRefine.
  password?: string;
}

export interface RefreshTokenDTO {
  refreshToken?: string;  // from cookie or body
}

export interface LogoutDTO {
  allDevices?: boolean;
}

// ── Password auth DTOs (Milestone 1) ──────────────

export interface LoginDTO {
  email: string;
  password: string;
  rememberDevice?: boolean;
  deviceInfo?: {
    userAgent?: string;
    ip?: string;
    platform?: string;
  };
}

export interface SetPasswordDTO {
  newPassword: string;
}

export interface ChangePasswordDTO {
  currentPassword: string;
  newPassword: string;
}

export interface ResetPasswordDTO {
  email: string;
  code: string;
  newPassword: string;
}

// ── Response DTOs ─────────────────────────────────

export interface AuthTokensDTO {
  accessToken: string;
  expiresIn: number;   // seconds
}

export interface AuthResponseDTO {
  user: AuthUserDTO;
  tokens: AuthTokensDTO;
  isNewUser: boolean;
  nextStep?: string;   // e.g. 'complete-profile'
}

export interface AuthUserDTO {
  userId: string;
  email: string;
  role: string;
  firstName?: string;
  lastName?: string;
  schoolName?: string;
  isEmailVerified: boolean;
  isProfileComplete: boolean;
  profileStep: string;
  language: string;
}