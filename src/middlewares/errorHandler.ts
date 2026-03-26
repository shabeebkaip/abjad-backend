import { Response } from 'express';
import { AppError } from '../utils/app-error.util';

export const errorHandler = (err: any, _req: any, res: Response, _next: any) => {
  console.error('Error:', err);

  // Custom AppError
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation failed - please check your input',
      errors: Object.values(err.errors).map((e: any) => e.message),
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({
      success: false,
      message: `This ${field} is already registered. Please use a different one.`,
    });
  }

  // Mongoose cast error
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format provided',
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token - authentication failed',
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Your session has expired. Please login again.',
    });
  }

  // Default error (statusCode property or 500)
  return res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'An unexpected error occurred. Please try again.',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};
