/**
 * Internal-format invoice/receipt PDF generator.
 *
 * NOT ZATCA-compliant — no QR code, no CSID stamp, no XML. The Invoice model
 * already has the slots (`zatcaXml`, `zatcaQrCode`, `zatcaCsid`); when Phase E
 * lands we swap this implementation for the compliant one without changing
 * the data model or controllers.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { IInvoice } from '../models/invoice.model';
import { formatHalala } from './money.util';

// Standard PDF fonts (Helvetica) only support WinAnsi. Eastern Arabic digits
// (U+0660–U+0669) used in Hijri strings must be converted to ASCII equivalents.
function toAsciiDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));
}

export async function renderInvoicePdf(invoice: IInvoice): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font     = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 595;     // A4
  const PAGE_H = 842;
  const MARGIN = 50;
  const LABEL  = rgb(0.45, 0.45, 0.5);
  const TEXT   = rgb(0.12, 0.14, 0.2);
  const ACCENT = rgb(0.32, 0.27, 0.85);

  const page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  // Header
  page.drawText('INVOICE', { x: MARGIN, y, size: 22, font: fontBold, color: TEXT });
  page.drawText(invoice.number, { x: PAGE_W - MARGIN - 140, y, size: 11, font, color: LABEL });
  y -= 30;

  // Seller block
  page.drawText('SELLER', { x: MARGIN, y, size: 9, font: fontBold, color: ACCENT });
  y -= 12;
  page.drawText(invoice.sellerNameEn, { x: MARGIN, y, size: 11, font: fontBold, color: TEXT });
  y -= 13;
  if (invoice.sellerVatNumber) {
    page.drawText(`VAT: ${invoice.sellerVatNumber}`, { x: MARGIN, y, size: 9, font, color: LABEL });
    y -= 11;
  }
  if (invoice.sellerCrNumber) {
    page.drawText(`CR: ${invoice.sellerCrNumber}`, { x: MARGIN, y, size: 9, font, color: LABEL });
    y -= 11;
  }
  page.drawText(invoice.sellerAddress, { x: MARGIN, y, size: 9, font, color: LABEL });
  y -= 20;

  // Buyer block
  page.drawText('BUYER', { x: MARGIN, y, size: 9, font: fontBold, color: ACCENT });
  y -= 12;
  page.drawText(invoice.buyerName, { x: MARGIN, y, size: 11, font: fontBold, color: TEXT });
  y -= 13;
  if (invoice.buyerVatNumber) {
    page.drawText(`VAT: ${invoice.buyerVatNumber}`, { x: MARGIN, y, size: 9, font, color: LABEL });
    y -= 11;
  }
  if (invoice.buyerAddress) {
    page.drawText(invoice.buyerAddress, { x: MARGIN, y, size: 9, font, color: LABEL });
    y -= 11;
  }
  if (invoice.buyerEmail) {
    page.drawText(invoice.buyerEmail, { x: MARGIN, y, size: 9, font, color: LABEL });
    y -= 11;
  }
  y -= 10;

  // Dates
  const dateLabel = (label: string, value: string) => {
    page.drawText(label, { x: MARGIN, y, size: 9, font, color: LABEL });
    page.drawText(value, { x: MARGIN + 100, y, size: 9, font, color: TEXT });
    y -= 12;
  };
  dateLabel('Issued (Greg)',  invoice.issuedAt.toISOString().slice(0, 10));
  dateLabel('Issued (Hijri)', toAsciiDigits(invoice.issuedAtHijri));
  if (invoice.paidAt) dateLabel('Paid', invoice.paidAt.toISOString().slice(0, 10));
  dateLabel('Status', invoice.status.toUpperCase());
  if (invoice.paymentMethod) dateLabel('Method', invoice.paymentMethod.replace(/_/g, ' '));
  y -= 8;

  // Line items table
  page.drawText('LINE ITEMS', { x: MARGIN, y, size: 9, font: fontBold, color: ACCENT });
  y -= 14;

  // Table header
  page.drawText('Description',    { x: MARGIN,        y, size: 9, font: fontBold, color: LABEL });
  page.drawText('Qty',            { x: MARGIN + 290,  y, size: 9, font: fontBold, color: LABEL });
  page.drawText('Unit (SAR)',     { x: MARGIN + 340,  y, size: 9, font: fontBold, color: LABEL });
  page.drawText('Total (SAR)',    { x: MARGIN + 420,  y, size: 9, font: fontBold, color: LABEL });
  y -= 14;

  for (const item of invoice.lineItems) {
    page.drawText(item.description.slice(0, 50), { x: MARGIN,       y, size: 10, font, color: TEXT });
    page.drawText(String(item.quantity),         { x: MARGIN + 290, y, size: 10, font, color: TEXT });
    page.drawText(formatHalala(item.unitPriceHalala), { x: MARGIN + 340, y, size: 10, font, color: TEXT });
    page.drawText(formatHalala(item.unitPriceHalala * item.quantity), { x: MARGIN + 420, y, size: 10, font, color: TEXT });
    y -= 13;
  }
  y -= 10;

  // Totals block (right-aligned)
  const rightX = PAGE_W - MARGIN - 200;
  const totalsLine = (label: string, value: string, bold = false) => {
    page.drawText(label, { x: rightX, y, size: 10, font, color: LABEL });
    page.drawText(`${value} SAR`, {
      x: rightX + 110, y, size: bold ? 12 : 10,
      font: bold ? fontBold : font, color: TEXT,
    });
    y -= bold ? 18 : 14;
  };
  totalsLine('Subtotal',  formatHalala(invoice.subtotalHalala));
  totalsLine('VAT (15%)', formatHalala(invoice.vatHalala));
  totalsLine('Total',     formatHalala(invoice.totalHalala), true);

  // Footer
  page.drawText(
    'Internal receipt — pending ZATCA-compliant e-invoice issuance.',
    { x: MARGIN, y: 30, size: 8, font, color: LABEL },
  );

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
