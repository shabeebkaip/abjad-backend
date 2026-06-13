// src/modules/auth/auth.controller.ts
// HTTP layer for auth — calls service, formats JSON response, calls next(error)
// Exported as singleton instance

import { Request, Response, NextFunction, CookieOptions } from 'express';
import authService from './auth.service';
import authRepository from './auth.repository';
import { SendOtpDTO, VerifyOtpDTO } from './auth.types';
import { config } from '../../config';

class AuthController {
  async sendOtp(req: Request, res: Response, next: NextFunction) {
    try {
      const data: SendOtpDTO = req.body;
      await authService.sendOtp(data);
      res.status(200).json({ 
        success: true, 
        message: `OTP sent successfully to ${data.email} for ${data.purpose}` 
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
      const [authResponse, refreshToken, rememberDevice] = await authService.verifyOtp(data);

      const cookieOptions: CookieOptions = {
        httpOnly: config.cookie.httpOnly,
        secure: config.cookie.secure,
        sameSite: config.cookie.sameSite,
      };
      // rememberDevice=true → persistent 30d cookie. false → session cookie (clears on browser close).
      if (rememberDevice) {
        cookieOptions.maxAge = config.cookie.maxAge;
      }
      res.cookie(config.cookie.refreshTokenName, refreshToken, cookieOptions);

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
      const refreshToken = req.cookies[config.cookie.refreshTokenName] || req.body?.refreshToken;
      if (!refreshToken) {
        res.status(400).json({ success: false, message: 'Refresh token is required' });
        return;
      }

      const deviceInfo = {
        ...(req.body?.deviceInfo || {}),
        userAgent: req.get('user-agent') || req.body?.deviceInfo?.userAgent,
        ip: req.ip || req.body?.deviceInfo?.ip,
      };

      const { accessToken, refreshToken: newRefreshToken, rememberDevice } =
        await authService.refreshTokens(refreshToken, deviceInfo);

      const cookieOptions: CookieOptions = {
        httpOnly: config.cookie.httpOnly,
        secure: config.cookie.secure,
        sameSite: config.cookie.sameSite,
      };
      if (rememberDevice) {
        cookieOptions.maxAge = config.cookie.maxAge;
      }
      res.cookie(config.cookie.refreshTokenName, newRefreshToken, cookieOptions);

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
      const refreshToken = req.cookies[config.cookie.refreshTokenName] || req.body?.refreshToken;
      if (refreshToken) {
        await authService.logout(refreshToken);
      }

      res.clearCookie(config.cookie.refreshTokenName, {
        httpOnly: true,
        secure: config.cookie.secure,
        sameSite: config.cookie.sameSite,
        path: config.cookie.path,
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
        path: config.cookie.path,
      });

      res.status(200).json({ success: true, message: 'Logged out from all devices' });
    } catch (error) {
      next(error);
    }
  }

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      const jwtUser = (req as any).user as { userId: string; email: string; role: string };

      const dbUser = await authRepository.findUserById(jwtUser.userId);

      // Strict mode — if the User row is gone but the JWT is still valid,
      // the session is effectively orphaned. Clear the cookie and return 401
      // so the client logs the user out cleanly instead of silently rendering
      // an empty page with the "Me" fallback.
      if (!dbUser) {
        res.clearCookie(config.cookie.refreshTokenName, {
          httpOnly: true,
          secure: config.cookie.secure,
          sameSite: config.cookie.sameSite,
          path: config.cookie.path,
        });
        res.status(401).json({ success: false, message: 'User account no longer exists. Please sign in again.' });
        return;
      }

      if (dbUser.status && dbUser.status !== 'active') {
        res.clearCookie(config.cookie.refreshTokenName, {
          httpOnly: true,
          secure: config.cookie.secure,
          sameSite: config.cookie.sameSite,
          path: config.cookie.path,
        });
        res.status(403).json({ success: false, message: `Account is ${dbUser.status}.` });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'User profile retrieved successfully',
        data: {
          userId: dbUser._id!.toString(),
          email: dbUser.email,
          role: dbUser.role,
          firstName: dbUser.firstName,
          lastName: dbUser.lastName,
          schoolName: dbUser.schoolName,
          isEmailVerified: dbUser.isEmailVerified ?? true,
          isProfileComplete: dbUser.isProfileComplete ?? false,
          profileStep: dbUser.profileStep ?? 'basic',
          language: dbUser.language ?? 'ar',
        },
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