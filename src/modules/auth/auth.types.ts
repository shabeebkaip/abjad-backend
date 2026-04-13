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
  deviceInfo?: {
    userAgent?: string;
    ip?: string;
    platform?: string;
  };
}

export interface RefreshTokenDTO {
  refreshToken?: string;  // from cookie or body
}

export interface LogoutDTO {
  allDevices?: boolean;
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
  _id: string;
  email: string;
  name?: string;
  role: string;
  isEmailVerified: boolean;
  isProfileComplete: boolean;
  profileStep: string;
  language: string;
}