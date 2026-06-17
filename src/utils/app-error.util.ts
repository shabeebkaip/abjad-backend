/**
 * Custom error class for application-level errors
 * Extends Error with optional HTTP status code
 * Designed to work seamlessly with errorHandler middleware
 *
 * Usage:
 *   throw new AppError('User not found', 404);
 *   throw new AppError('Invalid credentials', 401);
 *   throw new AppError('Account locked', 429);
 *   throw new AppError('Validation failed'); // defaults to 400
 */
export class AppError extends Error {
  public statusCode: number;
  public name: string = 'AppError';
  // Optional structured payload merged into the JSON response by the error
  // handler. Used for cases where the client must branch on a machine-readable
  // code (entitlement blocked, validation hint, etc.) rather than parse the
  // free-text `message`.
  public details?: Record<string, unknown>;

  constructor(message: string, statusCode: number = 400, details?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;

    // Set prototype chain for instanceof checks
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /**
   * HTTP 402 Payment Required — used for entitlement gates so the frontend
   * can tell the difference between "bad request" and "this needs a paid
   * subscription". Always carries a details payload with at least a `code`.
   */
  static paymentRequired(
    message: string,
    details: { code: string; entitlement?: string; limit?: number | null; current?: number; audience?: 'school' | 'teacher_premium' },
  ) {
    return new AppError(message, 402, details as Record<string, unknown>);
  }

  /**
   * Static factory methods for common errors
   */
  static badRequest(message: string = 'Bad request') {
    return new AppError(message, 400);
  }

  static unauthorized(message: string = 'Unauthorized') {
    return new AppError(message, 401);
  }

  static forbidden(message: string = 'Forbidden') {
    return new AppError(message, 403);
  }

  static notFound(message: string = 'Not found') {
    return new AppError(message, 404);
  }

  static conflict(message: string = 'Conflict') {
    return new AppError(message, 409);
  }

  static tooManyRequests(message: string = 'Too many requests') {
    return new AppError(message, 429);
  }

  static internalError(message: string = 'Internal server error') {
    return new AppError(message, 500);
  }
}
