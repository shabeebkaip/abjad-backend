/**
 * WDRS (Weighted Dynamic Ranking Score) service.
 *
 * Computes a teacher's 0-100 score per SSD §1.2 (4-factor table, confirmed
 * 2026-06-17). The score itself is one input to candidate-search ordering;
 * the full ordering rule lives in `applyPremiumPoolOrdering()` below.
 *
 * Factors (all max values are admin-editable via WDRSConfig):
 *   1. Curriculum Experience — 35 pts
 *      - 5 pts per distinct curriculum taught (capped at curriculaMax * 5)
 *      - + experience-range bonus (0-1y: 0, 1-3y: 2, 3-5y: 5, 5-10y: 8, 10+y: 10)
 *      - Total capped at curriculumMax.
 *   2. Qualifications Count — 35 pts
 *      - Degree contribution (diploma: 5, bachelor: 10, master: 15, phd: 20)
 *      - + 3 pts per certification (capped at 15)
 *      - Total capped at qualificationsMax.
 *   3. Subscription Tier — 20 pts
 *      - Annual: 20, 6-Month: 14, Monthly: 8, None: 0 (configurable)
 *   4. Activity — 10 pts
 *      - Last login: <=24h: 5, <=7d: 3, <=30d: 1, else: 0
 *      - Response rate to interview invitations: >=80%: 5, 50-79%: 3, 20-49%: 1, else: 0
 *      - Total capped at activityMax.
 */
import crypto from 'crypto';
import { ITeacherProfile } from '../../models/teacher-profile.model';
import { ISubscription } from '../../models/subscription.model';
import { WDRSConfig, IWDRSConfig, DEFAULT_WDRS_CONFIG } from '../../models/wdrs-config.model';
import { FeatureFlag } from '../../models/feature-flag.model';
import TeacherProfile from '../../models/teacher-profile.model';

// SSD §1.3 activation gate — Teacher Premium isn't offered until this many
// approved teacher profiles exist on the platform.
export const PREMIUM_GATE_MIN_VERIFIED = 30;
export const PREMIUM_GATE_FLAG_KEY = 'teacher_premium_enabled';

/**
 * WDRS scoring only needs three sections of the teacher profile, so we accept
 * a structural type to avoid `_id` collisions between ITeacherProfile (string)
 * and ITeacherProfileDocument (ObjectId).
 */
export type TeacherForRanking = Pick<ITeacherProfile, 'professional' | 'education' | 'certifications'>;

// ─── Config loader (with a short in-memory cache) ─────────────────────────────

let _cached: { value: WDRSWeights; loadedAt: number } | null = null;
const CACHE_TTL_MS = 60_000; // 1 minute — admin edits propagate within a minute

export interface WDRSWeights {
  curriculumMax: number;
  qualificationsMax: number;
  subscriptionMax: number;
  activityMax: number;
  tierAnnual: number;
  tier6Month: number;
  tierMonthly: number;
  tierFree: number;
}

export async function getWDRSConfig(): Promise<WDRSWeights> {
  if (_cached && Date.now() - _cached.loadedAt < CACHE_TTL_MS) return _cached.value;
  const doc: IWDRSConfig | null = await WDRSConfig.findOne();
  const value: WDRSWeights = doc
    ? {
        curriculumMax: doc.curriculumMax,
        qualificationsMax: doc.qualificationsMax,
        subscriptionMax: doc.subscriptionMax,
        activityMax: doc.activityMax,
        tierAnnual: doc.tierAnnual,
        tier6Month: doc.tier6Month,
        tierMonthly: doc.tierMonthly,
        tierFree: doc.tierFree,
      }
    : { ...DEFAULT_WDRS_CONFIG };
  _cached = { value, loadedAt: Date.now() };
  return value;
}

/** Bust the cache after an admin write. Optional but cleaner than waiting 60s. */
export function invalidateWDRSConfigCache(): void {
  _cached = null;
}

// ─── Activity inputs (computed elsewhere; passed in here) ─────────────────────

