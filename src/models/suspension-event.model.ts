/**
 * SuspensionEvent — append-only history of every suspension or reinstatement
 * performed against a Teacher or School profile.
 *
 * Lives alongside (not inside) AuditLog because:
 *  - It has a *structured* reasonCode taxonomy that admins filter by
 *    ("show me everyone suspended for fraud_suspected this quarter").
 *  - It carries domain semantics — both the suspend AND the reinstate — that
 *    don't fit the action/diff shape of generic audit entries.
 *
 * Mutations still ALSO write an AuditLog entry for the same action, so the
 * audit trail remains the single source of "who did what when."
 */
import mongoose, { Document, Schema } from 'mongoose';

export type SuspensionTargetType = 'TeacherProfile' | 'SchoolProfile';

export type SuspensionAction = 'suspend' | 'reinstate';

export type SuspensionReasonCode =
  | 'policy_violation'
  | 'fraud_suspected'
  | 'duplicate_account'
  | 'harassment'
  | 'payment_issue'
  | 'user_request'
  | 'other';

export const SUSPENSION_REASONS: { value: SuspensionReasonCode; label: string }[] = [
  { value: 'policy_violation',   label: 'Policy violation'           },
  { value: 'fraud_suspected',    label: 'Fraud / fake credentials'   },
  { value: 'duplicate_account',  label: 'Duplicate account'          },
  { value: 'harassment',         label: 'Harassment / inappropriate' },
  { value: 'payment_issue',      label: 'Payment / billing dispute'  },
  { value: 'user_request',       label: 'At the user’s request'      },
  { value: 'other',              label: 'Other (see notes)'          },
];

export interface ISuspensionEvent extends Document {
  targetType: SuspensionTargetType;
  targetId: mongoose.Types.ObjectId;
  action: SuspensionAction;
  reasonCode: SuspensionReasonCode;
  reasonNotes?: string;
  actorUserId?: mongoose.Types.ObjectId;
  actorEmail?: string;
  /** Status BEFORE the action — lets reinstate restore the prior state. */
  priorStatus?: string;
  createdAt: Date;
}

const suspensionEventSchema = new Schema<ISuspensionEvent>(
  {
    targetType: { type: String, required: true, enum: ['TeacherProfile', 'SchoolProfile'] },
    targetId:   { type: Schema.Types.ObjectId, required: true },
    action:     { type: String, required: true, enum: ['suspend', 'reinstate'] },
    reasonCode: {
      type: String,
      required: true,
      enum: ['policy_violation','fraud_suspected','duplicate_account','harassment','payment_issue','user_request','other'],
    },
    reasonNotes: { type: String, maxlength: 1000 },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    actorEmail:  { type: String },
    priorStatus: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// History view by entity (the dominant query path)
suspensionEventSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
// Filter by reason code globally (for analytics / "all fraud cases")
suspensionEventSchema.index({ reasonCode: 1, createdAt: -1 });

// Append-only: like AuditLog, reject any post-creation mutation.
const APPEND_ONLY_MSG = 'SuspensionEvent is append-only — modification and deletion are prohibited.';
suspensionEventSchema.pre('save', function () {
  if (!this.isNew) throw new Error(APPEND_ONLY_MSG);
});
['updateOne','updateMany','findOneAndUpdate','findOneAndReplace',
 'deleteOne','deleteMany','findOneAndDelete'].forEach((hook) => {
  suspensionEventSchema.pre(hook as 'updateOne', function () { throw new Error(APPEND_ONLY_MSG); });
});

export const SuspensionEvent = mongoose.model<ISuspensionEvent>('SuspensionEvent', suspensionEventSchema);
