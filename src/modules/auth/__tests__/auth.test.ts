/**
 * Auth Module — Integration Tests
 *
 * Uses mongodb-memory-server (configured in jest.setup.js).
 * OTP delivery is bypassed in NODE_ENV=test (console log only).
 * All external side-effects (email, Redis) are absent — pure DB logic is tested.
 */

import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../../app';
import OtpCode from '../../../models/otp-code.model';
import User from '../../../models/user.model';
import Session from '../../../models/session.model';
import { hashOtp, otpExpiry } from '../../../utils/otp.util';

// ─── Helpers ────────────────────────────────────────────────

const TEST_EMAIL_TEACHER = 'teacher@test.com';
const TEST_EMAIL_SCHOOL  = 'school@test.com';
// DECISIONS LOCKED #1 — password is now REQUIRED at signup. Every verify-otp
// call with purpose='signup' below must include one or it's a 400.
const TEST_PASSWORD = 'Correct-Horse-9';

/**
 * Plant a real (hashed) OTP into the DB so verify-otp can find it.
 * This simulates a prior send-otp call without hitting the email sender.
 */
async function plantOtp(email: string, purpose: 'signup' | 'login' | 'reset', otp: string) {
  const hashed = await hashOtp(otp);
  await OtpCode.findOneAndUpdate(
    { email: email.toLowerCase(), purpose },
    { code: hashed, expiresAt: otpExpiry(), attempts: 0 },
    { upsert: true, new: true },
  );
}

/**
 * Full signup flow: plant OTP → verify → return tokens + userId
 */
async function registerUser(email: string, role: 'teacher' | 'school', otp = '123456') {
  await plantOtp(email, 'signup', otp);
  const res = await request(app)
    .post('/api/auth/verify-otp')
    .send({ email, code: otp, purpose: 'signup', role, password: TEST_PASSWORD });
  return res;
}

// ─── Cleanup between tests ───────────────────────────────────

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    OtpCode.deleteMany({}),
    Session.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose.connection.close();
});

// ════════════════════════════════════════════════════════════
// 1. POST /api/auth/send-otp
// ════════════════════════════════════════════════════════════

describe('POST /api/auth/send-otp', () => {
  it('returns 200 for a valid teacher signup request', async () => {
    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ email: TEST_EMAIL_TEACHER, purpose: 'signup' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('OTP sent');
  });

  it('returns 200 for a valid school signup request', async () => {
    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ email: TEST_EMAIL_SCHOOL, purpose: 'signup' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('stores a hashed OTP in the database', async () => {
    await request(app)
      .post('/api/auth/send-otp')
      .send({ email: TEST_EMAIL_TEACHER, purpose: 'signup' });

    const record = await OtpCode.findOne({ email: TEST_EMAIL_TEACHER, purpose: 'signup' }).select('+code');
    expect(record).not.toBeNull();
    expect(record!.code).not.toBeUndefined();       // stored hash, not raw OTP
    expect(record!.code).not.toMatch(/^\d{6}$/);    // must NOT be plaintext
  });

  it('returns 200 for login purpose when the account exists', async () => {
    await registerUser(TEST_EMAIL_TEACHER, 'teacher');
    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ email: TEST_EMAIL_TEACHER, purpose: 'login' });
    expect(res.status).toBe(200);
  });

  it('returns 404 for login purpose when the account does not exist (LOGIN-002)', async () => {
    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ email: 'nouser@test.com', purpose: 'login' });
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ email: 'not-an-email', purpose: 'signup' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ purpose: 'signup' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for invalid purpose', async () => {
    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ email: TEST_EMAIL_TEACHER, purpose: 'invalid' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('upserts OTP (second request replaces first)', async () => {
    await request(app).post('/api/auth/send-otp').send({ email: TEST_EMAIL_TEACHER, purpose: 'signup' });
    await request(app).post('/api/auth/send-otp').send({ email: TEST_EMAIL_TEACHER, purpose: 'signup' });

    const count = await OtpCode.countDocuments({ email: TEST_EMAIL_TEACHER, purpose: 'signup' });
    expect(count).toBe(1); // upsert — not duplicate
  });

  it('treats email as case-insensitive', async () => {
    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ email: 'TEACHER@TEST.COM', purpose: 'signup' });
    expect(res.status).toBe(200);

    const record = await OtpCode.findOne({ email: 'teacher@test.com', purpose: 'signup' });
    expect(record).not.toBeNull();
  });

  // PWD-010 — leading/trailing whitespace (copy-pasted from an invite email or
  // spreadsheet) must be trimmed before .email() validation, not rejected.
  it.each([
    ['leading space', ` ${TEST_EMAIL_TEACHER}`],
    ['trailing space', `${TEST_EMAIL_TEACHER} `],
    ['both', ` ${TEST_EMAIL_TEACHER} `],
  ])('PWD-010: trims %s and succeeds (200), matching the clean-email control', async (_label, padded) => {
    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ email: padded, purpose: 'signup' });

    expect(res.status).toBe(200);

    const record = await OtpCode.findOne({ email: TEST_EMAIL_TEACHER, purpose: 'signup' });
    expect(record).not.toBeNull(); // stored under the trimmed email, not the padded one
  });
});

