/**
 * QueueClaim — operational state for an entity sitting in the admin approval
 * queue. Decouples claim + snooze from the underlying entity (TeacherProfile,
 * SchoolProfile, Invoice, Ticket…) so we don't touch those collections every
 * time an admin parks an item.
 *
 * One row per (targetType, targetId). Created lazily — most rows in the queue
 * have no QueueClaim entry until someone claims or snoozes.
 */
import mongoose, { Document, Schema } from 'mongoose';

export type QueueTargetType =
  | 'TeacherProfile'
  | 'SchoolProfile'
  | 'Invoice'
  | 'Ticket';

export interface IQueueClaim extends Document {
  targetType: QueueTargetType;
  targetId: mongoose.Types.ObjectId;

  // Claim — admin "owns" this work item
  claimedBy?: mongoose.Types.ObjectId;
  claimedByEmail?: string;
  claimedAt?: Date;

  // Snooze — hide from default views until snoozedUntil
  snoozedUntil?: Date;
  snoozedReason?: string;
  snoozedBy?: mongoose.Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

const queueClaimSchema = new Schema<IQueueClaim>(
  {
    targetType: {
      type: String,
      required: true,
      enum: ['TeacherProfile', 'SchoolProfile', 'Invoice', 'Ticket'],
    },
    targetId: { type: Schema.Types.ObjectId, required: true },

    claimedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    claimedByEmail: { type: String },
    claimedAt: { type: Date },

    snoozedUntil: { type: Date },
    snoozedReason: { type: String, maxlength: 500 },
    snoozedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

// Exactly one row per target
queueClaimSchema.index({ targetType: 1, targetId: 1 }, { unique: true });
// Find claims by admin (drives "My queue" view)
queueClaimSchema.index({ claimedBy: 1 });
// Find active snoozes
queueClaimSchema.index({ snoozedUntil: 1 });

export const QueueClaim = mongoose.model<IQueueClaim>('QueueClaim', queueClaimSchema);
