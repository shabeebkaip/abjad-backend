import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt.util';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    phone: string;
    role: string;
  };
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Get access token from Authorization header only
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authorization token is required. Please provide a valid access token.',
      });
    }

    // Verify token (throws on invalid/expired)
    req.user = verifyAccessToken(token);
    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired access token. Please login again.',
    });
  }
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authorization token is required. Please provide a valid access token.',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Your role (${req.user.role}) does not have permission for this action. Required roles: ${roles.join(', ')}`,
      });
    }

    return next();
  };
};

/**
 * Middleware to require complete user profile
 * Checks isProfileComplete flag before allowing access to protected routes
 */
export const requireProfileComplete = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({
        success: false,
        message: 'Authorization token is required. Please provide a valid access token.',
      });
    }

    // Import here to avoid circular dependency
    // @ts-ignore
    const User = (await import('../models/user.model')).default;
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found. Please create a new account.',
      });
    }

    if (!user.isProfileComplete) {
      return res.status(403).json({
        success: false,
        message: 'Profile setup required. Please complete your profile information to continue.',
      });
    }

    return next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'An error occurred while verifying your profile status. Please try again.',
    });
  }
};
