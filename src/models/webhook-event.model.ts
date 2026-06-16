import mongoose, { Document, Schema } from 'mongoose';

export type WebhookProvider = 'moyasar' | 'manual';

/**
 * Idempotency log for incoming webhooks.
 * The Moyasar handler must look up `eventId` BEFORE processing; if a row exists
 * with `processedAt != null`, skip — we already handled this event.
 */
export interface IWebhookEvent extends Document {
  provider: WebhookProvider;
  eventId: string;                  // provider's unique event id
  type: string;                     // e.g. 'payment.paid', 'payment.failed'
  payload: unknown;                 // full raw body
  signature?: string;               // HMAC signature header for replay verification

  receivedAt: Date;
  processedAt?: Date;
  error?: string;
  retries: number;
}

const webhookEventSchema = new Schema<IWebhookEvent>(
  {
    provider: { type: String, required: true, enum: ['moyasar', 'manual'] },
    eventId: { type: String, required: true },
    type: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    signature: { type: String },

    receivedAt: { type: Date, default: Date.now },
    processedAt: { type: Date },
    error: { type: String, maxlength: 2000 },
    retries: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Idempotency lock — never store the same provider event twice.
webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
webhookEventSchema.index({ processedAt: 1, receivedAt: 1 });

export const WebhookEvent = mongoose.model<IWebhookEvent>('WebhookEvent', webhookEventSchema);
