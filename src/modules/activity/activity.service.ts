import mongoose from 'mongoose';
import { AuditLog, IAuditLog } from '../../models/audit-log.model';

// Tier 3 #24 — Activity Stream + per-admin metrics.
// Builds on top of the AuditLog (Tier 1 #1) — we never write here, only read.
//
// Two surfaces:
//   1. stream() — newer-than cursor, designed for polling. Frontend passes
//      the last-seen timestamp on each tick and gets only the delta.
//   2. metrics() — aggregations for the leaderboard and category breakdown.

// ── Action taxonomy ──────────────────────────────────────────────────────
// Categories map the long-tail of audit actions onto a small set of
// human-meaningful buckets. Unknown actions fall into "other" so they
// still appear in the feed and totals.

export type ActivityCategory =
  | 'verification'  // teacher/school approve/reject/suspend, document review
  | 'support'       // tickets
  | 'billing'       // invoices, plans, subscriptions, payments
  | 'configuration' // wdrs, feature flags, email templates
  | 'content'       // jobs
  | 'auth'          // admin login/logout
  | 'other';

const CATEGORY_PREFIXES: Array<[ActivityCategory, RegExp]> = [
  ['verification',  /^(teacher|school|document)\./],
  ['support',       /^ticket\./],
  ['billing',       /^(invoice|plan|subscription|payment)\./],
  ['configuration', /^(wdrs|feature_flag|email_template)\./],
  ['content',       /^job\./],
  ['auth',          /^admin\./],
];

export function categoryOf(action: string): ActivityCategory {
  for (const [cat, re] of CATEGORY_PREFIXES) if (re.test(action)) return cat;
  return 'other';
}

// ── Stream ───────────────────────────────────────────────────────────────

export interface StreamEntry {
  _id: string;
  action: string;
  category: ActivityCategory;
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
  targetType: string;
  targetId?: string;
  targetLabel?: string;
  reason?: string;
  notes?: string;
  createdAt: string;
}

function decorate(e: IAuditLog): StreamEntry {
  return {
    _id: (e._id as { toString(): string }).toString(),
    action: e.action,
    category: categoryOf(e.action),
    actorId: e.actorId?.toString(),
    actorEmail: e.actorEmail,
    actorRole: e.actorRole,
    targetType: e.targetType,
    targetId: e.targetId?.toString(),
    targetLabel: e.targetLabel,
    reason: e.reason,
    notes: e.notes,
    createdAt: e.createdAt.toISOString(),
  };
}

export class ActivityService {
  // Used by the live feed. When `since` is given, returns only entries newer
  // than it (typical polling shape). Otherwise returns the most recent page.
  async stream(opts: {
    since?: Date;
    category?: ActivityCategory;
    actorId?: string;
    limit?: number;
  } = {}): Promise<{ entries: StreamEntry[]; latestAt: string | null }> {
    const limit = Math.min(opts.limit ?? 50, 200);
    const q: Record<string, unknown> = {};
    if (opts.since) q.createdAt = { $gt: opts.since };
    if (opts.actorId && mongoose.Types.ObjectId.isValid(opts.actorId)) {
      q.actorId = new mongoose.Types.ObjectId(opts.actorId);
    }

    // Category filter compiles into an action $regex OR. We could
    // pre-compute action lists, but the regex set is tiny.
    if (opts.category && opts.category !== 'other') {
      const prefix = CATEGORY_PREFIXES.find(([c]) => c === opts.category)?.[1];
      if (prefix) q.action = prefix;
    }

    const rows = await AuditLog.find(q)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<IAuditLog[]>();

    const entries = rows.map(decorate);
    const latestAt = entries[0]?.createdAt ?? null;
    return { entries, latestAt };
  }

  // ── Metrics ────────────────────────────────────────────────────────────

  async metrics(): Promise<{
    totals: { last24h: number; last7d: number; last30d: number };
    activeAdmins: { actorId: string; actorEmail: string; lastActionAt: string }[];
    topThisWeek: { actorId: string; actorEmail: string; count: number }[];
    byCategory: { category: ActivityCategory; count: number }[];
  }> {
    const now = Date.now();
    const since24h = new Date(now - 24  * 60 * 60 * 1000);
    const since7d  = new Date(now - 7   * 24 * 60 * 60 * 1000);
    const since30d = new Date(now - 30  * 24 * 60 * 60 * 1000);

    const [t24, t7d, t30d, active24, top7d, cats] = await Promise.all([
      AuditLog.countDocuments({ createdAt: { $gte: since24h } }),
      AuditLog.countDocuments({ createdAt: { $gte: since7d  } }),
      AuditLog.countDocuments({ createdAt: { $gte: since30d } }),

      // Active admins in the last 24h — one row per actor with their most
      // recent action time. Used to render the leaderboard's "online dots".
      AuditLog.aggregate<{ _id: mongoose.Types.ObjectId; actorEmail: string; lastActionAt: Date }>([
        { $match: { createdAt: { $gte: since24h }, actorId: { $ne: null } } },
        { $group: {
            _id: '$actorId',
            actorEmail: { $first: '$actorEmail' },
            lastActionAt: { $max: '$createdAt' },
          } },
        { $sort: { lastActionAt: -1 } },
        { $limit: 20 },
      ]),

      // Top admins by raw action count this week.
      AuditLog.aggregate<{ _id: mongoose.Types.ObjectId; actorEmail: string; count: number }>([
        { $match: { createdAt: { $gte: since7d }, actorId: { $ne: null } } },
        { $group: {
            _id: '$actorId',
            actorEmail: { $first: '$actorEmail' },
            count: { $sum: 1 },
          } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),

      // Category breakdown for the last 7d. We classify in JS afterwards
      // because the categoryOf() regex set isn't easy to express in Mongo.
      AuditLog.find({ createdAt: { $gte: since7d } }).select('action').lean<{ action: string }[]>(),
    ]);

    const categoryCounts = new Map<ActivityCategory, number>();
    for (const r of cats) {
      const c = categoryOf(r.action);
      categoryCounts.set(c, (categoryCounts.get(c) ?? 0) + 1);
    }
    const byCategory = Array.from(categoryCounts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    return {
      totals: { last24h: t24, last7d: t7d, last30d: t30d },
      activeAdmins: active24.map((a) => ({
        actorId: a._id.toString(),
        actorEmail: a.actorEmail ?? '—',
        lastActionAt: a.lastActionAt.toISOString(),
      })),
      topThisWeek: top7d.map((t) => ({
        actorId: t._id.toString(),
        actorEmail: t.actorEmail ?? '—',
        count: t.count,
      })),
      byCategory,
    };
  }
}

export const activityService = new ActivityService();
