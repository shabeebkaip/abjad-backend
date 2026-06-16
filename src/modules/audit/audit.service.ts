/**
 * Audit log service — single entry point every admin-action codepath calls.
 *
 * Conventions:
 *  - The caller passes the actor (usually `req.user`) and the target.
 *  - `before` and `after` are optional snapshots; pass when the diff matters.
 *  - `diff` is derived automatically from before/after if both are present.
 *  - All writes are fire-and-forget at the call site (the service awaits but
 *    callers should not block their user-facing response on the audit write —
 *    use `void auditService.record(...)` if latency matters).
 */
import mongoose from 'mongoose';
import { Request } from 'express';
import { AuditLog, IAuditLog, AuditAction } from '../../models/audit-log.model';

export interface AuditActor {
  userId?: string;
  email?: string;
  role?: string;
}

export interface RecordParams {
  actor: AuditActor;
  action: AuditAction;
  targetType: string;
  targetId?: string;
  targetLabel?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  notes?: string;
  req?: Request;          // when provided, ip/userAgent/requestId are auto-captured
}

export class AuditService {
  async record(params: RecordParams): Promise<IAuditLog> {
    const ip = params.req
      ? (params.req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || params.req.ip || undefined)
      : undefined;
    const userAgent = params.req?.headers['user-agent']?.toString();
    const requestId = params.req?.requestId;

    const diff = computeDiff(params.before, params.after);

    return AuditLog.create({
      actorId: params.actor.userId ? new mongoose.Types.ObjectId(params.actor.userId) : undefined,
      actorEmail: params.actor.email,
      actorRole: params.actor.role,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId ? new mongoose.Types.ObjectId(params.targetId) : undefined,
      targetLabel: params.targetLabel,
      before: params.before,
      after: params.after,
      diff: diff.length > 0 ? diff : undefined,
      reason: params.reason,
      notes: params.notes,
      ip, userAgent, requestId,
    });
  }

  async listForTarget(
    targetType: string,
    targetId: string,
    opts: { page?: number; limit?: number } = {},
  ): Promise<{ entries: IAuditLog[]; total: number; page: number; totalPages: number }> {
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 50, 200);
    const q = { targetType, targetId: new mongoose.Types.ObjectId(targetId) };
    const [entries, total] = await Promise.all([
      AuditLog.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments(q),
    ]);
    return { entries: entries as IAuditLog[], total, page, totalPages: Math.ceil(total / limit) || 1 };
  }

  async listAll(opts: {
    actorId?: string;
    action?: string;
    targetType?: string;
    dateFrom?: Date;
    dateTo?: Date;
    page?: number;
    limit?: number;
  } = {}): Promise<{ entries: IAuditLog[]; total: number; page: number; totalPages: number }> {
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 50, 200);
    const q: Record<string, unknown> = {};
    if (opts.actorId) q.actorId = new mongoose.Types.ObjectId(opts.actorId);
    if (opts.action) q.action = opts.action;
    if (opts.targetType) q.targetType = opts.targetType;
    if (opts.dateFrom || opts.dateTo) {
      const range: Record<string, Date> = {};
      if (opts.dateFrom) range.$gte = opts.dateFrom;
      if (opts.dateTo)   range.$lte = opts.dateTo;
      q.createdAt = range;
    }
    const [entries, total] = await Promise.all([
      AuditLog.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments(q),
    ]);
    return { entries: entries as IAuditLog[], total, page, totalPages: Math.ceil(total / limit) || 1 };
  }
}

// ─── Diff helper ──────────────────────────────────────────────────────────────

function computeDiff(before: unknown, after: unknown): string[] {
  if (!isObject(before) || !isObject(after)) return [];
  const changed: string[] = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (JSON.stringify((before as Record<string, unknown>)[key]) !== JSON.stringify((after as Record<string, unknown>)[key])) {
      changed.push(key);
    }
  }
  return changed;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Convenience: build an AuditActor from the request's auth context.
 * Returns a minimal record when req.user is absent (e.g. webhook paths).
 */
export function actorFromRequest(req: Request): AuditActor {
  const u = (req as Request & { user?: { userId: string; role: string; email: string } }).user;
  return u ? { userId: u.userId, email: u.email, role: u.role } : {};
}

export const auditService = new AuditService();
