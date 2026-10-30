// src/utils/otp-sender.util.ts
// Email delivery for OTP

import nodemailer from 'nodemailer';
import { config } from '../config';

// Lazy-init transporter so missing SMTP env vars don't crash dev/test startup
let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.port === 465,
      auth: {
        user: config.email.user,
        pass: config.email.password,
      },
    });
  }
  return _transporter;
}

type OtpPurpose = 'signup' | 'login' | 'reset';

// Per-purpose copy, Arabic first (product default) then English. Each purpose
// has its own subject; reset also carries a "not you?" line. Kept in place
// (not in the admin template registry) — migrating is a later wave.
const COPY: Record<OtpPurpose, { subject: string; ar: Lang; en: Lang }> = {
  signup: {
    subject: 'رمز التحقق لإنشاء حسابك في أبجد | Verify your Abjad account',
    ar: { heading: 'تحقق من حسابك', intro: 'استخدم الرمز أدناه لإكمال إنشاء حسابك في أبجد.', footer: '' },
    en: { heading: 'Verify Your Account', intro: 'Use the code below to finish creating your Abjad account.', footer: '' },
  },
  login: {
    subject: 'رمز تسجيل الدخول إلى أبجد | Your Abjad login code',
    ar: { heading: 'رمز تسجيل الدخول', intro: 'استخدم الرمز أدناه لتسجيل الدخول إلى حسابك في أبجد.', footer: '' },
    en: { heading: 'Your Login Code', intro: 'Use the code below to sign in to your Abjad account.', footer: '' },
  },
  reset: {
    subject: 'إعادة تعيين كلمة مرور أبجد | Reset your Abjad password',
    ar: {
      heading: 'إعادة تعيين كلمة المرور',
      intro: 'تلقينا طلبًا لإعادة تعيين كلمة مرور حسابك في أبجد. استخدم الرمز أدناه.',
      footer: 'إذا لم تطلب ذلك، تجاهل هذه الرسالة؛ كلمة مرورك لم تتغير.',
    },
    en: {
      heading: 'Reset Your Password',
      intro: 'We received a request to reset your Abjad password. Use the code below.',
      footer: "If you didn't request this, ignore this email. Your password is unchanged.",
    },
  },
};

interface Lang { heading: string; intro: string; footer: string }

export const otpEmailCopy = (purpose: OtpPurpose = 'login') => COPY[purpose];

const block = (l: Lang, dir: 'rtl' | 'ltr', otp: string, expiry: string) => `
  <div dir="${dir}" style="text-align:${dir === 'rtl' ? 'right' : 'left'};">
    <h2 style="color:#1a1a1a;">${l.heading}</h2>
    <p style="color:#555;">${l.intro}</p>
    <div style="background:#f4f4f4;border-radius:8px;padding:24px;text-align:center;margin:24px 0;" dir="ltr">
      <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#1a1a1a;">${otp}</span>
    </div>
    <p style="color:#888;font-size:13px;">${expiry}</p>
    ${l.footer ? `<p style="color:#888;font-size:13px;">${l.footer}</p>` : ''}
  </div>`;

/** Subject + plain-text + HTML (Arabic block first, then English). */
export const buildOtpEmail = (otp: string, purpose: OtpPurpose = 'login') => {
  const copy = otpEmailCopy(purpose);
  const m = config.otp.expiryMinutes;
  const text = [
    `${copy.ar.intro} ${otp} (تنتهي الصلاحية خلال ${m} دقائق)`,
    copy.ar.footer,
    '',
    `${copy.en.intro} ${otp} (expires in ${m} minutes)`,
    copy.en.footer,
  ].filter((l, i) => l || i === 2).join('\n');
  const html = `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
          ${block(copy.ar, 'rtl', otp, `تنتهي صلاحية هذا الرمز خلال <strong>${m}</strong> دقائق. لا تشاركه مع أحد.`)}
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
          ${block(copy.en, 'ltr', otp, `This code expires in <strong>${m} minutes</strong>. Do not share it with anyone.`)}
        </div>`;
  return { subject: copy.subject, text, html };
};

// Send OTP via Email
export const sendOtpEmail = async (email: string, otp: string, purpose: OtpPurpose = 'login'): Promise<void> => {
  // In test: log to console only, skip actual sending
  if (process.env.NODE_ENV === 'test') {
    console.log(`\n📧 [TEST] OTP Email`);
    console.log(`   To:   ${email}`);
    console.log(`   Code: ${otp}`);
    return;
  }

  // In development: ALSO print to the backend console so demo / fake email
  // addresses (e.g. demo.teacher@abjad.dev) can complete the OTP flow by
  // reading the code from the server logs. The real email is still attempted
  // below so dev users with a working SMTP can use the inbox path too.
  if (process.env['NODE_ENV'] !== 'production') {
    console.log(`\n📧 [DEV] OTP Email`);
    console.log(`   To:   ${email}`);
    console.log(`   Code: ${otp}`);
    console.log(`   (also attempting real send via SMTP if configured)\n`);
  }

  try {
    await getTransporter().sendMail({
      from: `"Abjad Platform" <${config.email.from}>`,
      to: email,
      ...buildOtpEmail(otp, purpose),
    });
  } catch (error) {
    // In dev: swallow SMTP failures so demo / fake addresses
    // (demo.teacher@abjad.dev) don't crash the OTP flow — the code was
    // already logged to console above. In prod: re-throw so the caller
    // sees the failure.
    if (process.env['NODE_ENV'] !== 'production') {
      console.warn(`[DEV] SMTP send failed for ${email} — OTP is in the logs above.`);
      return;
    }
    console.error('Email send failed:', error);
    throw new Error('Failed to send OTP email. Please try again.');
  }
};