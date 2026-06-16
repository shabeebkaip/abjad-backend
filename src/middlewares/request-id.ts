/**
 * Request ID middleware — sets `req.requestId` so every log line and audit
 * entry can be correlated to a single inbound request.
 *
 * Honors an upstream `X-Request-ID` header if present (e.g. from a load balancer
 * or trace proxy); otherwise generates a fresh UUID. The id is echoed in the
 * response so the client can quote it when reporting an issue.
 */
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const id = (typeof incoming === 'string' && incoming.length > 0 && incoming.length < 100)
    ? incoming
    : randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
}
