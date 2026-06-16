/**
 * Approval Queue (Mission Control) — Tier 1 #2.
 *
 * Unifies three pending streams into one priority-sorted list:
 *   - Teachers with profileStatus = 'pending'
 *   - Schools  with profileStatus = 'pending'
 *   - Invoices with status = 'pending' AND paymentMethod = 'bank_transfer'
 *
 * Priority is computed in-memory per request for Phase 1 (small N, < ~1k items).
 * Phase 3 will denormalise into a QueueIndex collection with a 60s cron.
 *
 * Tickets are deferred to Phase 2.
 */
import mongoose from 'mongoose';
import TeacherProfile, { ITeacherProfileDocument } from '../../models/teacher-profile.model';
import SchoolProfile, { ISchoolProfileDocument } from '../../models/school-profile.model';
import { Invoice, IInvoice } from '../../models/invoice.model';
import { QueueClaim, IQueueClaim, QueueTargetType } from '../../models/queue-claim.model';
import { AppError } from '../../utils/app-error.util';
import { halalaToSAR } from '../../utils/money.util';

// ─── Public types ─────────────────────────────────────────────────────────────

export type QueueItemType = 'teacher' | 'school' | 'billing';

export interface QueueItem {
  type: QueueItemType;
  id: string;                              // entity id (TeacherProfile._id / SchoolProfile._id / Invoice._id)
  ownerId?: string;                        // user id (for jump-to-user pages)
  label: string;                           // human-readable title
  sublabel?: string;                       // optional context line
  createdAt: string;                       // ISO
  ageHours: number;
  priority: number;                        // 0-100 (already computed; sort key)
  completion?: number;                     // profile completeness, 0-100
  amountSAR?: number;                      // for billing
  claimedBy?: string;
  claimedByEmail?: string;
  snoozedUntil?: string;
  // Type-specific extras (subjects, etc.) when useful for the row preview.
  meta?: Record<string, unknown>;
}

export interface QueueResponse {
  items: QueueItem[];
  counts: Record<QueueItemType, number>;
  total: number;
  meta: {
    slaAtRisk: number;
    breached: number;
  };
}

export interface QueueFilters {
  type?: QueueItemType | 'all';
  claimedBy?: string;
  view?: 'inbox' | 'mine' | 'snoozed' | 'sla_at_risk';
  search?: string;
  page?: number;
  limit?: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class QueueService {
  async list(filters: QueueFilters, viewerUserId: string): Promise<QueueResponse> {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 200);

    // 1. Fetch raw candidates from each source in parallel.
    const wantsTeacher = !filters.type || filters.type === 'all' || filters.type === 'teacher';
    const wantsSchool  = !filters.type || filters.type === 'all' || filters.type === 'school';
    const wantsBilling = !filters.type || filters.type === 'all' || filters.type === 'billing';

    const [teachers, schools, invoices] = await Promise.all([
      wantsTeacher
        ? TeacherProfile.find({ profileStatus: 'pending' }).limit(500).lean()
        : Promise.resolve([] as ITeacherProfileDocument[]),
      wantsSchool
        ? SchoolProfile.find({ profileStatus: 'pending' }).limit(500).lean()
        : Promise.resolve([] as ISchoolProfileDocument[]),
      wantsBilling
        ? Invoice.find({ status: 'pending', paymentMethod: 'bank_transfer' }).limit(500).lean()
        : Promise.resolve([] as IInvoice[]),
    ]);

    // 2. Load QueueClaim entries for the entire candidate set in one query.
    const allIds = [
      ...teachers.map((t) => t._id),
      ...schools.map((s) => s._id),
      ...invoices.map((i) => i._id),
    ];
    const claims = allIds.length > 0
      ? await QueueClaim.find({ targetId: { $in: allIds } }).lean()
      : [];
    const claimByKey = new Map<string, IQueueClaim>();
    for (const c of claims) {
      claimByKey.set(`${c.targetType}:${c.targetId.toString()}`, c as unknown as IQueueClaim);
    }

    // 3. Build heterogeneous items + compute priority.
    const items: QueueItem[] = [];

    for (const t of teachers) {
      items.push(buildTeacherItem(t as ITeacherProfileDocument, claimByKey));
    }
    for (const s of schools) {
      items.push(buildSchoolItem(s as ISchoolProfileDocument, claimByKey));
    }
    for (const i of invoices) {
      items.push(buildInvoiceItem(i as IInvoice, claimByKey));
    }

    // 4. Apply view filters that depend on viewer / claim state.
    const now = Date.now();
    let filtered = items.filter((it) => {
      // Hide snoozed items from default views (still visible in "Snoozed" view).
      const snoozed = it.snoozedUntil && new Date(it.snoozedUntil).getTime() > now;
      if (filters.view === 'snoozed') return !!snoozed;
      if (snoozed) return false;

      if (filters.view === 'mine') return it.claimedBy === viewerUserId;
      if (filters.view === 'sla_at_risk') return it.ageHours >= 24; // Phase-1 proxy until SLA is wired

      return true;
    });

    // 5. Optional search across label + sublabel.
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      filtered = filtered.filter((it) =>
        it.label.toLowerCase().includes(q) ||
        (it.sublabel?.toLowerCase().includes(q) ?? false),
      );
    }

