import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { WDRSConfig, DEFAULT_WDRS_CONFIG } from '../../models/wdrs-config.model';
import { FeatureFlag } from '../../models/feature-flag.model';
import {
  invalidateWDRSConfigCache,
  checkAndFlipPremiumGate,
  setPremiumGate,
  PREMIUM_GATE_FLAG_KEY,
  PREMIUM_GATE_MIN_VERIFIED,
} from '../ranking/ranking.service';
import { AppError } from '../../utils/app-error.util';

const ALLOWED_NUMERIC_FIELDS = [
  'curriculumMax', 'qualificationsMax', 'subscriptionMax', 'activityMax',
  'tierAnnual', 'tier6Month', 'tierMonthly', 'tierFree',
];

export class AdminRankingController {
  /** GET /api/admin/wdrs-config — single config doc, seeded with defaults if absent. */
  async getConfig(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      let doc = await WDRSConfig.findOne();
      if (!doc) doc = await WDRSConfig.create({ ...DEFAULT_WDRS_CONFIG });
      res.json({ success: true, data: doc });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/admin/wdrs-config — admin tunes WDRS weights per SSD §1.5.
   * Body accepts any subset of the 8 numeric fields. Validates non-negative,
   * and that the four factor maxes still sum to 100 (so totals stay normalised).
   */
  async updateConfig(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as Record<string, unknown>;
      const updates: Record<string, number> = {};
      for (const key of ALLOWED_NUMERIC_FIELDS) {
        if (body[key] !== undefined) {
          const v = Number(body[key]);
          if (!Number.isFinite(v) || v < 0) {
            throw AppError.badRequest(`${key} must be a non-negative number`);
          }
          updates[key] = v;
        }
      }

      let doc = await WDRSConfig.findOne();
      if (!doc) doc = await WDRSConfig.create({ ...DEFAULT_WDRS_CONFIG });

      // Apply pending values; validate the four factor maxes still sum to 100.
      const projected = { ...doc.toObject(), ...updates };
      const factorSum =
        Number(projected.curriculumMax) +
        Number(projected.qualificationsMax) +
        Number(projected.subscriptionMax) +
        Number(projected.activityMax);
      if (factorSum !== 100) {
        throw AppError.badRequest(
          `Factor maxes must sum to 100 (got ${factorSum}). Adjust curriculumMax/qualificationsMax/subscriptionMax/activityMax together.`,
        );
      }

      Object.assign(doc, updates);
      doc.updatedBy = req.user?.userId ? (req.user.userId as unknown as typeof doc.updatedBy) : undefined;
      await doc.save();
      invalidateWDRSConfigCache();
      res.json({ success: true, data: doc });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/admin/feature-flags — list every flag (sorted by key).
   */
  async listFlags(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const flags = await FeatureFlag.find().sort({ key: 1 }).lean();
      res.json({ success: true, data: flags });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/admin/feature-flags/:key — toggle a flag manually. The
   * teacher_premium_enabled key has its own dedicated helper so we can carry
   * the SSD §1.3 documentation/audit trail.
   */
  async updateFlag(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { key } = req.params;
      const { value } = req.body as { value?: boolean };
      if (typeof value !== 'boolean') {
        throw AppError.badRequest('value must be boolean');
      }
      if (key === PREMIUM_GATE_FLAG_KEY) {
        await setPremiumGate(value, req.user?.userId);
      } else {
        await FeatureFlag.findOneAndUpdate(
          { key },
          { $set: { value, updatedBy: req.user?.userId } },
          { upsert: true, new: true },
        );
      }
      const flag = await FeatureFlag.findOne({ key });
      res.json({ success: true, data: flag });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/admin/premium-gate — diagnostic endpoint: current verified-teacher
   * count, threshold, and whether the flag is open. Useful when debugging "why
   * isn't premium showing up yet?"
   */
  async premiumGateStatus(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const r = await checkAndFlipPremiumGate();
      res.json({
        success: true,
        data: {
          verifiedCount: r.verifiedCount,
          threshold: PREMIUM_GATE_MIN_VERIFIED,
          isOpen: r.isOpen,
          flippedNow: r.flippedNow,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const adminRankingController = new AdminRankingController();
