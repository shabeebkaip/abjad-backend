/**
 * B5 — access tokens carry the session id and authenticate rejects tokens
 * whose session is missing/revoked/expired (or that predate the sid claim).
 */
import mongoose from 'mongoose';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../../app';
import { config } from '../../../config';
import User from '../../../models/user.model';
import Session from '../../../models/session.model';
import OtpCode from '../../../models/otp-code.model';
import TeacherProfile from '../../../models/teacher-profile.model';
import { hashPassword } from '../../../utils/password.util';
import { hashOtp, otpExpiry } from '../../../utils/otp.util';
import { suspensionService } from '../../suspension/suspension.service';

const COOKIE = 'abjad_session'; // config.cookie.refreshTokenName outside production
const EMAIL = 'revoke@test.com';
const PASSWORD = 'Correct-Horse-9';

async function seedUser() {
  return User.create({ email: EMAIL, role: 'teacher', firstName: 'R', lastName: 'T', password: await hashPassword(PASSWORD), status: 'active' });
}

/** Real password login; returns the access token and the refresh cookie value. */
async function login(rememberDevice = true) {
  const res = await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD, rememberDevice });
  expect(res.status).toBe(200);
  const raw = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${COOKIE}=`))!;
  return { accessToken: res.body.data.tokens.accessToken as string, cookie: raw.split(';')[0] };
}

const me = (token: string) => request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Session.deleteMany({}), OtpCode.deleteMany({}), TeacherProfile.deleteMany({})]);
});
afterAll(async () => { await mongoose.connection.close(); });

describe('access token <-> session binding (B5)', () => {
  it('login mints a token with a sid claim that works', async () => {
    await seedUser();
    const { accessToken } = await login();
    const decoded = jwt.decode(accessToken) as any;
    const session = await Session.findOne({});
    expect(decoded.sid).toBe(session!._id.toString());
    expect((await me(accessToken)).status).toBe(200);
  });

  it('a token without the sid claim (issued before the deploy) gets 401', async () => {
    const user = await seedUser();
    const legacy = jwt.sign({ userId: user._id.toString(), role: 'teacher', email: EMAIL }, config.jwt.accessSecret, {
      expiresIn: '15m', issuer: process.env.JWT_ISSUER ?? 'abjad.sa', audience: process.env.JWT_AUDIENCE ?? 'abjad-platform', subject: user._id.toString(),
    });
    expect((await me(legacy)).status).toBe(401);
  });

  it('a token whose sid matches no session gets 401', async () => {
    await seedUser();
    const { accessToken } = await login();
    await Session.deleteMany({});
    expect((await me(accessToken)).status).toBe(401);
  });

  it('a token whose session has expired gets 401', async () => {
    await seedUser();
    const { accessToken } = await login();
    await Session.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
    expect((await me(accessToken)).status).toBe(401);
  });

  it('logout revokes the access token immediately (even with no cookie)', async () => {
    await seedUser();
    const { accessToken } = await login();
    const res = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect((await me(accessToken)).status).toBe(401);
  });

  it('logout-all kills the access tokens of every device', async () => {
    await seedUser();
    const a = await login();
    const b = await login();
    expect((await me(b.accessToken)).status).toBe(200);
    await request(app).post('/api/auth/logout-all').set('Authorization', `Bearer ${a.accessToken}`).expect(200);
    expect((await me(a.accessToken)).status).toBe(401);
    expect((await me(b.accessToken)).status).toBe(401);
  });

  it('change-password kills the other device\'s access token but keeps the caller\'s', async () => {
    await seedUser();
    const a = await login();
    const b = await login(false); // different TTL => distinct refresh token even within the same clock second
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .set('Cookie', a.cookie)
      .send({ currentPassword: PASSWORD, newPassword: 'Battery-Staple-7' });
    expect(res.status).toBe(200);
    expect((await me(b.accessToken)).status).toBe(401);
    expect((await me(a.accessToken)).status).toBe(200);
  });

  it('reset-password kills every existing access token', async () => {
    await seedUser();
    const a = await login();
    await OtpCode.create({ email: EMAIL, purpose: 'reset', code: await hashOtp('445566'), expiresAt: otpExpiry(), attempts: 0 });
    const res = await request(app).post('/api/auth/reset-password').send({ email: EMAIL, code: '445566', newPassword: 'Battery-Staple-7' });
    expect(res.status).toBe(200);
    expect((await me(a.accessToken)).status).toBe(401);
  });

  it('refresh mints a new access token bound to the same session', async () => {
    await seedUser();
    const a = await login();
    const res = await request(app).post('/api/auth/refresh').set('Cookie', a.cookie);
    expect(res.status).toBe(200);
    const fresh = res.body.data.accessToken as string;
    expect((jwt.decode(fresh) as any).sid).toBe((jwt.decode(a.accessToken) as any).sid);
    expect((await me(fresh)).status).toBe(200);
  });

  it('admin suspension revokes the user\'s sessions, killing issued access tokens', async () => {
    const user = await seedUser();
    const profile = await new TeacherProfile({ userId: user._id, profileStatus: 'approved' }).save({ validateBeforeSave: false });
    const a = await login();
    expect((await me(a.accessToken)).status).toBe(200);

    await suspensionService.suspend({ targetType: 'TeacherProfile', targetId: profile._id.toString(), reasonCode: 'policy_violation' });

    expect((await me(a.accessToken)).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', a.cookie)).status).toBe(401);
  });
});
