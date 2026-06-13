import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';

// JWT issuer + audience — RFC 7519 standard claims. iss identifies who
// minted the token; aud identifies who's allowed to consume it. Both are
// validated on every verify so a token minted for one environment can't
// be replayed against another.
const JWT_ISSUER   = process.env.JWT_ISSUER   ?? 'abjad.sa';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'abjad-platform';

// Application-facing payload. The serialized token carries these fields
// plus the RFC 7519 standards (sub, iss, aud, iat, exp).
export interface JwtPayload {
  userId: string;
  role: string;
  email: string;
}

// Internal shape after decoding — split out so callers don't have to know
// about the standard claims.
interface DecodedToken extends JwtPayload {
  sub?: string;
  iss?: string;
  aud?: string;
  iat?: number;
  exp?: number;
}

function commonSignOptions(expiresIn: string): jwt.SignOptions {
  return {
    expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  };
}

function commonVerifyOptions(): jwt.VerifyOptions {
  return {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  };
}

export const signAccessToken = (payload: JwtPayload): string =>
  jwt.sign(
    payload,
    config.jwt.accessSecret as string,
    {
      ...commonSignOptions(config.jwt.accessExpiresIn as string),
      subject: payload.userId,
    },
  );

export const signRefreshToken = (payload: JwtPayload, expiresIn?: string): string =>
  jwt.sign(
    payload,
    config.jwt.refreshSecret as string,
    {
      ...commonSignOptions((expiresIn ?? config.jwt.refreshExpiresIn) as string),
      subject: payload.userId,
    },
  );

export const verifyAccessToken = (token: string): JwtPayload => {
  const decoded = jwt.verify(token, config.jwt.accessSecret, commonVerifyOptions()) as DecodedToken;
  return { userId: decoded.userId ?? decoded.sub!, role: decoded.role, email: decoded.email };
};

export const verifyRefreshToken = (token: string): JwtPayload => {
  const decoded = jwt.verify(token, config.jwt.refreshSecret, commonVerifyOptions()) as DecodedToken;
  return { userId: decoded.userId ?? decoded.sub!, role: decoded.role, email: decoded.email };
};

// SHA-256 hash — used to store refresh token safely in DB
export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');
