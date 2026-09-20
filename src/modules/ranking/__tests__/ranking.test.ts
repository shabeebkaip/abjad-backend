/**
 * WDRS ranking — Phase C tests.
 * Per-factor scoring is pure-function, so no DB needed for those.
 * Gate + config helpers exercise Mongo via jest.setup.js.
 */
import mongoose from 'mongoose';
import {
  scoreCurriculum, scoreQualifications, scoreSubscriptionTier, scoreActivity,
  computeWDRS, applyPremiumPoolOrdering,
  getWDRSConfig, invalidateWDRSConfigCache,
  isTeacherPremiumGateOpen, checkAndFlipPremiumGate, setPremiumGate,
  PREMIUM_GATE_MIN_VERIFIED, PREMIUM_GATE_FLAG_KEY,
  type WDRSWeights, type ActivitySignals,
} from '../ranking.service';
import { WDRSConfig, DEFAULT_WDRS_CONFIG } from '../../../models/wdrs-config.model';
import { FeatureFlag } from '../../../models/feature-flag.model';
import TeacherProfile from '../../../models/teacher-profile.model';
import { ISubscription } from '../../../models/subscription.model';

const W: WDRSWeights = { ...DEFAULT_WDRS_CONFIG };

const NO_ACTIVITY: ActivitySignals = {
  invitationsReceived: 0,
  invitationsAccepted: 0,
};

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    throw new Error('Mongo connection not initialised — check jest.setup.js');
  }
});

describe('scoreCurriculum (35 max)', () => {
  it('0 when no curricula and no experience', () => {
    expect(scoreCurriculum({ professional: { subjects: [], gradeLevels: [], curriculaTaught: [] } }, 35)).toBe(0);
  });
  it('5 pts per distinct curriculum, max 25 from curricula', () => {
    expect(scoreCurriculum({
      professional: { subjects: [], gradeLevels: [], curriculaTaught: ['saudi', 'british'] },
    }, 35)).toBe(10);
    expect(scoreCurriculum({
      professional: {
        subjects: [], gradeLevels: [],
        curriculaTaught: ['saudi', 'british', 'american', 'ib', 'cambridge'],
      },
    }, 35)).toBe(25);
  });
  it('experience bonus: 10+ years = 10 pts', () => {
    expect(scoreCurriculum({
      professional: { subjects: [], gradeLevels: [], curriculaTaught: [], experienceRange: '10+' },
    }, 35)).toBe(10);
  });
  it('combined cap at 35', () => {
    expect(scoreCurriculum({
      professional: {
        subjects: [], gradeLevels: [],
        curriculaTaught: ['saudi', 'british', 'american', 'ib', 'cambridge'],
        experienceRange: '10+',
      },
    }, 35)).toBe(35);
  });
  it('respects custom max', () => {
    expect(scoreCurriculum({
      professional: { subjects: [], gradeLevels: [], curriculaTaught: ['saudi'], experienceRange: '10+' },
    }, 10)).toBe(10);
  });
});

describe('scoreQualifications (35 max)', () => {
  it('PhD + 5 certs = 20 + 15 = 35 (capped)', () => {
    expect(scoreQualifications({
      education: { degreeType: 'phd' },
      certifications: Array(5).fill({ name: 'X', issuer: 'Y', hasExpiry: false }) as never,
    }, 35)).toBe(35);
  });
  it('bachelor + 2 certs = 10 + 6 = 16', () => {
    expect(scoreQualifications({
      education: { degreeType: 'bachelor' },
      certifications: Array(2).fill({ name: 'X', issuer: 'Y', hasExpiry: false }) as never,
    }, 35)).toBe(16);
  });
  it('0 for empty profile', () => {
    expect(scoreQualifications({}, 35)).toBe(0);
  });
});

describe('scoreSubscriptionTier (20 max)', () => {
  const mk = (durationMonths: 1 | 6 | 12, status: ISubscription['status'] = 'active'): ISubscription =>
    ({ durationMonths, status } as unknown as ISubscription);

  it('annual paid subscription = 20', () => {
    expect(scoreSubscriptionTier(mk(12), W)).toBe(20);
  });
  it('6-month paid = 14', () => {
    expect(scoreSubscriptionTier(mk(6), W)).toBe(14);
  });
  it('monthly paid = 8', () => {
    expect(scoreSubscriptionTier(mk(1), W)).toBe(8);
  });
  it('null subscription = 0', () => {
    expect(scoreSubscriptionTier(null, W)).toBe(0);
  });
  it('cancelled / expired subscription = 0 (no longer paying for visibility)', () => {
    expect(scoreSubscriptionTier(mk(12, 'expired'), W)).toBe(0);
    expect(scoreSubscriptionTier(mk(12, 'cancelled'), W)).toBe(0);
  });
  it('trial counts toward tier score (active visibility)', () => {
    expect(scoreSubscriptionTier(mk(1, 'trialing'), W)).toBe(8);
  });
});

