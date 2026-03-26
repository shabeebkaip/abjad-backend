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
      // Format Zod errors into readable field-specific messages
      const fieldErrors: Record<string, string> = {};
      const errorMessages: string[] = [];

      // Check if it's a Zod error
      if (error instanceof z.ZodError) {
        error.issues.forEach((issue: any) => {
          const field = issue.path?.[0] || 'unknown';
          const message = issue.message;
          
          // Store field-specific error
          fieldErrors[field] = message;
          
          // Create readable error message
          const capitalizedField = String(field).charAt(0).toUpperCase() + String(field).slice(1);
          errorMessages.push(`${capitalizedField}: ${message}`);
        });
      }

      res.status(400).json({
        success: false,
        message: 'Validation failed - please check your input',
        errors: errorMessages.length > 0 ? errorMessages : ['Invalid request data'],
        fieldErrors: fieldErrors,
      });
    }
  };