// ════════════════════════════════════════════════════════════
// 2. POST /api/auth/verify-otp  — New User (Registration)
// ════════════════════════════════════════════════════════════

describe('POST /api/auth/verify-otp — new user registration', () => {
  it('creates a teacher account on first verify-otp', async () => {
    const otp = '112233';
    await plantOtp(TEST_EMAIL_TEACHER, 'signup', otp);

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL_TEACHER, code: otp, purpose: 'signup', role: 'teacher', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isNewUser).toBe(true);
    expect(res.body.data.nextStep).toBe('complete-profile');
    expect(res.body.data.user.role).toBe('teacher');
    expect(res.body.data.user.email).toBe(TEST_EMAIL_TEACHER);
    expect(res.body.data.tokens.accessToken).toBeTruthy();
  });

  it('creates a school account on first verify-otp', async () => {
    const otp = '445566';
    await plantOtp(TEST_EMAIL_SCHOOL, 'signup', otp);

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL_SCHOOL, code: otp, purpose: 'signup', role: 'school', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('school');
    expect(res.body.data.isNewUser).toBe(true);
  });

  it('defaults to teacher role when role is omitted', async () => {
    const otp = '667788';
    await plantOtp(TEST_EMAIL_TEACHER, 'signup', otp);

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL_TEACHER, code: otp, purpose: 'signup', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('teacher');
  });

  it('deletes OTP record after successful verification', async () => {
    const otp = '223344';
    await plantOtp(TEST_EMAIL_TEACHER, 'signup', otp);
    await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL_TEACHER, code: otp, purpose: 'signup', password: TEST_PASSWORD });

    const record = await OtpCode.findOne({ email: TEST_EMAIL_TEACHER, purpose: 'signup' });
    expect(record).toBeNull();
  });

  it('creates a session record on successful verification', async () => {
    const otp = '334455';
    await plantOtp(TEST_EMAIL_TEACHER, 'signup', otp);
    await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL_TEACHER, code: otp, purpose: 'signup', password: TEST_PASSWORD });

    const user = await User.findOne({ email: TEST_EMAIL_TEACHER });
    const session = await Session.findOne({ userId: user!._id });
    expect(session).not.toBeNull();
    expect(session!.isRevoked).toBe(false);
  });

  it('sets refresh token as httpOnly cookie', async () => {
    const otp = '556677';
    await plantOtp(TEST_EMAIL_TEACHER, 'signup', otp);

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL_TEACHER, code: otp, purpose: 'signup', password: TEST_PASSWORD });

    const cookieHeader = res.headers['set-cookie'] as unknown as string | string[];
    const cookies = Array.isArray(cookieHeader) ? cookieHeader : [cookieHeader];
    expect(cookies).toBeDefined();
    const refreshCookie = cookies.find((c: string) => c.startsWith('abjad_session='));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain('HttpOnly');
  });

  it('marks user as email verified', async () => {
    const otp = '112244';
    await plantOtp(TEST_EMAIL_TEACHER, 'signup', otp);
    await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL_TEACHER, code: otp, purpose: 'signup', password: TEST_PASSWORD });

    const user = await User.findOne({ email: TEST_EMAIL_TEACHER });
    expect(user!.isEmailVerified).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════
// 3. POST /api/auth/verify-otp — Existing User (Login)
// ════════════════════════════════════════════════════════════

describe('POST /api/auth/verify-otp — existing user login', () => {
  it('returns isNewUser=false on second login', async () => {
    // First: register
    await registerUser(TEST_EMAIL_TEACHER, 'teacher', '100001');

    // Second: login
    const loginOtp = '200002';
    await plantOtp(TEST_EMAIL_TEACHER, 'login', loginOtp);
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL_TEACHER, code: loginOtp, purpose: 'login' });

    expect(res.status).toBe(200);
    expect(res.body.data.isNewUser).toBe(false);
    expect(res.body.data.nextStep).toBeUndefined();
  });

  it('does not create a duplicate user on second login', async () => {
    await registerUser(TEST_EMAIL_TEACHER, 'teacher', '100001');
    const loginOtp = '300003';
    await plantOtp(TEST_EMAIL_TEACHER, 'login', loginOtp);
    await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL_TEACHER, code: loginOtp, purpose: 'login' });

    const count = await User.countDocuments({ email: TEST_EMAIL_TEACHER });
    expect(count).toBe(1);
  });

  it('issues fresh tokens on each login', async () => {
    await registerUser(TEST_EMAIL_TEACHER, 'teacher', '100001');

    const loginOtp = '400004';
    await plantOtp(TEST_EMAIL_TEACHER, 'login', loginOtp);
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL_TEACHER, code: loginOtp, purpose: 'login' });

    expect(res.body.data.tokens.accessToken).toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════
