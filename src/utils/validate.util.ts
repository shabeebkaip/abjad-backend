import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

/**
 * Higher-order function that creates a validation middleware.
 * Reusable across all modules to avoid duplicating try/catch patterns.
 *
 * @param schema - Zod schema to validate against
 * @returns Express middleware function
 */
export const validate = (schema: z.ZodSchema) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors || [],
      });
    }
  };
