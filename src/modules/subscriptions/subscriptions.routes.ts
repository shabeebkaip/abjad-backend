import { Router } from 'express';
import { subscriptionsController } from './subscriptions.controller';
import { authenticate } from '../../middlewares/auth';

const router = Router();

router.use(authenticate);

// Read current subscription state for the logged-in user (school or teacher).
router.get('/me', subscriptionsController.getMine.bind(subscriptionsController));

// School-only — start the 5-day free trial. Service enforces role.
router.post('/trial', subscriptionsController.startTrial.bind(subscriptionsController));

// Cancel current subscription (works for trialing + active alike — semantics
// vary per status; service handles).
router.post('/cancel', subscriptionsController.cancel.bind(subscriptionsController));

export default router;
