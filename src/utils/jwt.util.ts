import jwt from 'jsonwebtoken';
import crypto from 'crypto';  
import { config } from '../config';

export interface JwtPayload {
  userId: string;
  role: string;
  phone: string;
}

export const signAccessToken = (payload: JwtPayload): string =>
  jwt.sign(payload, config.jwt.accessSecret as string, {
    expiresIn: config.jwt.accessExpiresIn as string,
  } as jwt.SignOptions);

export const signRefreshToken = (payload: JwtPayload): string =>
  jwt.sign(payload, config.jwt.refreshSecret as string, {
    expiresIn: config.jwt.refreshExpiresIn as string,
  } as jwt.SignOptions);

export const verifyAccessToken = (token: string): JwtPayload =>
  jwt.verify(token, config.jwt.accessSecret) as JwtPayload;

export const verifyRefreshToken = (token: string): JwtPayload =>
  jwt.verify(token, config.jwt.refreshSecret) as JwtPayload;

// SHA-256 hash — used to store refresh token safely in DB
export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');