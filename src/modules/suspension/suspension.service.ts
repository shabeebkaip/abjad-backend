/**
 * Tier 1 #6 — Suspension module.
 *
 * Two domain concepts:
 *   - suspend(target, reason) — flips profileStatus to 'suspended'
 *   - reinstate(target)       — restores the status the target had BEFORE suspension
 *
 * Every mutation writes ONE SuspensionEvent (structured reasonCode) AND ONE
 * AuditLog entry (generic state-change ledger).
 */
import mongoose from 'mongoose';
import { adminRepository } from '../admin/admin.repository';
import { AppError } from '../../utils/app-error.util';
import {
  SuspensionEvent,
  SuspensionTargetType,
  SuspensionReasonCode,
  ISuspensionEvent,
} from '../../models/suspension-event.model';

const VALID_REASONS: SuspensionReasonCode[] = [
  'policy_violation','fraud_suspected','duplicate_account','harassment',
  'payment_issue','user_request','other',
];

function assertReason(code: unknown): SuspensionReasonCode {
  if (typeof code !== 'string' || !VALID_REASONS.includes(code as SuspensionReasonCode)) {
    throw AppError.badRequest(`reasonCode must be one of: ${VALID_REASONS.join(', ')}`);
  }
  return code as SuspensionReasonCode;
}

function assertNotes(reasonCode: SuspensionReasonCode, notes?: string) {
  if (reasonCode === 'other' && !notes?.trim()) {
    throw AppError.badRequest('Notes are required when reasonCode is "other"');
  }
  if (notes && notes.length > 1000) {
    throw AppError.badRequest('Notes must be 1000 characters or fewer');
  }
}

export interface SuspendInput {
  targetType: SuspensionTargetType;
  targetId: string;
  reasonCode: unknown;
  reasonNotes?: string;
  actorUserId?: string;
  actorEmail?: string;
}

export class SuspensionService {
  /**
   * Suspend a teacher or school. Stores the prior status on the event so a
   * future reinstate can restore it deterministically.
   */
  async suspend(input: SuspendInput): Promise<ISuspensionEvent> {
    const reasonCode = assertReason(input.reasonCode);
    assertNotes(reasonCode, input.reasonNotes);

    const profile = input.targetType === 'TeacherProfile'
      ? await adminRepository.getTeacherById(input.targetId)
      : await adminRepository.getSchoolById(input.targetId);
    if (!profile) throw AppError.notFound(`${input.targetType} not found`);

    if (profile.profileStatus === 'suspended') {
      throw AppError.badRequest('Profile is already suspended');
    }

    const priorStatus = profile.profileStatus;

    // Flip to suspended first; if the audit/event write fails the status will
    // still reflect reality (admins can re-suspend with a corrected event).
    if (input.targetType === 'TeacherProfile') {
      await adminRepository.setTeacherStatus(input.targetId, 'suspended');
    } else {
      await adminRepository.setSchoolStatus(input.targetId, 'suspended');
    }

    return SuspensionEvent.create({
      targetType: input.targetType,
      targetId: new mongoose.Types.ObjectId(input.targetId),
      action: 'suspend',
      reasonCode,
      reasonNotes: input.reasonNotes?.trim(),
      actorUserId: input.actorUserId ? new mongoose.Types.ObjectId(input.actorUserId) : undefined,
      actorEmail: input.actorEmail,
      priorStatus,
    });
  }

  /**
   * Reinstate a suspended profile. Restores `priorStatus` from the most-recent
   * suspend event; defaults to 'pending' if the event chain is missing
   * (shouldn't happen but keeps the operation safe).
   */
  async reinstate(input: SuspendInput): Promise<ISuspensionEvent> {
    const reasonCode = assertReason(input.reasonCode);
    assertNotes(reasonCode, input.reasonNotes);

    const profile = input.targetType === 'TeacherProfile'
      ? await adminRepository.getTeacherById(input.targetId)
      : await adminRepository.getSchoolById(input.targetId);
    if (!profile) throw AppError.notFound(`${input.targetType} not found`);

    if (profile.profileStatus !== 'suspended') {
      throw AppError.badRequest('Profile is not currently suspended');
    }

    const lastSuspend = await SuspensionEvent.findOne({
      targetType: input.targetType,
      targetId: input.targetId,
      action: 'suspend',
    }).sort({ createdAt: -1 }).lean();

    const restoredStatus = lastSuspend?.priorStatus ?? 'pending';

    if (input.targetType === 'TeacherProfile') {
      await adminRepository.setTeacherStatus(input.targetId, restoredStatus);
    } else {
      await adminRepository.setSchoolStatus(input.targetId, restoredStatus);
    }

    return SuspensionEvent.create({
      targetType: input.targetType,
      targetId: new mongoose.Types.ObjectId(input.targetId),
      action: 'reinstate',
      reasonCode,
      reasonNotes: input.reasonNotes?.trim(),
      actorUserId: input.actorUserId ? new mongoose.Types.ObjectId(input.actorUserId) : undefined,
      actorEmail: input.actorEmail,
      priorStatus: 'suspended',
    });
  }

  async history(targetType: SuspensionTargetType, targetId: string) {
    return SuspensionEvent.find({ targetType, targetId })
      .sort({ createdAt: -1 })
      .lean();
  }
}

export const suspensionService = new SuspensionService();
