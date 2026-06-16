/**
 * Subscription entitlement middleware for school routes.
 *
 * Resolves `req.entitlement` so downstream handlers can read CV caps,
 * feature toggles, etc. Optionally enforces minimum access level.
 */
import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { getSchoolEntitlement, SchoolEntitlement } from '../utils/entitlement.util';

// Augment the request type so handlers can read req.entitlement.
declare module 'express-serve-static-core' {
  interface Request {
    entitlement?: SchoolEntitlement;
  }
}

/**
 * Attaches entitlement state to the request. Does NOT block the request —
 * use requireSchoolAccess if you want to gate.
 */
export async function attachSchoolEntitlement(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) return next();
    const ent = await getSchoolEntitlement(req.user.userId);
    req.entitlement = ent;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Block the route unless the user has any school access (paid, trial, or legacy).
 */
export async function requireSchoolAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }
    const ent = req.entitlement ?? (await getSchoolEntitlement(req.user.userId));
    req.entitlement = ent;
    if (!ent.hasAccess) {
      res.status(402).json({
        success: false,
        message: 'A subscription or trial is required to access this resource.',
        code: 'subscription_required',
      });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Block the route unless the user has paid access (legacy or paid). Used for
 * trial-locked features like full candidate search filters, direct contact, etc.
 */
export async function requirePaidOrLegacy(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }
    const ent = req.entitlement ?? (await getSchoolEntitlement(req.user.userId));
    req.entitlement = ent;
    if (!ent.hasAccess || ent.source === 'trial') {
      res.status(402).json({
        success: false,
        message: 'Upgrade to a paid plan to access this feature.',
        code: 'paid_plan_required',
      });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}
