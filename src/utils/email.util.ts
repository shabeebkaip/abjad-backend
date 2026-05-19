import nodemailer from 'nodemailer';
import { config } from '../config';

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.port === 465,
      auth: { user: config.email.user, pass: config.email.password },
    });
  }
  return _transporter;
}

// Fire-and-forget — never throws, never blocks the caller.
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    console.log(`\n📧 [TEST] Email → ${to} | ${subject}`);
    return;
  }
  try {
    await getTransporter().sendMail({
      from: `"Abjad Platform" <${config.email.from}>`,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error(`[email] send failed to ${to}:`, err);
  }
}
