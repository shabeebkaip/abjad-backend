import { Router } from 'express';
import { paymentsController } from './payments.controller';
import { webhookController } from './webhook.controller';
import { authenticate } from '../../middlewares/auth';

const router = Router();

// Webhook MUST be unauthenticated — Moyasar can't carry our session cookie.
// Signature verification inside the handler is the auth.
router.post('/webhook/moyasar', webhookController.moyasar.bind(webhookController));

// All other endpoints require auth.
router.use(authenticate);
router.post('/initiate', paymentsController.initiate.bind(paymentsController));

export default router;
