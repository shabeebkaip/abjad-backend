/**
 * Append-only audit log for every state-changing admin action.
 *
 * Compliance posture (SOC2 / KSA PDPL):
 *   - Documents are written once, then immutable.
 *   - Pre-update / pre-delete middleware throws to prevent tampering.
 *   - Retention: 7 years (do not implement automatic deletion at the app layer;
 *     archive via a backup tier when storage volume warrants it).
 *
 * Shape is intentionally permissive — `before` / `after` are free-form so any
 * admin-facing service can record a snapshot without schema migrations.
 */
import mongoose, { Document, Schema } from 'mongoose';

export type AuditAction =
  // User management
  | 'teacher.approve'  | 'teacher.reject'  | 'teacher.suspend' | 'teacher.unsuspend' | 'teacher.delete'
  | 'school.approve'   | 'school.reject'   | 'school.suspend'  | 'school.unsuspend'  | 'school.delete'
  // Billing
  | 'invoice.mark_paid' | 'invoice.refund' | 'invoice.void'
  | 'plan.update'
  | 'subscription.cancel' | 'subscription.grandfather'
  // Configuration
  | 'wdrs.update' | 'feature_flag.toggle'
  // Support
  | 'ticket.reply' | 'ticket.status_change' | 'ticket.assign'
  // Content
  | 'job.moderate'
  | 'email_template.update' | 'email_template.reset'
  // Per-document review (Tier 2 #9)
  | 'document.approve' | 'document.reject' | 'document.reset'
  // Auth
  | 'admin.login' | 'admin.logout'
  // Catch-all
  | string;

export interface IAuditLog extends Document {
  // Actor snapshot — kept even if the admin user is later deleted.
  actorId?: mongoose.Types.ObjectId;
  actorEmail?: string;
  actorRole?: string;

  // What happened
  action: AuditAction;
  targetType: string;                  // 'TeacherProfile' | 'SchoolProfile' | 'Invoice' | ...
  targetId?: mongoose.Types.ObjectId;
  targetLabel?: string;                // human-readable snapshot — survives target deletion

  // What changed (optional; recorded when callers pass it)
  before?: unknown;
  after?: unknown;
  diff?: string[];                     // changed field paths — fast filter index

  // Admin-supplied context
  reason?: string;                     // e.g. "Document unclear"
  notes?: string;                      // free-text note

  // Request fingerprint
  ip?: string;
  userAgent?: string;
  requestId?: string;                  // X-Request-ID for log correlation

  createdAt: Date;
  updatedAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    actorEmail: { type: String },
    actorRole: { type: String },

    action: { type: String, required: true, index: true },
    targetType: { type: String, required: true },
    targetId: { type: Schema.Types.ObjectId },
    targetLabel: { type: String },

    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    diff: [{ type: String }],

    reason: { type: String, maxlength: 1000 },
    notes: { type: String, maxlength: 2000 },

    ip: { type: String },
    userAgent: { type: String },
    requestId: { type: String, index: true },
  },
  { timestamps: true },
);

// ─── Indexes — three primary query shapes ─────────────────────────────────────

// "Who did what to this entity, over time" — drives the per-entity audit drawer
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
// "What did this admin do" — drives per-admin activity views
auditLogSchema.index({ actorId: 1, createdAt: -1 });
// "Show me every X across the platform" — drives the global audit-log page
auditLogSchema.index({ action: 1, createdAt: -1 });
// Newest-first global timeline
auditLogSchema.index({ createdAt: -1 });

// ─── Append-only enforcement ──────────────────────────────────────────────────

// Reject any post-create mutation. The hooks must use `function` syntax to
// receive the Query / Document context Mongoose expects.
const APPEND_ONLY_MSG = 'AuditLog is append-only — entries cannot be modified or deleted';

auditLogSchema.pre('updateOne', function () { throw new Error(APPEND_ONLY_MSG); });
auditLogSchema.pre('updateMany', function () { throw new Error(APPEND_ONLY_MSG); });
auditLogSchema.pre('findOneAndUpdate', function () { throw new Error(APPEND_ONLY_MSG); });
auditLogSchema.pre('deleteOne', function () { throw new Error(APPEND_ONLY_MSG); });
auditLogSchema.pre('deleteMany', function () { throw new Error(APPEND_ONLY_MSG); });
auditLogSchema.pre('findOneAndDelete', function () { throw new Error(APPEND_ONLY_MSG); });
// Document-level guard: only allow the initial insert.
auditLogSchema.pre('save', function () {
  if (!this.isNew) throw new Error(APPEND_ONLY_MSG);
});

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);