    // 6. Apply priority boosts based on viewer identity.
    for (const it of filtered) {
      if (it.claimedBy === viewerUserId) it.priority = Math.min(100, it.priority + 20);
      else if (it.claimedBy) it.priority = Math.max(0, it.priority - 30);
    }

    // 7. Sort: priority desc, then age desc.
    filtered.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return b.ageHours - a.ageHours;
    });

    // 8. Counts (across the unfiltered pool but respecting type filter).
    const counts: Record<QueueItemType, number> = {
      teacher: items.filter((i) => i.type === 'teacher').length,
      school:  items.filter((i) => i.type === 'school').length,
      billing: items.filter((i) => i.type === 'billing').length,
    };

    // 9. Meta — SLA risk + breached (Phase-1 proxies: 24h = risk, 48h = breached).
    const meta = {
      slaAtRisk: items.filter((i) => i.ageHours >= 24 && i.ageHours < 48).length,
      breached:  items.filter((i) => i.ageHours >= 48).length,
    };

    // 10. Paginate the filtered+sorted list.
    const total = filtered.length;
    const start = (page - 1) * limit;
    const slice = filtered.slice(start, start + limit);

    return { items: slice, counts, total, meta };
  }

  /** POST /admin/queue/claim — assign an item to the calling admin. */
  async claim(params: {
    targetType: QueueTargetType;
    targetId: string;
    adminUserId: string;
    adminEmail?: string;
  }): Promise<IQueueClaim> {
    const updated = await QueueClaim.findOneAndUpdate(
      { targetType: params.targetType, targetId: new mongoose.Types.ObjectId(params.targetId) },
      {
        $set: {
          claimedBy: new mongoose.Types.ObjectId(params.adminUserId),
          claimedByEmail: params.adminEmail,
          claimedAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    if (!updated) throw AppError.internalError('Failed to claim queue item');
    return updated;
  }

  async unclaim(targetType: QueueTargetType, targetId: string): Promise<void> {
    await QueueClaim.updateOne(
      { targetType, targetId: new mongoose.Types.ObjectId(targetId) },
      { $unset: { claimedBy: 1, claimedByEmail: 1, claimedAt: 1 } },
    );
  }

  /** POST /admin/queue/snooze — hide an item until snoozedUntil. */
  async snooze(params: {
    targetType: QueueTargetType;
    targetId: string;
    snoozedUntil: Date;
    snoozedReason?: string;
    adminUserId: string;
  }): Promise<IQueueClaim> {
    if (params.snoozedUntil.getTime() <= Date.now()) {
      throw AppError.badRequest('snoozedUntil must be in the future');
    }
    const updated = await QueueClaim.findOneAndUpdate(
      { targetType: params.targetType, targetId: new mongoose.Types.ObjectId(params.targetId) },
      {
        $set: {
          snoozedUntil: params.snoozedUntil,
          snoozedReason: params.snoozedReason,
          snoozedBy: new mongoose.Types.ObjectId(params.adminUserId),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    if (!updated) throw AppError.internalError('Failed to snooze queue item');
    return updated;
  }

  async unsnooze(targetType: QueueTargetType, targetId: string): Promise<void> {
    await QueueClaim.updateOne(
      { targetType, targetId: new mongoose.Types.ObjectId(targetId) },
      { $unset: { snoozedUntil: 1, snoozedReason: 1, snoozedBy: 1 } },
    );
  }
}

// ─── Item builders ────────────────────────────────────────────────────────────

function buildTeacherItem(t: ITeacherProfileDocument, claimByKey: Map<string, IQueueClaim>): QueueItem {
  const id = (t._id as { toString(): string }).toString();
  const createdAt = readTimestamp(t);
  const ageHours = hoursSince(createdAt);
  const completion = t.completionPercentage ?? 0;
  const priority = computePriority({
    ageHours,
    completion,
    valueScore: 30,   // baseline; teachers don't yet have a "value" signal pre-approval
  });
  const claim = claimByKey.get(`TeacherProfile:${id}`);
  const fullName = t.personal?.fullNameEn ?? t.personal?.fullNameAr ?? 'Unnamed Teacher';
  const subjects = t.professional?.subjects?.slice(0, 3).join(', ');

  return {
    type: 'teacher',
    id,
    ownerId: t.userId.toString(),
    label: fullName,
    sublabel: [subjects, t.professional?.experienceRange ? `${t.professional.experienceRange}y` : null]
      .filter(Boolean)
      .join(' · '),
    createdAt: createdAt.toISOString(),
    ageHours,
    priority,
    completion,
    claimedBy: claim?.claimedBy?.toString(),
    claimedByEmail: claim?.claimedByEmail,
    snoozedUntil: claim?.snoozedUntil?.toISOString(),
    meta: {
      subjects: t.professional?.subjects ?? [],
      hasCV: !!t.resume?.fileUrl,
    },
  };
}

function buildSchoolItem(s: ISchoolProfileDocument, claimByKey: Map<string, IQueueClaim>): QueueItem {
  const id = (s._id as { toString(): string }).toString();
  const createdAt = readTimestamp(s);
  const ageHours = hoursSince(createdAt);
  const completion = s.completionPercentage ?? 0;
  const priority = computePriority({ ageHours, completion, valueScore: 30 });
  const claim = claimByKey.get(`SchoolProfile:${id}`);

  return {
    type: 'school',
    id,
    ownerId: s.userId.toString(),
    label: s.nameEn ?? s.nameAr ?? 'Unnamed School',
    sublabel: [s.type, s.city].filter(Boolean).join(' · '),
    createdAt: createdAt.toISOString(),
    ageHours,
    priority,
    completion,
    claimedBy: claim?.claimedBy?.toString(),
    claimedByEmail: claim?.claimedByEmail,
    snoozedUntil: claim?.snoozedUntil?.toISOString(),
    meta: {
      hasCommercialReg: !!s.documents?.commercialRegistration?.url,
      hasMinistryLicense: !!s.documents?.ministryLicense?.url,
    },
  };
}

function buildInvoiceItem(i: IInvoice, claimByKey: Map<string, IQueueClaim>): QueueItem {
  const id = (i._id as { toString(): string }).toString();
  const ageHours = hoursSince(i.createdAt);
  const amountSAR = halalaToSAR(i.totalHalala);
  // log10 keeps a 1k-SAR invoice from being crushed by a 100k-SAR one.
  const valueScore = Math.min(100, Math.log10(amountSAR + 1) * 25);
  const priority = computePriority({ ageHours, completion: 100, valueScore });
  const claim = claimByKey.get(`Invoice:${id}`);

  return {
    type: 'billing',
    id,
    ownerId: i.ownerId.toString(),
    label: i.number,
    sublabel: `${i.buyerName} · ${amountSAR.toLocaleString()} SAR`,
    createdAt: i.createdAt.toISOString(),
    ageHours,
    priority,
    amountSAR,
    claimedBy: claim?.claimedBy?.toString(),
    claimedByEmail: claim?.claimedByEmail,
    snoozedUntil: claim?.snoozedUntil?.toISOString(),
    meta: {
      buyerEmail: i.buyerEmail,
      method: i.paymentMethod,
    },
  };
}

// ─── Priority math ────────────────────────────────────────────────────────────

interface PriorityInput {
  ageHours: number;
  completion: number;    // 0-100
  valueScore: number;    // 0-100
}

function computePriority(p: PriorityInput): number {
  const ageScore = Math.min(100, (p.ageHours / 24) * 100);
  const score = (ageScore * 0.4) + (p.valueScore * 0.3) + (p.completion * 0.3);
  return Math.round(Math.max(0, Math.min(100, score)));
}

function hoursSince(d: Date): number {
  return (Date.now() - new Date(d).getTime()) / (1000 * 60 * 60);
}

/**
 * Mongoose's auto-`timestamps: true` adds createdAt/updatedAt at runtime but
 * doesn't surface them on every interface. Read defensively.
 */
function readTimestamp(doc: unknown): Date {
  const raw = (doc as { createdAt?: Date | string }).createdAt;
  if (raw instanceof Date) return raw;
  if (typeof raw === 'string') return new Date(raw);
  return new Date(0);
}

export const queueService = new QueueService();
