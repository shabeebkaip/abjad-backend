/**
 * Auth Module — Password-Auth Integration Tests (Milestone 1)
 *
 * Covers: POST /auth/login, /auth/set-password, /auth/change-password,
 * /auth/reset-password, and signup-with-required-password.
 * Uses mongodb-memory-server (configured in jest.setup.js), same as auth.test.ts.
 */

import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../../app';
import OtpCode from '../../../models/otp-code.model';
import User from '../../../models/user.model';
import Session from '../../../models/session.model';
import { hashOtp, otpExpiry } from '../../../utils/otp.util';
import { hashPassword } from '../../../utils/password.util';
import { signAccessToken, signRefreshToken, hashToken } from '../../../utils/jwt.util';

// config.cookie.refreshTokenName in test/dev (NODE_ENV !== 'production').
const REFRESH_COOKIE_NAME = 'abjad_session';

const TEST_EMAIL = 'pwuser@test.com';
const TEST_PASSWORD = 'Correct-Horse-9';
const NEW_PASSWORD = 'Battery-Staple-7';

async function plantOtp(email: string, purpose: 'signup' | 'login' | 'reset', otp: string) {
  const hashed = await hashOtp(otp);
  await OtpCode.findOneAndUpdate(
    { email: email.toLowerCase(), purpose },
    { code: hashed, expiresAt: otpExpiry(), attempts: 0 },
    { upsert: true, new: true },
  );
}

/** Create a teacher user directly with a known password hash (bypasses OTP signup). */
async function createUserWithPassword(email: string, password: string, role: 'teacher' | 'school' = 'teacher') {
  const passwordHash = await hashPassword(password);
  return User.create({
    email: email.toLowerCase(),
    role,
    firstName: 'Test',
    lastName: 'User',
    password: passwordHash,
    status: 'active',
  });
}

/** Create an OTP-only user (no password) — simulates a pre-existing account. */
async function createOtpOnlyUser(email: string, role: 'teacher' | 'school' = 'teacher') {
  return User.create({
    email: email.toLowerCase(),
    role,
    firstName: 'Otp',
    lastName: 'Only',
    status: 'active',
  });
}

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
// 1. POST /api/auth/verify-otp — signup now requires a password
// ════════════════════════════════════════════════════════════

describe('POST /api/auth/verify-otp — signup requires a password', () => {
  it('creates the account and persists a usable password hash', async () => {
    const otp = '111222';
    await plantOtp(TEST_EMAIL, 'signup', otp);

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL, code: otp, purpose: 'signup', role: 'teacher', password: TEST_PASSWORD });

    expect(res.status).toBe(200);

    // Password login must now work with the password supplied at signup.
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.user.email).toBe(TEST_EMAIL);
  });

  // Rollout decision 2026-09-20: password at signup is OPTIONAL for now (the
  // current frontend doesn't send one yet) — TODO(M3) flips this to required.
  it('signup without a password succeeds, creates an OTP-only user, who can then set-password and log in with it', async () => {
    const otp = '222333';
    await plantOtp(TEST_EMAIL, 'signup', otp);

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL, code: otp, purpose: 'signup', role: 'teacher' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const user = await User.findOne({ email: TEST_EMAIL }).select('+password');
    expect(user!.password).toBeFalsy();

    // OTP-only user can set a password later, and it then works at /auth/login.
    const accessToken = res.body.data.tokens.accessToken;
    const setRes = await request(app)
      .post('/api/auth/set-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ newPassword: TEST_PASSWORD });
    expect(setRes.status).toBe(200);

    const loginRes = await request(app).post('/api/auth/login').send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    expect(loginRes.status).toBe(200);
  });

  it('returns 400 when password is shorter than 8 characters', async () => {
    const otp = '333444';
    await plantOtp(TEST_EMAIL, 'signup', otp);

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL, code: otp, purpose: 'signup', role: 'teacher', password: 'Sh0rt!' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for a common/blocklisted password', async () => {
    const otp = '444555';
    await plantOtp(TEST_EMAIL, 'signup', otp);

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL, code: otp, purpose: 'signup', role: 'teacher', password: 'password123' });

    expect(res.status).toBe(400);
  });

  it('never stores the plaintext password', async () => {
    const otp = '555666';
    await plantOtp(TEST_EMAIL, 'signup', otp);
    await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL, code: otp, purpose: 'signup', role: 'teacher', password: TEST_PASSWORD });

    const user = await User.findOne({ email: TEST_EMAIL }).select('+password');
    expect(user!.password).toBeDefined();
    expect(user!.password).not.toBe(TEST_PASSWORD);
  });
});