export interface ActivitySignals {
  lastLoginAt?: Date;
  // Counts over the teacher's interview invitations history.
  invitationsReceived: number;
  invitationsAccepted: number;
}

// ─── Per-factor scoring (pure functions, easy to unit test) ───────────────────

export function scoreCurriculum(p: Partial<TeacherForRanking>, max: number): number {
  const curricula = p.professional?.curriculaTaught ?? [];
  const distinct = new Set(curricula).size;
  const curriculumPts = Math.min(distinct * 5, 25); // up to 25 from up to 5 curricula

  const range = p.professional?.experienceRange;
  const experiencePts =
    range === '10+' ? 10
    : range === '5-10' ? 8
    : range === '3-5' ? 5
    : range === '1-3' ? 2
    : 0;

  return Math.min(curriculumPts + experiencePts, max);
}

export function scoreQualifications(p: Partial<TeacherForRanking>, max: number): number {
  const degree = p.education?.degreeType;
  const degreePts =
    degree === 'phd' ? 20
    : degree === 'master' ? 15
    : degree === 'bachelor' ? 10
    : degree === 'diploma' ? 5
    : 0;

  const certCount = (p.certifications ?? []).length;
  const certPts = Math.min(certCount * 3, 15);

  return Math.min(degreePts + certPts, max);
}

export function scoreSubscriptionTier(sub: ISubscription | null, w: WDRSWeights): number {
  if (!sub) return w.tierFree;
  // Tier only counts when the subscription is providing real visibility — paid
  // periods or trial. Cancelled/expired contribute nothing.
  if (sub.status !== 'active' && sub.status !== 'trialing' && sub.status !== 'past_due') {
    return w.tierFree;
  }
  if (sub.durationMonths === 12) return w.tierAnnual;
  if (sub.durationMonths === 6) return w.tier6Month;
  if (sub.durationMonths === 1) return w.tierMonthly;
  return w.tierFree;
}

export function scoreActivity(signals: ActivitySignals, max: number): number {
  const now = Date.now();

  let recencyPts = 0;
  if (signals.lastLoginAt) {
    const ageMs = now - signals.lastLoginAt.getTime();
    const ONE_DAY = 24 * 60 * 60 * 1000;
    if (ageMs <= ONE_DAY) recencyPts = 5;
    else if (ageMs <= 7 * ONE_DAY) recencyPts = 3;
    else if (ageMs <= 30 * ONE_DAY) recencyPts = 1;
  }

  let responsePts = 0;
  if (signals.invitationsReceived > 0) {
    const rate = signals.invitationsAccepted / signals.invitationsReceived;
    if (rate >= 0.8) responsePts = 5;
    else if (rate >= 0.5) responsePts = 3;
    else if (rate >= 0.2) responsePts = 1;
  }

  return Math.min(recencyPts + responsePts, max);
}

// ─── Whole-score composer ─────────────────────────────────────────────────────

export interface WDRSBreakdown {
  curriculum: number;
  qualifications: number;
  subscription: number;
  activity: number;
  total: number;
}

export function computeWDRS(
  profile: Partial<TeacherForRanking>,
  subscription: ISubscription | null,
  activity: ActivitySignals,
  weights: WDRSWeights,
): WDRSBreakdown {
  const curriculum = scoreCurriculum(profile, weights.curriculumMax);
  const qualifications = scoreQualifications(profile, weights.qualificationsMax);
  const subscription_ = scoreSubscriptionTier(subscription, weights);
  const activity_ = scoreActivity(activity, weights.activityMax);
  return {
    curriculum,
    qualifications,
    subscription: subscription_,
    activity: activity_,
    total: curriculum + qualifications + subscription_ + activity_,
  };
}

// ─── Premium pool ordering ────────────────────────────────────────────────────

export interface RankableTeacher {
  teacherId: string;
  wdrs: number;
  isPremium: boolean;
}

/**
 * SSD §1.2 — Premium Pool ranks above the Standard pool. Within each pool, sort
 * by 5-point score band desc, then deterministic-daily shuffle within the band.
 *
 * The daily shuffle ensures fair exposure: two teachers with equal scores swap
 * positions each day without being random per-request (which would feel buggy).
 *
 * Pass `dateKey` (default: today UTC ISO date) so tests can fix the rotation.
 */
