// ── Request DTOs ──────────────────────────────────

export interface SendOtpDTO {
  phone: string;
  purpose: 'signup' | 'login' | 'reset';
}

export interface VerifyOtpDTO {
  phone: string;
  code: string;
  purpose: 'signup' | 'login' | 'reset';
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
  phone: string;
  name?: string;
  role: string;
  isPhoneVerified: boolean;
  isProfileComplete: boolean;
  profileStep: string;
  language: string;
}