// src/modules/auth/auth.controller.ts
// HTTP layer for auth — calls service, formats JSON response, calls next(error)
// Exported as singleton instance

import { Request, Response, NextFunction } from 'express';
import authService from './auth.service';
import { SendOtpDTO, VerifyOtpDTO } from './auth.types';
import { config } from '../../config';

class AuthController {
  async sendOtp(req: Request, res: Response, next: NextFunction) {
    try {
      const data: SendOtpDTO = req.body;
      await authService.sendOtp(data);
      res.status(200).json({ 
        success: true, 
        message: `OTP sent successfully to ${data.phone} for ${data.purpose}` 
      });
    } catch (error) {
      next(error);
    }
  }

  async verifyOtp(req: Request, res: Response, next: NextFunction) {
    try {
      const deviceInfo = {
        ...(req.body?.deviceInfo || {}),
        userAgent: req.get('user-agent') || req.body?.deviceInfo?.userAgent,
        ip: req.ip || req.body?.deviceInfo?.ip,
      };

      const data: VerifyOtpDTO = {
        ...req.body,
        deviceInfo,
      };
      const [authResponse, refreshToken] = await authService.verifyOtp(data);

      res.cookie(config.cookie.refreshTokenName, refreshToken, {
        httpOnly: config.cookie.httpOnly,
        secure: config.cookie.secure,
        sameSite: config.cookie.sameSite,
        maxAge: config.cookie.maxAge,
      });

      res.status(200).json({
        success: true,
        message: authResponse.isNewUser 
          ? 'Account created and verified successfully' 
          : 'OTP verified successfully',
        data: {
          user: authResponse.user,
          tokens: authResponse.tokens,
          isNewUser: authResponse.isNewUser,
          nextStep: authResponse.nextStep,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const refreshToken = req.cookies[config.cookie.refreshTokenName] || req.body.refreshToken;
      if (!refreshToken) {
        throw new Error('Refresh token is required');
      }

      const deviceInfo = {
        ...(req.body?.deviceInfo || {}),
        userAgent: req.get('user-agent') || req.body?.deviceInfo?.userAgent,
        ip: req.ip || req.body?.deviceInfo?.ip,
      };

      const { accessToken, refreshToken: newRefreshToken } = await authService.refreshTokens(refreshToken, deviceInfo);

      res.cookie(config.cookie.refreshTokenName, newRefreshToken, {
        httpOnly: config.cookie.httpOnly,
        secure: config.cookie.secure,
        sameSite: config.cookie.sameSite,
        maxAge: config.cookie.maxAge,
      });

      res.status(200).json({
        success: true,
        message: 'Access token refreshed successfully',
        data: { accessToken },
      });
    } catch (error) {
      next(error);
    }
  }

  async refreshTokens(req: Request, res: Response, next: NextFunction) {
    return this.refresh(req, res, next);
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const refreshToken = req.cookies[config.cookie.refreshTokenName] || req.body.refreshToken;
      if (refreshToken) {
        await authService.logout(refreshToken);
      }

      res.clearCookie(config.cookie.refreshTokenName, {
        httpOnly: true,
        secure: config.cookie.secure,
        sameSite: config.cookie.sameSite,
      });

      res.status(200).json({ 
        success: true, 
        message: 'Logged out successfully from current device' 
      });
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

      res.clearCookie(config.cookie.refreshTokenName, {
        httpOnly: true,
        secure: config.cookie.secure,
        sameSite: config.cookie.sameSite,
      });

      res.status(200).json({ success: true, message: 'Logged out from all devices' });
    } catch (error) {
      next(error);
    }
  }

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      res.status(200).json({
        success: true,
        message: 'User profile retrieved successfully',
        data: (req as any).user
      });
    } catch (error) {
      next(error);
    }
  }

  async sessions(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        throw new Error('User ID is required');
      }

      const activeSessions = await authService.getUserSessions(userId);
      res.status(200).json({
        success: true,
        message: `Retrieved ${activeSessions.length} active session(s)`,
        data: activeSessions
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new AuthController();