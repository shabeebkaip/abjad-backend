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

// Send OTP via Email
export const sendOtpEmail = async (email: string, otp: string): Promise<void> => {
  // In test: log to console only, skip actual sending
  if (process.env.NODE_ENV === 'test') {
    console.log(`\n📧 [TEST] OTP Email`);
    console.log(`   To:   ${email}`);
    console.log(`   Code: ${otp}`);
    return;
  }

  try {
    await getTransporter().sendMail({
      from: `"Abjad Platform" <${config.email.user}>`,
      to: email,
      subject: 'Your Abjad Verification Code',
      text: `Your OTP code is: ${otp}. It expires in ${config.otp.expiryMinutes} minutes.`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
          <h2 style="color:#1a1a1a;">Your Verification Code</h2>
          <p style="color:#555;">Use the code below to complete your login or registration on Abjad.</p>
          <div style="background:#f4f4f4;border-radius:8px;padding:24px;text-align:center;margin:24px 0;">
            <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#1a1a1a;">${otp}</span>
          </div>
          <p style="color:#888;font-size:13px;">This code expires in <strong>${config.otp.expiryMinutes} minutes</strong>. Do not share it with anyone.</p>
        </div>
      `,
    });
  } catch (error) {
    console.error('Email send failed:', error);
    throw new Error('Failed to send OTP email. Please try again.');
  }
};