// ════════════════════════════════════════════════════════════
// 2. POST /api/auth/login
// ════════════════════════════════════════════════════════════

describe('POST /api/auth/login', () => {
  it('logs in successfully with the correct password and sets the session cookie', async () => {
    await createUserWithPassword(TEST_EMAIL, TEST_PASSWORD);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens.accessToken).toBeTruthy();
    expect(res.body.data.user.email).toBe(TEST_EMAIL);

    const cookies = (res.headers['set-cookie'] as unknown as string[]) || [];
    const refreshCookie = cookies.find((c) => c.startsWith('abjad_session='));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain('HttpOnly');
  });

  it('the password-login session survives /refresh using ONLY the cookie (Plan Risk #4 — no login-loop)', async () => {
    await createUserWithPassword(TEST_EMAIL, TEST_PASSWORD);
    const agent = request.agent(app); // persists cookies across requests, like a browser

    const loginRes = await agent.post('/api/auth/login').send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.tokens.accessToken).toBeTruthy();

    // No Authorization header — only the cookie the agent captured from login.
    const refreshRes = await agent.post('/api/auth/refresh');
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.accessToken).toBeTruthy();
    // NOT asserting it differs from originalAccessToken: JWTs are
    // second-granularity (iat), so a login immediately followed by a
    // refresh within the same clock second can legitimately mint a
    // byte-identical token — that's not a bug, just not a useful signal here.

    // And the refreshed access token actually works.
    const meRes = await agent.get('/api/auth/me').set('Authorization', `Bearer ${refreshRes.body.data.accessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.email).toBe(TEST_EMAIL);
  });

  it('rejects a wrong password with a generic 401', async () => {
    await createUserWithPassword(TEST_EMAIL, TEST_PASSWORD);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: 'totally-wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  it('rejects an unknown email with the SAME generic 401 (no enumeration)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.com', password: 'whatever-password' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  it('rejects an OTP-only user (no password set) with the SAME generic 401', async () => {
    await createOtpOnlyUser(TEST_EMAIL);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: 'anything-at-all' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  it('rejects an admin account (must use /admin/auth/login) with the SAME generic 401', async () => {
    await createUserWithPassword(TEST_EMAIL, TEST_PASSWORD, 'teacher');
    await User.updateOne({ email: TEST_EMAIL }, { role: 'admin' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  it('locks the account after 5 failed password attempts', async () => {
    await createUserWithPassword(TEST_EMAIL, TEST_PASSWORD);

    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/login').send({ email: TEST_EMAIL, password: 'wrong' });
    }

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD }); // even the CORRECT password is now blocked

    expect(res.status).toBe(429);

    const user = await User.findOne({ email: TEST_EMAIL });
    expect(user!.lockedUntil).toBeDefined();
    expect(user!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  // NOTE (Bug 1, human decision): each method keeps its OWN attempt
  // threshold — password locks at 5 failed attempts, OTP locks at 3 wrong
  // codes for the same purpose (config.otp.maxAttempts) — there is NO
  // single combined counter. What IS shared is the resulting `lockedUntil`:
  // whichever method trips its own threshold first sets the one lock field
  // on the User row, and `assertAccountNotLocked()` (auth.service.ts) is
  // checked by sendOtp/verifyOtp/login/resetPassword alike, so the lock set
  // by one method blocks every method until it expires. These next two
  // tests prove that in both directions.
  it('a PASSWORD-triggered lock (5 failed) also blocks OTP verify — shared lockedUntil, not a combined counter', async () => {
    await createUserWithPassword(TEST_EMAIL, TEST_PASSWORD);
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/login').send({ email: TEST_EMAIL, password: 'wrong' });
    }

    const otp = '666777';
    await plantOtp(TEST_EMAIL, 'login', otp);
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL, code: otp, purpose: 'login' });

    expect(res.status).toBe(429);
  });

  it('an OTP-triggered lock (3 wrong codes) also blocks password login — the reverse direction', async () => {
    await createUserWithPassword(TEST_EMAIL, TEST_PASSWORD);
    const otp = '112233';
    await plantOtp(TEST_EMAIL, 'login', otp);

    // config.otp.maxAttempts is 3 — the 4th verify (any code) is the one
    // that finds attempts >= max and applies the lock.
    for (let i = 0; i < 4; i++) {
      await request(app).post('/api/auth/verify-otp').send({ email: TEST_EMAIL, code: '000000', purpose: 'login' });
    }

    const user = await User.findOne({ email: TEST_EMAIL });
    expect(user!.lockedUntil).toBeDefined();
    expect(user!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD }); // even the CORRECT password is now blocked

    expect(res.status).toBe(429);
  });

  it('returns 400 for missing password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: TEST_EMAIL });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email format', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email', password: 'whatever123' });
    expect(res.status).toBe(400);
  });

  it('a successful login resets the failed-attempt counter', async () => {
    await createUserWithPassword(TEST_EMAIL, TEST_PASSWORD);
    await request(app).post('/api/auth/login').send({ email: TEST_EMAIL, password: 'wrong' });
    await request(app).post('/api/auth/login').send({ email: TEST_EMAIL, password: 'wrong' });

    const res = await request(app).post('/api/auth/login').send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    expect(res.status).toBe(200);

    const user = await User.findOne({ email: TEST_EMAIL });
    expect(user!.failedLoginAttempts).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════
// 3. POST /api/auth/set-password & /api/auth/change-password
// ════════════════════════════════════════════════════════════

describe('POST /api/auth/set-password', () => {
  async function loginAccessTokenFor(otpOnlyEmail: string) {
    // OTP-only user logs in via OTP to get an access token.
    const user = await createOtpOnlyUser(otpOnlyEmail);
    const otp = '777888';
    await plantOtp(otpOnlyEmail, 'login', otp);
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: otpOnlyEmail, code: otp, purpose: 'login' });
    return { accessToken: res.body.data.tokens.accessToken as string, userId: user._id!.toString() };
  }

  it('sets a password for an OTP-only user', async () => {
    const { accessToken } = await loginAccessTokenFor(TEST_EMAIL);

    const res = await request(app)
      .post('/api/auth/set-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ newPassword: TEST_PASSWORD });

    expect(res.status).toBe(200);

    // New password must now work for /auth/login.
    const loginRes = await request(app).post('/api/auth/login').send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    expect(loginRes.status).toBe(200);
  });

  it('rejects setting a password when one already exists', async () => {
    await createUserWithPassword(TEST_EMAIL, TEST_PASSWORD);
    const loginRes = await request(app).post('/api/auth/login').send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    const accessToken = loginRes.body.data.tokens.accessToken;

    const res = await request(app)
      .post('/api/auth/set-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ newPassword: 'Another-Pass9' });

    expect(res.status).toBe(409);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/auth/set-password').send({ newPassword: TEST_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('returns 400 for a weak new password', async () => {
    const { accessToken } = await loginAccessTokenFor(TEST_EMAIL);
    const res = await request(app)
      .post('/api/auth/set-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ newPassword: 'short' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/change-password', () => {
  it('changes the password with the correct current password', async () => {
    await createUserWithPassword(TEST_EMAIL, TEST_PASSWORD);
    const loginRes = await request(app).post('/api/auth/login').send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    const accessToken = loginRes.body.data.tokens.accessToken;

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(200);

    const oldLogin = await request(app).post('/api/auth/login').send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post('/api/auth/login').send({ email: TEST_EMAIL, password: NEW_PASSWORD });
    expect(newLogin.status).toBe(200);
  });

  it('rejects an incorrect current password', async () => {
    await createUserWithPassword(TEST_EMAIL, TEST_PASSWORD);
    const loginRes = await request(app).post('/api/auth/login').send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    const accessToken = loginRes.body.data.tokens.accessToken;

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'wrong-current', newPassword: NEW_PASSWORD });

    expect(res.status).toBe(401);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('W2: revokes every OTHER session but keeps the caller\'s own current session usable', async () => {
    const user = await createUserWithPassword(TEST_EMAIL, TEST_PASSWORD);
    const payload = { userId: user._id!.toString(), role: user.role, email: user.email };
    const accessToken = signAccessToken(payload);

    // Two "devices" — minted directly (not via two real /login calls) so the
    // tokens are guaranteed distinct even if this test runs within the same
    // clock second (JWTs are second-granularity; different TTL strings force
    // different `exp`, hence different token bytes/hashes, deterministically).
    const tokenA = signRefreshToken(payload, '30d');
    const tokenB = signRefreshToken(payload, '29d');
    const farFuture = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await Session.create({ userId: user._id, refreshTokenHash: hashToken(tokenA), deviceInfo: {}, ipAddress: 'test', isRevoked: false, expiresAt: farFuture, rememberDevice: true });
    await Session.create({ userId: user._id, refreshTokenHash: hashToken(tokenB), deviceInfo: {}, ipAddress: 'test', isRevoked: false, expiresAt: farFuture, rememberDevice: true });

    // Device A changes the password, presenting its own refresh cookie.
    const changeRes = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${tokenA}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD });
    expect(changeRes.status).toBe(200);

    // Device A's own session must still work.
    const refreshA = await request(app).post('/api/auth/refresh').set('Cookie', `${REFRESH_COOKIE_NAME}=${tokenA}`);
    expect(refreshA.status).toBe(200);

    // Device B's session must be revoked.
    const refreshB = await request(app).post('/api/auth/refresh').set('Cookie', `${REFRESH_COOKIE_NAME}=${tokenB}`);
    expect(refreshB.status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════
// 4. POST /api/auth/reset-password
// ════════════════════════════════════════════════════════════

describe('POST /api/auth/reset-password', () => {
  it('resets the password with a valid reset OTP, old password stops working, new one logs in', async () => {
    await createUserWithPassword(TEST_EMAIL, TEST_PASSWORD);
    const otp = '888999';
    await plantOtp(TEST_EMAIL, 'reset', otp);

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ email: TEST_EMAIL, code: otp, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(200);

    const oldLogin = await request(app).post('/api/auth/login').send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post('/api/auth/login').send({ email: TEST_EMAIL, password: NEW_PASSWORD });
    expect(newLogin.status).toBe(200);
  });

  it('also works for an OTP-only user (adds a password via reset)', async () => {
    await createOtpOnlyUser(TEST_EMAIL);
    const otp = '999000';
    await plantOtp(TEST_EMAIL, 'reset', otp);

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ email: TEST_EMAIL, code: otp, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(200);

    const loginRes = await request(app).post('/api/auth/login').send({ email: TEST_EMAIL, password: NEW_PASSWORD });
    expect(loginRes.status).toBe(200);
  });

  it('returns 404 for an unplanted / wrong OTP', async () => {
    await createUserWithPassword(TEST_EMAIL, TEST_PASSWORD);
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ email: TEST_EMAIL, code: '000000', newPassword: NEW_PASSWORD });
    expect(res.status).toBe(404);
  });

  it('returns 401 for an incorrect reset code', async () => {
    await createUserWithPassword(TEST_EMAIL, TEST_PASSWORD);
    await plantOtp(TEST_EMAIL, 'reset', '111000');

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ email: TEST_EMAIL, code: '222000', newPassword: NEW_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('an ACTIVELY locked account cannot reset either — the lock blocks every OTP purpose, same as send-otp', async () => {
    await createUserWithPassword(TEST_EMAIL, TEST_PASSWORD);
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/login').send({ email: TEST_EMAIL, password: 'wrong' });
    }
    const otp = '333000';
    await plantOtp(TEST_EMAIL, 'reset', otp);
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ email: TEST_EMAIL, code: otp, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(429);
  });

  it('clears a lingering failed-attempt counter on successful reset (lock already expired naturally)', async () => {
    await createUserWithPassword(TEST_EMAIL, TEST_PASSWORD);
    // Simulate a lock that has since expired — leftover counter, no active lock.
    await User.updateOne({ email: TEST_EMAIL }, { failedLoginAttempts: 4, lockedUntil: new Date(Date.now() - 60_000) });

    const otp = '334000';
    await plantOtp(TEST_EMAIL, 'reset', otp);
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ email: TEST_EMAIL, code: otp, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);

    const user = await User.findOne({ email: TEST_EMAIL });
    expect(user!.failedLoginAttempts).toBe(0);
    expect(user!.lockedUntil).toBeFalsy();

    const loginRes = await request(app).post('/api/auth/login').send({ email: TEST_EMAIL, password: NEW_PASSWORD });
    expect(loginRes.status).toBe(200);
  });

  it('returns 400 for a weak new password', async () => {
    await createUserWithPassword(TEST_EMAIL, TEST_PASSWORD);
    await plantOtp(TEST_EMAIL, 'reset', '444000');
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ email: TEST_EMAIL, code: '444000', newPassword: 'weak' });
    expect(res.status).toBe(400);
  });

  it('W2: revokes every existing session — an old refresh cookie is rejected at /refresh after reset', async () => {
    await createUserWithPassword(TEST_EMAIL, TEST_PASSWORD);
    const agent = request.agent(app);
    const loginRes = await agent.post('/api/auth/login').send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    expect(loginRes.status).toBe(200);

    // Sanity: the pre-reset session works.
    const preRefresh = await agent.post('/api/auth/refresh');
    expect(preRefresh.status).toBe(200);

    const otp = '555000';
    await plantOtp(TEST_EMAIL, 'reset', otp);
    const resetRes = await request(app)
      .post('/api/auth/reset-password')
      .send({ email: TEST_EMAIL, code: otp, newPassword: NEW_PASSWORD });
    expect(resetRes.status).toBe(200);

    // The OLD session (same cookie the agent has held onto) must now be dead.
    const postRefresh = await agent.post('/api/auth/refresh');
    expect(postRefresh.status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════
// 5. W3 — suspended/blocked accounts rejected at BOTH login doors
// ════════════════════════════════════════════════════════════

describe('Suspended/blocked accounts are rejected at login (W3)', () => {
  it.each(['suspended', 'blocked'] as const)('POST /auth/login rejects a %s account with 403, matching the /me wording', async (status) => {
    await createUserWithPassword(TEST_EMAIL, TEST_PASSWORD);
    await User.updateOne({ email: TEST_EMAIL }, { status });

    const res = await request(app).post('/api/auth/login').send({ email: TEST_EMAIL, password: TEST_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe(`Account is ${status}.`);
  });

  it.each(['suspended', 'blocked'] as const)('POST /auth/verify-otp (purpose=login) rejects a %s account with 403', async (status) => {
    await createOtpOnlyUser(TEST_EMAIL);
    await User.updateOne({ email: TEST_EMAIL }, { status });

    const otp = '778899';
    await plantOtp(TEST_EMAIL, 'login', otp);
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: TEST_EMAIL, code: otp, purpose: 'login' });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe(`Account is ${status}.`);
  });

  it('a suspended user gets no cookie/session on either door', async () => {
    await createUserWithPassword(TEST_EMAIL, TEST_PASSWORD);
    await User.updateOne({ email: TEST_EMAIL }, { status: 'suspended' });

    const res = await request(app).post('/api/auth/login').send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    expect(res.status).toBe(403);
    expect(res.headers['set-cookie']).toBeUndefined();

    const sessionCount = await Session.countDocuments({});
    expect(sessionCount).toBe(0);
  });
});
