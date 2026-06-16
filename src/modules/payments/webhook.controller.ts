/**
 * Moyasar webhook receiver.
 *
 * Key behaviours per SSD payment flow:
 *  1. HMAC-SHA256 signature check against config.moyasar.webhookSecret.
 *  2. Idempotent — duplicate eventIds are stored once and re-processed as no-ops.
 *  3. Two outcomes drive the lifecycle: `payment_paid` and `payment_failed`.
 *  4. Always responds 200 to ack receipt unless the signature failed (401).
 *     Moyasar retries on non-2xx; we don't want them retrying for non-fatal
 *     reasons because the WebhookEvent log already captures the body.
 */
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { config } from '../../config';
import { paymentsService } from './payments.service';

interface MoyasarWebhookBody {
  // The exact envelope varies a little by webhook type but always includes:
  id?: string;                      // event id (or fall back to payment.id below)
  type?: string;                    // e.g. 'payment_paid', 'payment_failed'
  data?: {
    id?: string;                    // payment id
    status?: string;
    amount?: number;
    metadata?: Record<string, unknown>;
    // ...more fields per Moyasar's spec
  };
}

function verifySignature(rawBody: string, headerSig: string | undefined): boolean {
  if (!config.moyasar.webhookSecret) {
    // No secret configured → in dev, accept; in prod, reject (caller logs).
    return process.env.NODE_ENV !== 'production';
  }
  if (!headerSig) return false;
  const expected = crypto
    .createHmac('sha256', config.moyasar.webhookSecret)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(headerSig));
  } catch {
    return false;
  }
}

export class WebhookController {
  async moyasar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // `rawBody` is captured by the JSON parser only when explicitly set up
      // (see app.ts — we add a verify fn to express.json). If absent, fall
      // back to re-stringifying — best-effort, signature may fail on edge cases.
      const rawBody = (req as Request & { rawBody?: string }).rawBody
        ?? JSON.stringify(req.body);
      const sigHeader =
        (req.headers['x-moyasar-signature'] as string | undefined) ??
        (req.headers['x-webhook-signature'] as string | undefined);

      if (!verifySignature(rawBody, sigHeader)) {
        res.status(401).json({ success: false, message: 'Invalid signature' });
        return;
      }

      const body = req.body as MoyasarWebhookBody;
      const eventId = body.id ?? body.data?.id ?? `unidentified-${Date.now()}`;
      const type = body.type ?? 'unknown';
      const providerPaymentId = body.data?.id;

      // 1. Idempotency log.
      const { wasNew } = await paymentsService.recordWebhookEventIdempotent({
        provider: 'moyasar',
        eventId,
        type,
        payload: body,
        signature: sigHeader,
      });

      if (!wasNew) {
        // Already handled — silently ack.
        res.json({ success: true, idempotent: true });
        return;
      }

      // 2. Dispatch on event type. Only act on terminal payment events.
      let processError: string | undefined;
      try {
        if (type === 'payment_paid' || body.data?.status === 'paid') {
          if (!providerPaymentId) throw new Error('Missing data.id on payment_paid event');
          await paymentsService.markPaymentSucceededByProviderId(providerPaymentId, body);
        } else if (type === 'payment_failed' || body.data?.status === 'failed') {
          if (providerPaymentId) {
            await paymentsService.markPaymentFailedByProviderId(providerPaymentId, body);
          }
        }
        // Other types (refunded, captured, voided) are logged but not acted on
        // in v1. Add handlers as needs surface.
      } catch (e: unknown) {
        processError = e instanceof Error ? e.message : String(e);
        // Re-throw so the next call records it on the log but still 200s back.
      } finally {
        await paymentsService.markWebhookProcessed('moyasar', eventId, processError);
      }

      // Always 200 — Moyasar shouldn't retry; the WebhookEvent log is our
      // forensic trail.
      res.json({ success: true, error: processError });
    } catch (err) {
      next(err);
    }
  }
}

export const webhookController = new WebhookController();
