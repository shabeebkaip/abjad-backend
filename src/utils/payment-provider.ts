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
}

export interface InitiatePaymentResult {
  providerPaymentId: string;       // Moyasar payment.id (or equivalent)
  status: 'pending' | 'paid' | 'failed';
  rawProviderResponse: unknown;
}

export interface PaymentProvider {
  /** Pre-create a payment so the client-side flow can complete it. */
  initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  /** Read back the current status (used for reconciliation when a webhook is missed). */
  getPaymentStatus(providerPaymentId: string): Promise<{ status: string; amountHalala: number; rawProviderResponse: unknown }>;
  /** Issue a refund (partial or full). */
  refundPayment(providerPaymentId: string, amountHalala?: number): Promise<unknown>;
}

export class MoyasarProvider implements PaymentProvider {
  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const resp = await moyasarClient.createPayment({
      amountHalala: input.amountHalala,
      description: input.description,
      callbackUrl: input.callbackUrl,
      metadata: {
        invoiceUuid: input.invoiceUuid,
        ownerId: input.ownerId,
      },
    });
    return {
      providerPaymentId: resp.id,
      status: resp.status === 'paid' ? 'paid' : resp.status === 'failed' ? 'failed' : 'pending',
      rawProviderResponse: resp,
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

let _provider: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (!_provider) _provider = new MoyasarProvider();
  return _provider;
}

// For tests — inject a mock provider.
export function setPaymentProvider(p: PaymentProvider): void {
  _provider = p;
}
