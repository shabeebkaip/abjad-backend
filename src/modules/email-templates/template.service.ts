import { EmailTemplate, IEmailTemplate } from '../../models/email-template.model';
import { EMAIL_TEMPLATES, TemplateKey, TEMPLATE_KEYS, TemplateRegistryEntry } from '../../utils/email-template-registry';
import { AppError } from '../../utils/app-error.util';

// Tier 2 #12 — Sync render path backed by an in-memory cache of DB overrides.
// Cache is warmed at app startup and refreshed on every update/reset.
// Callers (existing tplXxx shims) stay synchronous — DB lookups during a
// transactional send would add latency and a failure mode we don't want.

interface ResolvedTemplate {
  subject: string;
  body: string;
}

class TemplateService {
  private cache: Map<TemplateKey, ResolvedTemplate> = new Map();
  private warmed = false;

  // Wrapper for the email <body>. Imported by callers via render().
  private layout(title: string, body: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#0D2542 0%,#444882 60%,#00ACD3 100%);padding:28px 32px;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Abjad</p>
          <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.7);">Teacher-School Recruitment Platform</p>
        </td></tr>
        <tr><td style="padding:32px;">
          ${body}
        </td></tr>
        <tr><td style="background:#f8fafc;border-top:1px solid #e8edf2;padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#94a3b8;">This is an automated message from Abjad. Do not reply to this email.</p>
          <p style="margin:6px 0 0;font-size:11px;color:#94a3b8;">© ${new Date().getFullYear()} Abjad Platform · Saudi Arabia</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  // Boot-time warmup. Loads every override into the in-memory cache.
  // Failing to warm is non-fatal — render() falls back to registry defaults.
  async warm(): Promise<void> {
    try {
      const rows = await EmailTemplate.find().lean();
      for (const row of rows) {
        if (this.isKnownKey(row.key)) {
          this.cache.set(row.key, { subject: row.subject, body: row.body });
        }
      }
      this.warmed = true;
    } catch (err) {
      console.error('[email-templates] cache warm failed:', err);
    }
  }

  private isKnownKey(key: string): key is TemplateKey {
    return Object.prototype.hasOwnProperty.call(EMAIL_TEMPLATES, key);
  }

  private resolved(key: TemplateKey): { subject: string; body: string; layoutTitle: string } {
    const reg = EMAIL_TEMPLATES[key];
    const override = this.cache.get(key);
    return {
      subject: override?.subject ?? reg.defaultSubject,
      body:    override?.body    ?? reg.defaultBody,
      layoutTitle: reg.layoutTitle,
    };
  }

  // Simple {{var}} interpolator. Whitespace inside the braces is tolerated.
  // Missing variables interpolate to an empty string so a missing optional
  // (e.g. {{instructionsBlock}}) doesn't leak a literal placeholder.
  private interpolate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => vars[k] ?? '');
  }

  // Synchronous render — used by tplXxx shims. Returns the fully-wrapped HTML.
  render(key: TemplateKey, vars: Record<string, string>): { subject: string; html: string } {
    const { subject, body, layoutTitle } = this.resolved(key);
    return {
      subject: this.interpolate(subject, vars),
      html:    this.layout(layoutTitle, this.interpolate(body, vars)),
    };
  }

  // ── Admin surface ────────────────────────────────────────────────────────

  // Returns one row per registry entry, marking whether an override exists.
  async list(): Promise<Array<{
    key: TemplateKey;
    name: string;
    description: string;
    audience: string;
    customised: boolean;
    updatedAt?: Date;
    updatedBy?: string;
  }>> {
    const overrides = await EmailTemplate.find().select('key updatedAt updatedBy').lean();
    const idx = new Map(overrides.map((o) => [o.key, o]));

    return TEMPLATE_KEYS.map((key) => {
      const reg = EMAIL_TEMPLATES[key];
      const ov = idx.get(key);
      return {
        key,
        name: reg.name,
        description: reg.description,
        audience: reg.audience,
        customised: !!ov,
        updatedAt: ov?.updatedAt,
        updatedBy: ov?.updatedBy?.toString(),
      };
    });
  }

  // Returns the full state for an editor: defaults + current values + variables.
  async get(key: string): Promise<{
    key: TemplateKey;
    registry: TemplateRegistryEntry;
    current: { subject: string; body: string };
    customised: boolean;
    updatedAt?: Date;
    updatedBy?: string;
  }> {
    if (!this.isKnownKey(key)) throw AppError.notFound('Unknown template key');
    const reg = EMAIL_TEMPLATES[key];
    const row = await EmailTemplate.findOne({ key }).lean();
    return {
      key,
      registry: reg,
      current: {
        subject: row?.subject ?? reg.defaultSubject,
        body:    row?.body    ?? reg.defaultBody,
      },
      customised: !!row,
      updatedAt: row?.updatedAt,
      updatedBy: row?.updatedBy?.toString(),
    };
  }

  async update(key: string, payload: { subject: string; body: string }, adminId: string): Promise<IEmailTemplate> {
    if (!this.isKnownKey(key)) throw AppError.notFound('Unknown template key');
    if (!payload.subject?.trim()) throw AppError.badRequest('Subject is required');
    if (!payload.body?.trim())    throw AppError.badRequest('Body is required');

    const row = await EmailTemplate.findOneAndUpdate(
      { key },
      { $set: { key, subject: payload.subject, body: payload.body, updatedBy: adminId } },
      { upsert: true, new: true },
    );
    this.cache.set(key, { subject: row.subject, body: row.body });
    return row;
  }

  async reset(key: string): Promise<void> {
    if (!this.isKnownKey(key)) throw AppError.notFound('Unknown template key');
    await EmailTemplate.deleteOne({ key });
    this.cache.delete(key);
  }

  isWarmed() { return this.warmed; }
}

export const templateService = new TemplateService();
