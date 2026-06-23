/**
 * Provider-agnostic payment interface. Business logic in payments.service
 * depends on this; the concrete Moyasar implementation lives below.
 *
 * Adding a new provider (Tap, Stripe) = add another implementation +
 * one-line switch in `getPaymentProvider()`. Business code never imports
 * moyasar.client directly.
 */
import { moyasarClient } from './moyasar.client';

export interface InitiatePaymentInput {
  amountHalala: number;
  description: string;
  invoiceUuid: string;             // our internal id, returned in metadata
  ownerId: string;                 // school / teacher user id
  callbackUrl?: string;
  method?: string;                 // checkout method (mada, apple_pay, stcpay, moyasar_card)
}

export interface InitiatePaymentResult {
  providerPaymentId: string;       // Moyasar payment.id (or equivalent)
  status: 'pending' | 'paid' | 'failed';
  rawProviderResponse: unknown;
  transactionUrl?: string;         // Moyasar hosted-checkout URL (redirect user here)
}

export interface PaymentProvider {
  /** Pre-create a payment so the client-side flow can complete it. */
  initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  /** Read back the current status (used for reconciliation when a webhook is missed). */
  getPaymentStatus(providerPaymentId: string): Promise<{ status: string; amountHalala: number; rawProviderResponse: unknown }>;
  /** Issue a refund (partial or full). */
  refundPayment(providerPaymentId: string, amountHalala?: number): Promise<unknown>;
}

// Maps our internal method names to the Moyasar source type.
// mada is a Saudi debit scheme but uses the creditcard API surface.
const METHOD_TO_SOURCE_TYPE: Record<string, string> = {
  mada:         'creditcard',
  moyasar_card: 'creditcard',
  apple_pay:    'applepay',
  stcpay:       'stcpay',
};

export class MoyasarProvider implements PaymentProvider {
  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const sourceType = (input.method && METHOD_TO_SOURCE_TYPE[input.method]) ?? 'creditcard';
    const resp = await moyasarClient.createPayment({
      amountHalala: input.amountHalala,
      description: input.description,
      callbackUrl: input.callbackUrl,
      metadata: {
        invoiceUuid: input.invoiceUuid,
        ownerId: input.ownerId,
      },
      source: { type: sourceType },
    });
    const transactionUrl =
      typeof resp.source?.transaction_url === 'string' ? resp.source.transaction_url : undefined;
    return {
      providerPaymentId: resp.id,
      status: resp.status === 'paid' ? 'paid' : resp.status === 'failed' ? 'failed' : 'pending',
      rawProviderResponse: resp,
      transactionUrl,
    };
  }

  async getPaymentStatus(providerPaymentId: string) {
    const resp = await moyasarClient.getPayment(providerPaymentId);
    return {
      status: resp.status,
      amountHalala: resp.amount,
      rawProviderResponse: resp,
    };
  }

  async refundPayment(providerPaymentId: string, amountHalala?: number) {
    return moyasarClient.refund(providerPaymentId, amountHalala);
  }
}

/**
 * Demo provider — activates when no Moyasar credentials are configured.
 * Returns synthetic providerPaymentIds prefixed with `demo_` so the rest of
 * the pipeline (Payment doc, webhook idempotency, etc.) treats the flow the
 * same way. The frontend detects `isDemoProvider()` and renders a "Demo —
 * Simulate successful payment" button in place of the Moyasar.js form.
 *
 * Strictly dev/staging — refuses to load in production via the same env
 * guard the keys check.
 */
export class DemoPaymentProvider implements PaymentProvider {
  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const id = `demo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return {
      providerPaymentId: id,
      status: 'pending',
      rawProviderResponse: { demo: true, input },
    };
  }
  async getPaymentStatus(providerPaymentId: string) {
    return {
      status: 'pending',
      amountHalala: 0,
      rawProviderResponse: { demo: true, providerPaymentId },
    };
  }
  async refundPayment(providerPaymentId: string, amountHalala?: number) {
    return { demo: true, providerPaymentId, amountHalala };
  }
}

let _provider: PaymentProvider | null = null;
let _isDemoCached: boolean | null = null;

/**
 * True when the backend is running with no Moyasar credentials — used by:
 *   - the demo-complete endpoint to know it can mock a successful webhook
 *   - the initiate response to carry a `demoMode` flag the frontend reads
 * Cached on first call since env doesn't change at runtime.
 */
export function isDemoProvider(): boolean {
  if (_isDemoCached !== null) return _isDemoCached;
  const hasKey = (process.env['MOYASAR_SECRET_KEY'] ?? '').trim().length > 0;
  _isDemoCached = !hasKey;
  return _isDemoCached;
}

export function getPaymentProvider(): PaymentProvider {
  if (_provider) return _provider;
  if (isDemoProvider()) {
    if (process.env['NODE_ENV'] === 'production') {
      throw new Error('Refusing to use DemoPaymentProvider in production. Configure MOYASAR_SECRET_KEY.');
    }
    console.warn('[payments] No MOYASAR_SECRET_KEY set — using DemoPaymentProvider (dev only).');
    _provider = new DemoPaymentProvider();
  } else {
    _provider = new MoyasarProvider();
  }
  return _provider;
}

// For tests — inject a mock provider.
export function setPaymentProvider(p: PaymentProvider): void {
  _provider = p;
}