export function applyPremiumPoolOrdering<T extends RankableTeacher>(
  rows: T[],
  dateKey: string = todayUtcISO(),
): T[] {
  return [...rows].sort((a, b) => {
    // 1. Premium pool above standard.
    if (a.isPremium !== b.isPremium) return a.isPremium ? -1 : 1;

    // 2. 5-point band desc (so 87 and 84 are in the same band, 87 and 82 are not).
    const bandA = Math.floor(a.wdrs / 5);
    const bandB = Math.floor(b.wdrs / 5);
    if (bandA !== bandB) return bandB - bandA;

    // 3. Daily-rotating deterministic priority within the band — anti-monopoly rotation.
    const pA = dailyPriority(a.teacherId, dateKey, bandA);
    const pB = dailyPriority(b.teacherId, dateKey, bandA);
    return pB - pA;
  });
}

function dailyPriority(teacherId: string, dateKey: string, band: number): number {
  // SHA1 → first 6 hex chars → 24-bit integer. Stable per (id, date, band).
  const h = crypto.createHash('sha1')
    .update(`${teacherId}|${dateKey}|${band}`)
    .digest('hex')
    .slice(0, 6);
  return parseInt(h, 16);
}

function todayUtcISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Premium activation gate (SSD §1.3) ───────────────────────────────────────

/**
 * Returns true iff Teacher Premium is currently active platform-wide.
 *
 * Reads the `teacher_premium_enabled` FeatureFlag, which is auto-flipped to
 * true when the platform reaches PREMIUM_GATE_MIN_VERIFIED (30) approved
 * teacher profiles. Admin can also override manually.
 */
export async function isTeacherPremiumGateOpen(): Promise<boolean> {
  const flag = await FeatureFlag.findOne({ key: PREMIUM_GATE_FLAG_KEY });
  return flag?.value === true;
}

/**
 * Count approved teacher profiles and, if we've crossed the activation
 * threshold and the flag isn't already on, flip it on.
 *
 * Idempotent. Returns the current state for the caller's logs / response.
 * Intended to be called from the profile-approval flow (admin approves a
 * teacher → may push us across the line).
 */
export async function checkAndFlipPremiumGate(): Promise<{
  verifiedCount: number;
  isOpen: boolean;
  flippedNow: boolean;
}> {
  const verifiedCount = await TeacherProfile.countDocuments({ profileStatus: 'approved' });
  const flag = await FeatureFlag.findOne({ key: PREMIUM_GATE_FLAG_KEY });
  const isCurrentlyOpen = flag?.value === true;

  if (verifiedCount >= PREMIUM_GATE_MIN_VERIFIED && !isCurrentlyOpen) {
    await FeatureFlag.findOneAndUpdate(
      { key: PREMIUM_GATE_FLAG_KEY },
      {
        $set: { value: true },
        $setOnInsert: {
          description: `Teacher Premium activates at ${PREMIUM_GATE_MIN_VERIFIED}+ verified profiles (SSD §1.3).`,
        },
      },
      { upsert: true, new: true },
    );
    return { verifiedCount, isOpen: true, flippedNow: true };
  }
  return { verifiedCount, isOpen: isCurrentlyOpen, flippedNow: false };
}

/**
 * Admin override — manually set the gate. Use when you want to enable/disable
 * Premium independent of the verified-count threshold.
 */
export async function setPremiumGate(open: boolean, adminUserId?: string): Promise<void> {
  await FeatureFlag.findOneAndUpdate(
    { key: PREMIUM_GATE_FLAG_KEY },
    {
      $set: {
        value: open,
        ...(adminUserId ? { updatedBy: adminUserId } : {}),
      },
      $setOnInsert: {
        description: `Teacher Premium activation flag (SSD §1.3). Set manually by admin.`,
      },
    },
    { upsert: true, new: true },
  );
}
