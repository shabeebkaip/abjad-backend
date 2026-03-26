// src/utils/otp-sender.util.ts
// SMS / email delivery for OTP

import twilio from 'twilio';  // already installed
import nodemailer from 'nodemailer';  // already installed
import { config } from '../config';

// Twilio client for SMS
// In test environment, create mock client
const twilioClient = process.env.NODE_ENV === 'test'
  ? null
  : twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Nodemailer transporter for email
const emailTransporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  auth: {
    user: config.email.user,
    pass: config.email.password,
  },
});

// Send OTP via SMS
export const sendOtpSms = async (phone: string, otp: string): Promise<void> => {
  // In test or development environment, skip actual SMS sending
  if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
    console.log(`\n📱 [${process.env.NODE_ENV.toUpperCase()}] OTP Sent`);
    console.log(`   Phone: ${phone}`);
    console.log(`   Code: ${otp}`);
    return;
  }

  try {
    await twilioClient!.messages.create({
      body: `Your OTP code is: ${otp}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone,
    });
  } catch (error) {
    console.error('SMS send failed:', error);
    throw new Error('Failed to send SMS');
  }
};

// Send OTP via Email
export const sendOtpEmail = async (email: string, otp: string): Promise<void> => {
  try {
    await emailTransporter.sendMail({
      from: config.email.user,
      to: email,
      subject: 'Your OTP Code',
      text: `Your OTP code is: ${otp}`,
    });
  } catch (error) {
    console.error('Email send failed:', error);
    throw new Error('Failed to send email');
  }
};