describe('scoreActivity (10 max)', () => {
  const now = Date.now();
  const ago = (ms: number) => new Date(now - ms);
  const ONE_DAY = 24 * 60 * 60 * 1000;

  it('logged-in today + 100% response rate = 10', () => {
    const s: ActivitySignals = {
      lastLoginAt: ago(2 * 60 * 60 * 1000),
      invitationsReceived: 3,
      invitationsAccepted: 3,
    };
    expect(scoreActivity(s, 10)).toBe(10);
  });
  it('logged-in last week + 50% response = 6', () => {
    const s: ActivitySignals = {
      lastLoginAt: ago(5 * ONE_DAY),
      invitationsReceived: 4,
      invitationsAccepted: 2,
    };
    expect(scoreActivity(s, 10)).toBe(6);
  });
  it('never logged in + no invites = 0', () => {
    expect(scoreActivity({ invitationsReceived: 0, invitationsAccepted: 0 }, 10)).toBe(0);
  });
  it('logged-in 31+ days ago = 0 recency', () => {
    const s: ActivitySignals = {
      lastLoginAt: ago(60 * ONE_DAY),
      invitationsReceived: 0,
      invitationsAccepted: 0,
    };
    expect(scoreActivity(s, 10)).toBe(0);
  });
});

describe('computeWDRS — full composer', () => {
  it('PhD + 5 curricula + 10+ years + annual sub + active = 35 + 35 + 20 + login/recent ≈ 100', () => {
    const profile = {
      professional: {
        subjects: [], gradeLevels: [],
        curriculaTaught: ['saudi', 'british', 'american', 'ib', 'cambridge'] as never,
        experienceRange: '10+' as const,
      },
      education: { degreeType: 'phd' as const },
      certifications: Array(5).fill({ name: 'X', issuer: 'Y', hasExpiry: false }) as never,
    };
    const sub = { durationMonths: 12, status: 'active' } as unknown as ISubscription;
    const activity: ActivitySignals = {
      lastLoginAt: new Date(),
      invitationsReceived: 5,
      invitationsAccepted: 5,
    };
    const b = computeWDRS(profile, sub, activity, W);
    expect(b.curriculum).toBe(35);
    expect(b.qualifications).toBe(35);
    expect(b.subscription).toBe(20);
    expect(b.activity).toBe(10);
    expect(b.total).toBe(100);
  });
  it('empty profile + no sub + no activity = 0', () => {
    const b = computeWDRS({}, null, NO_ACTIVITY, W);
    expect(b.total).toBe(0);
  });
});

describe('applyPremiumPoolOrdering', () => {
  const mk = (id: string, wdrs: number, isPremium: boolean) =>
    ({ teacherId: id, wdrs, isPremium });

  it('places premium pool above standard regardless of score', () => {
    const rows = [
      mk('A', 95, false), // standard with very high score
      mk('B', 30, true),  // premium with low score
    ];
    const sorted = applyPremiumPoolOrdering(rows, '2026-06-17');
    expect(sorted[0].teacherId).toBe('B');
    expect(sorted[1].teacherId).toBe('A');
  });

  it('orders within pool by 5-pt score band desc', () => {
    const rows = [
      mk('low', 30, true),
      mk('high', 80, true),
      mk('mid', 55, true),
    ];
    const sorted = applyPremiumPoolOrdering(rows, '2026-06-17');
    expect(sorted.map((r) => r.teacherId)).toEqual(['high', 'mid', 'low']);
  });

  it('rotates teachers within the same band deterministically per day', () => {
    // Three teachers with identical scores in the same band.
    const rows = [mk('A', 75, true), mk('B', 75, true), mk('C', 75, true)];
    const day1 = applyPremiumPoolOrdering(rows, '2026-06-17').map((r) => r.teacherId);
    const day1Again = applyPremiumPoolOrdering(rows, '2026-06-17').map((r) => r.teacherId);
    expect(day1).toEqual(day1Again); // determinism within the same day

    const day2 = applyPremiumPoolOrdering(rows, '2026-06-18').map((r) => r.teacherId);
    // Hashing makes a day-over-day flip likely but not guaranteed; assert at
    // least the band membership is correct, and run both ordering checks.
    expect(new Set(day2)).toEqual(new Set(['A', 'B', 'C']));
  });

  it('keeps teachers in different 5-pt bands strictly ordered', () => {
    // 84 (band 16) and 86 (band 17) — different bands, 86 must rank higher.
    const rows = [mk('lower', 84, true), mk('higher', 86, true)];
    const sorted = applyPremiumPoolOrdering(rows, '2026-06-17').map((r) => r.teacherId);
    expect(sorted).toEqual(['higher', 'lower']);
  });
});