// 4. POST /api/auth/verify-otp — Error Cases
// ════════════════════════════════════════════════════════════

describe('POST /api/auth/verify-otp — error cases', () => {
  it('does not create an account on login purpose for an unknown email (LOGIN-002 defense in depth)', async () => {
    // Simulate a direct verify-otp call that bypassed sendOtp's guard: a valid
    // OTP is planted for login on an email with no User row.
    await plantOtp('nouser@test.com', 'login', '123456');

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: 'nouser@test.com', code: '123456', purpose: 'login' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(await User.findOne({ email: 'nouser@test.com' })).toBeNull();
  });

  it('returns 404 when no OTP exists for email', async () => {
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL_TEACHER, code: '999999', purpose: 'signup', password: TEST_PASSWORD });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 for wrong OTP code', async () => {
    await plantOtp(TEST_EMAIL_TEACHER, 'signup', '111111');

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL_TEACHER, code: '999999', purpose: 'signup', password: TEST_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Invalid OTP');
  });

  it('increments attempt counter on wrong OTP', async () => {
    await plantOtp(TEST_EMAIL_TEACHER, 'signup', '111111');

    await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL_TEACHER, code: '999999', purpose: 'signup', password: TEST_PASSWORD });

    const record = await OtpCode.findOne({ email: TEST_EMAIL_TEACHER, purpose: 'signup' });
    expect(record!.attempts).toBe(1);
  });

  it('returns 400 for invalid email in verify-otp', async () => {
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: 'bad-email', code: '123456', purpose: 'signup' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when code is not 6 digits', async () => {
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL_TEACHER, code: '123', purpose: 'signup' });

    expect(res.status).toBe(400);
  });

  it('returns 429 when OTP attempts exceed max (3)', async () => {
    // Plant OTP with attempts already at max
    await OtpCode.findOneAndUpdate(
      { email: TEST_EMAIL_TEACHER, purpose: 'signup' },
      {
        code: await hashOtp('111111'),
        expiresAt: otpExpiry(),
        attempts: 3, // already at maxAttempts
      },
      { upsert: true, new: true },
    );

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL_TEACHER, code: '999999', purpose: 'signup', password: TEST_PASSWORD });

    expect(res.status).toBe(429);
    expect(res.body.message).toContain('locked');
  });

  it('returns 400 for invalid role value', async () => {
    await plantOtp(TEST_EMAIL_TEACHER, 'signup', '123456');

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL_TEACHER, code: '123456', purpose: 'signup', role: 'admin' });

    expect(res.status).toBe(400);
  });
});

// ════════════════════════════════════════════════════════════
// 5. POST /api/auth/refresh
// ════════════════════════════════════════════════════════════

describe('POST /api/auth/refresh', () => {
  it('returns a new access token with a valid refresh token cookie', async () => {
    const agent = request.agent(app);

    // Register to get cookies set
    const otp = '500005';
    await plantOtp(TEST_EMAIL_TEACHER, 'signup', otp);
    await agent
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL_TEACHER, code: otp, purpose: 'signup', role: 'teacher', password: TEST_PASSWORD });

    const res = await agent.post('/api/auth/refresh');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it('returns 400 when no refresh token is provided', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(400);
  });

  it('returns error for an invalid/tampered refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'tampered.token.value' });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).toBe(false);
  });

  it('does not rotate the refresh token — session stays valid and token is unchanged', async () => {
    const agent = request.agent(app);

    const otp = '600006';
    await plantOtp(TEST_EMAIL_TEACHER, 'signup', otp);
    const verifyRes = await agent
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL_TEACHER, code: otp, purpose: 'signup', role: 'teacher', password: TEST_PASSWORD });

    const user = await User.findOne({ email: TEST_EMAIL_TEACHER });
    const originalCookie = (verifyRes.headers['set-cookie'] as unknown as string[]).find((c: string) =>
      c.startsWith('abjad_session=')
    );
    const originalToken = originalCookie!.split(';')[0].split('=')[1];

    // First refresh — must NOT revoke or rotate the session
    const res1 = await agent.post('/api/auth/refresh');
    expect(res1.status).toBe(200);
    const res1Cookie = (res1.headers['set-cookie'] as unknown as string[]).find((c: string) =>
      c.startsWith('abjad_session=')
    );
    const res1Token = res1Cookie!.split(';')[0].split('=')[1];
    expect(res1Token).toBe(originalToken);

    // Still exactly 1 session for this user, and it is NOT revoked
    const sessions = await Session.find({ userId: user!._id });
    expect(sessions.length).toBe(1);
    expect(sessions[0].isRevoked).toBe(false);

    // Second refresh with the SAME token still succeeds — this is the key
    // regression test for the login-loop bug (idempotent refresh, no rotation).
    const res2 = await agent.post('/api/auth/refresh');
    expect(res2.status).toBe(200);
    expect(res2.body.data.accessToken).toBeTruthy();

    // Still exactly 1 session, still not revoked
    const sessionsAfter = await Session.find({ userId: user!._id });
    expect(sessionsAfter.length).toBe(1);
    expect(sessionsAfter[0].isRevoked).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// 6. GET /api/auth/me
