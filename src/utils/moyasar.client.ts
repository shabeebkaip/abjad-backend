/**
 * Moyasar HTTP client — minimal wrapper around the v1 REST API.
 *
 * Auth: HTTP Basic, username = secret key, password = empty (per Moyasar docs).
 * Used only via the PaymentProviderAdapter in payments.service — don't import
 * directly from feature code.
 */
import { config } from '../config';

const BASE = config.moyasar.apiBase;

export interface MoyasarPaymentResponse {
  id: string;
  status: 'initiated' | 'paid' | 'failed' | 'authorized' | 'captured' | 'refunded' | 'voided';
  amount: number;            // halala (smallest unit) — Moyasar uses the same convention
  fee: number;
  currency: string;
  refunded: number;
  refunded_at?: string | null;
  captured?: number;
  captured_at?: string | null;
  voided_at?: string | null;
  description: string;
  amount_format: string;
  fee_format: string;
  invoice_id?: string | null;
  ip?: string | null;
  callback_url?: string | null;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
  source: Record<string, unknown>;
}

export interface CreatePaymentInput {
  amountHalala: number;
  description: string;
  callbackUrl?: string;            // where Moyasar redirects after 3DS / OTP
  metadata?: Record<string, string | number>;
  // Single client-driven flow: the frontend uses the Moyasar.js library with
  // the publishable key to tokenize the card, then POSTs the resulting
  // source. On server-side initiation we usually return just amount + id and
  // let the client finish the flow with their tokenized source.
  source?: Record<string, unknown>;
}

function authHeader(): string {
  // Basic auth: secret-key:    (empty password)
  return 'Basic ' + Buffer.from(`${config.moyasar.secretKey}:`).toString('base64');
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  if (!config.moyasar.secretKey) {
    throw new Error('MOYASAR_SECRET_KEY is not configured');
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Moyasar ${method} ${path} failed (${res.status}): ${text}`);
  }
  return JSON.parse(text) as T;
}

export const moyasarClient = {
  async createPayment(input: CreatePaymentInput): Promise<MoyasarPaymentResponse> {
    return request<MoyasarPaymentResponse>('POST', '/payments', {
      amount: input.amountHalala,
      currency: 'SAR',
      description: input.description,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
      source: input.source,
    });
  },

  async getPayment(paymentId: string): Promise<MoyasarPaymentResponse> {
    return request<MoyasarPaymentResponse>('GET', `/payments/${paymentId}`);
  },

  async refund(paymentId: string, amountHalala?: number): Promise<MoyasarPaymentResponse> {
    return request<MoyasarPaymentResponse>('POST', `/payments/${paymentId}/refund`,
      amountHalala != null ? { amount: amountHalala } : {});
  },
};
