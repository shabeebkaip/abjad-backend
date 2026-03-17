// src/modules/auth/auth.controller.ts
// HTTP layer for auth — calls service, formats JSON response, calls next(error)
// Exported as singleton instance

import { Request, Response, NextFunction } from 'express';
import authService from './auth.service';
import { SendOtpDTO, VerifyOtpDTO } from './auth.types';

class AuthController {
  async sendOtp(req: Request, res: Response, next: NextFunction) {
    try {
      const data: SendOtpDTO = req.body;
      await authService.sendOtp(data);
      res.status(200).json({ message: 'OTP sent successfully' });
    } catch (error) {
      next(error);
    }
  }

  async verifyOtp(req: Request, res: Response, next: NextFunction) {
    try {
      const data: VerifyOtpDTO = req.body;
      const [authResponse, refreshToken] = await authService.verifyOtp(data);

      // Set refresh token as secure HTTP-only cookie
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      res.status(200).json(authResponse);
    } catch (error) {
      next(error);
    }
  }

  async refreshTokens(req: Request, res: Response, next: NextFunction) {
    try {
      const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
      if (!refreshToken) {
        throw new Error('Refresh token is required');
      }

      const { accessToken, refreshToken: newRefreshToken } = await authService.refreshTokens(refreshToken);

      // Update refresh token cookie
      res.cookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      res.status(200).json({ accessToken, expiresIn: 900 });
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
      if (refreshToken) {
        await authService.logout(refreshToken);
      }

      // Clear refresh token cookie
      res.clearCookie('refreshToken');
      res.status(200).json({ message: 'Logged out successfully' });
    } catch (error) {
      next(error);
    }
  }

  async logoutAll(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.userId; // from auth middleware
      if (!userId) {
        throw new Error('User ID is required');
      }

      await authService.logoutAll(userId);

      // Clear refresh token cookie
      res.clearCookie('refreshToken');
      res.status(200).json({ message: 'Logged out from all devices' });
    } catch (error) {
      next(error);
    }
  }
}

export default new AuthController();