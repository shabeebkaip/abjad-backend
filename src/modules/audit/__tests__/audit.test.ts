/**
 * Audit log — Tier 1 #1 tests.
 * Verifies append-only enforcement and query helpers.
 */
import mongoose from 'mongoose';
import { AuditLog } from '../../../models/audit-log.model';
import { auditService } from '../audit.service';

const ACTOR = { userId: new mongoose.Types.ObjectId().toString(), email: 'sara@abjad.test', role: 'admin' };

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    throw new Error('Mongo connection not initialised — check jest.setup.js');
  }
});

// Bypass the append-only hooks for test cleanup — the in-memory DB is
// ephemeral and we want a fresh slate per test. Production code does NOT
// have any backdoor; the .collection accessor is the explicit escape hatch.
beforeEach(async () => {
  await AuditLog.collection.deleteMany({});
});

describe('AuditLog model — append-only enforcement', () => {
  it('allows initial create', async () => {
    const e = await auditService.record({
      actor: ACTOR,
      action: 'teacher.approve',
      targetType: 'TeacherProfile',
      targetId: new mongoose.Types.ObjectId().toString(),
    });
    expect(e._id).toBeDefined();
    expect(e.action).toBe('teacher.approve');
  });

  it('rejects findOneAndUpdate', async () => {
    const e = await auditService.record({
      actor: ACTOR, action: 'teacher.approve',
      targetType: 'TeacherProfile', targetId: new mongoose.Types.ObjectId().toString(),
    });
    await expect(
      AuditLog.findOneAndUpdate({ _id: e._id }, { $set: { action: 'tampered' } }),
    ).rejects.toThrow(/append-only/i);
  });

  it('rejects updateOne', async () => {
    const e = await auditService.record({
      actor: ACTOR, action: 'school.approve',
      targetType: 'SchoolProfile', targetId: new mongoose.Types.ObjectId().toString(),
    });
    await expect(
      AuditLog.updateOne({ _id: e._id }, { $set: { reason: 'rewrite' } }),
    ).rejects.toThrow(/append-only/i);
  });

  it('rejects deleteOne', async () => {
    const e = await auditService.record({
      actor: ACTOR, action: 'teacher.delete',
      targetType: 'TeacherProfile', targetId: new mongoose.Types.ObjectId().toString(),
    });
    await expect(AuditLog.deleteOne({ _id: e._id })).rejects.toThrow(/append-only/i);
  });

  it('rejects document-level resave', async () => {
    const e = await auditService.record({
      actor: ACTOR, action: 'plan.update',
      targetType: 'PricingPlan', targetId: new mongoose.Types.ObjectId().toString(),
    });
    e.action = 'tampered';
    await expect(e.save()).rejects.toThrow(/append-only/i);
  });
});

describe('auditService.record — fields captured correctly', () => {
  it('stores actor + target + action + timestamp', async () => {
    const targetId = new mongoose.Types.ObjectId().toString();
    const e = await auditService.record({
      actor: ACTOR,
      action: 'teacher.approve',
      targetType: 'TeacherProfile',
      targetId,
      targetLabel: 'Ali Al-Mansour',
      notes: 'all docs ok',
    });
    expect(e.actorEmail).toBe('sara@abjad.test');
    expect(e.actorRole).toBe('admin');
    expect(e.targetLabel).toBe('Ali Al-Mansour');
    expect(e.notes).toBe('all docs ok');
    expect(e.createdAt).toBeInstanceOf(Date);
  });

  it('computes diff from before/after', async () => {
    const e = await auditService.record({
      actor: ACTOR,
      action: 'plan.update',
      targetType: 'PricingPlan',
      targetId: new mongoose.Types.ObjectId().toString(),
      before: { priceHalala: 130_000, isActive: true, nameEn: 'Old' },
      after:  { priceHalala: 150_000, isActive: true, nameEn: 'New' },
    });
    expect(e.diff).toEqual(expect.arrayContaining(['priceHalala', 'nameEn']));
    expect(e.diff).not.toContain('isActive');
  });

  it('skips diff when before/after are absent', async () => {
    const e = await auditService.record({
      actor: ACTOR, action: 'teacher.approve',
      targetType: 'TeacherProfile',
      targetId: new mongoose.Types.ObjectId().toString(),
    });
    // Mongoose array field defaults to []; either undefined or empty is correct.
    expect(e.diff ?? []).toEqual([]);
  });
});

describe('auditService.listForTarget', () => {
  it('returns entries scoped to the requested target, newest first', async () => {
    const t1 = new mongoose.Types.ObjectId().toString();
    const t2 = new mongoose.Types.ObjectId().toString();
    await auditService.record({ actor: ACTOR, action: 'teacher.approve', targetType: 'TeacherProfile', targetId: t1 });
    await new Promise((r) => setTimeout(r, 5));
    await auditService.record({ actor: ACTOR, action: 'teacher.reject',  targetType: 'TeacherProfile', targetId: t1, reason: 'Doc unclear' });
    await auditService.record({ actor: ACTOR, action: 'teacher.approve', targetType: 'TeacherProfile', targetId: t2 });

    const r = await auditService.listForTarget('TeacherProfile', t1);
    expect(r.total).toBe(2);
    expect(r.entries[0].action).toBe('teacher.reject');
    expect(r.entries[1].action).toBe('teacher.approve');
  });

  it('returns empty for unknown target', async () => {
    const r = await auditService.listForTarget('TeacherProfile', new mongoose.Types.ObjectId().toString());
    expect(r.total).toBe(0);
    expect(r.entries).toEqual([]);
  });
});

describe('auditService.listAll — filters', () => {
  beforeEach(async () => {
    await AuditLog.collection.deleteMany({});
    const t1 = new mongoose.Types.ObjectId().toString();
    const t2 = new mongoose.Types.ObjectId().toString();
    await auditService.record({ actor: ACTOR, action: 'teacher.approve', targetType: 'TeacherProfile', targetId: t1 });
    await auditService.record({ actor: ACTOR, action: 'school.approve',  targetType: 'SchoolProfile',  targetId: t2 });
    await auditService.record({ actor: ACTOR, action: 'plan.update',     targetType: 'PricingPlan',    targetId: new mongoose.Types.ObjectId().toString() });
  });

  it('filters by targetType', async () => {
    const r = await auditService.listAll({ targetType: 'TeacherProfile' });
    expect(r.total).toBe(1);
    expect(r.entries[0].action).toBe('teacher.approve');
  });

  it('filters by action', async () => {
    const r = await auditService.listAll({ action: 'plan.update' });
    expect(r.total).toBe(1);
  });

  it('filters by actorId', async () => {
    const r = await auditService.listAll({ actorId: ACTOR.userId });
    expect(r.total).toBe(3);
  });
});