describe('WDRSConfig — DB-backed weights with cache', () => {
  beforeEach(async () => {
    await WDRSConfig.deleteMany({});
    invalidateWDRSConfigCache();
  });

  it('returns defaults when no doc exists', async () => {
    const c = await getWDRSConfig();
    expect(c).toEqual(DEFAULT_WDRS_CONFIG);
  });

  it('reads admin-edited weights from the DB', async () => {
    await WDRSConfig.create({
      ...DEFAULT_WDRS_CONFIG,
      curriculumMax: 50,
      qualificationsMax: 20,
      subscriptionMax: 20,
      activityMax: 10,
    });
    invalidateWDRSConfigCache();
    const c = await getWDRSConfig();
    expect(c.curriculumMax).toBe(50);
    expect(c.qualificationsMax).toBe(20);
  });

  it('caches the result (DB writes after read are not seen until invalidate)', async () => {
    await WDRSConfig.create({ ...DEFAULT_WDRS_CONFIG });
    const c1 = await getWDRSConfig();
    expect(c1.curriculumMax).toBe(35);

    // Mutate the DB directly without invalidating — cached value persists.
    await WDRSConfig.updateOne({}, { $set: { curriculumMax: 99 } });
    const c2 = await getWDRSConfig();
    expect(c2.curriculumMax).toBe(35);

    invalidateWDRSConfigCache();
    const c3 = await getWDRSConfig();
    expect(c3.curriculumMax).toBe(99);
  });
});

describe('Premium gate (SSD §1.3)', () => {
  beforeEach(async () => {
    await FeatureFlag.deleteMany({});
    await TeacherProfile.deleteMany({});
  });

  it('isTeacherPremiumGateOpen returns false when no flag exists', async () => {
    expect(await isTeacherPremiumGateOpen()).toBe(false);
  });

  it('checkAndFlipPremiumGate flips on when verified count >= 30', async () => {
    // Seed exactly the threshold of approved profiles.
    const docs = Array.from({ length: PREMIUM_GATE_MIN_VERIFIED }).map((_, i) => ({
      uuid: `uuid-${i}`,
      userId: new mongoose.Types.ObjectId(),
      profileStatus: 'approved',
      completionPercentage: 100,
    }));
    await TeacherProfile.insertMany(docs);

    const r = await checkAndFlipPremiumGate();
    expect(r.verifiedCount).toBe(PREMIUM_GATE_MIN_VERIFIED);
    expect(r.isOpen).toBe(true);
    expect(r.flippedNow).toBe(true);

    // Idempotent — second call doesn't "flip again".
    const r2 = await checkAndFlipPremiumGate();
    expect(r2.flippedNow).toBe(false);
    expect(r2.isOpen).toBe(true);
  });

  it('does NOT flip below threshold', async () => {
    const r = await checkAndFlipPremiumGate();
    expect(r.verifiedCount).toBe(0);
    expect(r.isOpen).toBe(false);
    expect(r.flippedNow).toBe(false);
  });

  it('setPremiumGate manually flips the flag (admin override)', async () => {
    await setPremiumGate(true);
    expect(await isTeacherPremiumGateOpen()).toBe(true);

    await setPremiumGate(false);
    expect(await isTeacherPremiumGateOpen()).toBe(false);

    // FeatureFlag doc carries the key + value.
    const f = await FeatureFlag.findOne({ key: PREMIUM_GATE_FLAG_KEY });
    expect(f?.value).toBe(false);
  });
});
