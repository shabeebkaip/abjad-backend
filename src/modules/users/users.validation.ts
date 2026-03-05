import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

const createUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['teacher', 'admin', 'student']).optional(),
  phoneNumber: z.string().optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  phoneNumber: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const validateCreateUser = (req: Request, res: Response, next: NextFunction) => {
  try {
    createUserSchema.parse(req.body);
    next();
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.errors,
    });
  }
};

export const validateUpdateUser = (req: Request, res: Response, next: NextFunction) => {
  try {
    updateUserSchema.parse(req.body);
    next();
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.errors,
    });
  }
};
