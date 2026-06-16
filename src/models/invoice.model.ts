import mongoose, { Document, Schema } from 'mongoose';
import { randomUUID } from 'crypto';

export type InvoiceStatus = 'draft' | 'pending' | 'paid' | 'failed' | 'cancelled';
export type InvoicePaymentMethod =
  | 'moyasar_card' | 'mada' | 'apple_pay' | 'stcpay' | 'bank_transfer' | 'manual';

export interface IInvoiceLineItem {
  description: string;            // e.g. "School Plan — Annual Subscription"
  descriptionAr?: string;
  quantity: number;
  unitPriceHalala: number;        // excl. VAT
  vatHalala: number;              // line-level VAT (15% of unitPriceHalala * quantity)
  totalHalala: number;            // (unit * qty) + vatHalala
}

export interface IInvoice extends Document {
  uuid: string;                     // ZATCA UUID — stable, never re-issued
  number: string;                   // Human-readable, e.g. INV-2026-00145
  subscriptionId?: mongoose.Types.ObjectId;
  ownerType: 'school' | 'teacher';
  ownerId: mongoose.Types.ObjectId;
  status: InvoiceStatus;
  paymentMethod?: InvoicePaymentMethod;

  // Money (all halala, integer)
  subtotalHalala: number;
  vatHalala: number;
  totalHalala: number;
  currency: 'SAR';

  // Dates
  issuedAt: Date;
  issuedAtHijri: string;            // YYYY-MM-DD snapshot at issue time
  dueAt?: Date;                     // bank transfer / pending payment grace deadline
  paidAt?: Date;

  // ZATCA seller block (snapshot, in case Abjad's details change later)
  sellerNameEn: string;
  sellerNameAr: string;
  sellerVatNumber: string;
  sellerCrNumber: string;
  sellerAddress: string;

  // ZATCA buyer block — buyer VAT only for B2B (school) invoices
  buyerName: string;
  buyerNameAr?: string;
  buyerVatNumber?: string;
  buyerAddress?: string;
  buyerEmail?: string;

  lineItems: IInvoiceLineItem[];

  // Phase 2 ZATCA — null until the compliance phase. Schema-ready so we don't
  // need a migration when invoicing flips to ZATCA-submitting mode.
  zatcaXml?: string;
  zatcaQrCode?: string;             // base64 of the TLV QR
  zatcaCsid?: string;               // cryptographic stamp identifier
  zatcaSubmittedAt?: Date;

  // Internal metadata
  notes?: string;
  voidedAt?: Date;
  voidReason?: string;

  createdAt: Date;
  updatedAt: Date;
}

const lineItemSchema = new Schema<IInvoiceLineItem>(
  {
    description: { type: String, required: true },
    descriptionAr: { type: String },
    quantity: { type: Number, required: true, min: 1 },
    unitPriceHalala: { type: Number, required: true, min: 0 },
    vatHalala: { type: Number, required: true, min: 0 },
    totalHalala: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const invoiceSchema = new Schema<IInvoice>(
  {
    uuid: { type: String, required: true, unique: true, default: () => randomUUID() },
    number: { type: String, required: true, unique: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription' },
    ownerType: { type: String, required: true, enum: ['school', 'teacher'] },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: {
      type: String,
      required: true,
      enum: ['draft', 'pending', 'paid', 'failed', 'cancelled'],
      default: 'pending',
    },
    paymentMethod: {
      type: String,
      enum: ['moyasar_card', 'mada', 'apple_pay', 'stcpay', 'bank_transfer', 'manual'],
    },

    subtotalHalala: { type: Number, required: true, min: 0 },
    vatHalala: { type: Number, required: true, min: 0 },
    totalHalala: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'SAR' },

    issuedAt: { type: Date, default: Date.now, required: true },
    issuedAtHijri: { type: String, required: true },
    dueAt: { type: Date },
    paidAt: { type: Date },

    sellerNameEn: { type: String, required: true },
    sellerNameAr: { type: String, required: true },
    sellerVatNumber: { type: String, required: true },
    sellerCrNumber: { type: String, required: true },
    sellerAddress: { type: String, required: true },

    buyerName: { type: String, required: true },
    buyerNameAr: { type: String },
    buyerVatNumber: { type: String },
    buyerAddress: { type: String },
    buyerEmail: { type: String },

    lineItems: { type: [lineItemSchema], default: [] },

    zatcaXml: { type: String },
    zatcaQrCode: { type: String },
    zatcaCsid: { type: String },
    zatcaSubmittedAt: { type: Date },

    notes: { type: String, maxlength: 2000 },
    voidedAt: { type: Date },
    voidReason: { type: String, maxlength: 500 },
  },
  { timestamps: true },
);

invoiceSchema.index({ status: 1, issuedAt: -1 });
invoiceSchema.index({ ownerType: 1, ownerId: 1, issuedAt: -1 });

export const Invoice = mongoose.model<IInvoice>('Invoice', invoiceSchema);