// ════════════════════════════════════════════════════════════

describe('GET /api/auth/me', () => {
  it('returns current user data with a valid access token', async () => {
    const otp = '700007';
    await plantOtp(TEST_EMAIL_TEACHER, 'signup', otp);
    const signupRes = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL_TEACHER, code: otp, purpose: 'signup', role: 'teacher', password: TEST_PASSWORD });

    const { accessToken } = signupRes.body.data.tokens;

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(TEST_EMAIL_TEACHER);
    expect(res.body.data.role).toBe('teacher');
  });

  it('returns 401 without Authorization header', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 with a tampered token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer tampered.jwt.token');

    expect(res.status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════
// 7. GET /api/auth/sessions
// ════════════════════════════════════════════════════════════

describe('GET /api/auth/sessions', () => {
  it('returns active sessions for authenticated user', async () => {
    const otp = '800008';
    await plantOtp(TEST_EMAIL_TEACHER, 'signup', otp);
    const signupRes = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL_TEACHER, code: otp, purpose: 'signup', role: 'teacher', password: TEST_PASSWORD });

    const { accessToken } = signupRes.body.data.tokens;

    const res = await request(app)
      .get('/api/auth/sessions')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/auth/sessions');
    expect(res.status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════
// 8. POST /api/auth/logout
// ════════════════════════════════════════════════════════════

describe('POST /api/auth/logout', () => {
  it('revokes current session on logout', async () => {
    const agent = request.agent(app);

    const otp = '900009';
    await plantOtp(TEST_EMAIL_TEACHER, 'signup', otp);
    const signupRes = await agent
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL_TEACHER, code: otp, purpose: 'signup', role: 'teacher', password: TEST_PASSWORD });

    const { accessToken } = signupRes.body.data.tokens;

    const res = await agent
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const user = await User.findOne({ email: TEST_EMAIL_TEACHER });
    const activeSessions = await Session.find({ userId: user!._id, isRevoked: false });
    expect(activeSessions.length).toBe(0);
  });

  it('returns 401 without Authorization token', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════
// 9. POST /api/auth/logout-all
// ════════════════════════════════════════════════════════════

describe('POST /api/auth/logout-all', () => {
  it('revokes all sessions for the user', async () => {
    // Create two sessions (two logins)
    const otp1 = '101010';
    await plantOtp(TEST_EMAIL_TEACHER, 'signup', otp1);
    const signupRes = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL_TEACHER, code: otp1, purpose: 'signup', role: 'teacher', password: TEST_PASSWORD });
    const { accessToken } = signupRes.body.data.tokens;

    const otp2 = '202020';
    await plantOtp(TEST_EMAIL_TEACHER, 'login', otp2);
    await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL_TEACHER, code: otp2, purpose: 'login' });

    const res = await request(app)
      .post('/api/auth/logout-all')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const user = await User.findOne({ email: TEST_EMAIL_TEACHER });
    const activeSessions = await Session.find({ userId: user!._id, isRevoked: false });
    expect(activeSessions.length).toBe(0);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/auth/logout-all');
    expect(res.status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════
// 10. Role-based access control
// ════════════════════════════════════════════════════════════

describe('Role-based access — teacher vs school', () => {
  it('teacher token has role=teacher in /me response', async () => {
    const otp = '303030';
    await plantOtp(TEST_EMAIL_TEACHER, 'signup', otp);
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL_TEACHER, code: otp, purpose: 'signup', role: 'teacher', password: TEST_PASSWORD });

    const { accessToken } = res.body.data.tokens;
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(meRes.body.data.role).toBe('teacher');
  });

  it('school token has role=school in /me response', async () => {
    const otp = '404040';
    await plantOtp(TEST_EMAIL_SCHOOL, 'signup', otp);
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL_SCHOOL, code: otp, purpose: 'signup', role: 'school', password: TEST_PASSWORD });

    const { accessToken } = res.body.data.tokens;
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(meRes.body.data.role).toBe('school');
  });
});
