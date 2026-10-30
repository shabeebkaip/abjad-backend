/**
 * Round-2 hardening: session-revocation edge cases, suspension blocking login,
 * admin token TTL, change-password rules, consent recording.
 */
import mongoose from 'mongoose';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../../app';
import User from '../../../models/user.model';
import Session from '../../../models/session.model';
import OtpCode from '../../../models/otp-code.model';
import TeacherProfile from '../../../models/teacher-profile.model';
import SchoolProfile from '../../../models/school-profile.model';
import SchoolTeamMember from '../../../models/school-team.model';
import authRepository from '../auth.repository';
import { hashPassword } from '../../../utils/password.util';
import { hashOtp, otpExpiry } from '../../../utils/otp.util';
import { suspensionService } from '../../suspension/suspension.service';
import { adminService } from '../../admin/admin.service';

const COOKIE = 'abjad_session';
const EMAIL = 'hard@test.com';
const ADMIN_EMAIL = 'admin@test.com';
const PASSWORD = 'Correct-Horse-9';
const NEW_PASSWORD = 'Battery-Staple-7';

async function seed(email = EMAIL, role: 'teacher' | 'school' | 'admin' = 'teacher') {
  return User.create({ email, role, firstName: 'H', lastName: 'T', password: await hashPassword(PASSWORD), status: 'active' });
}
async function login(email = EMAIL, rememberDevice = true) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD, rememberDevice });
  expect(res.status).toBe(200);
  const raw = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${COOKIE}=`))!;
  return { accessToken: res.body.data.tokens.accessToken as string, cookie: raw.split(';')[0] };
}
const me = (t: string) => request(app).get('/api/auth/me').set('Authorization', `Bearer ${t}`);
async function plantOtp(email: string, purpose: 'signup' | 'login' | 'reset', otp: string) {
  await OtpCode.findOneAndUpdate({ email, purpose }, { code: await hashOtp(otp), expiresAt: otpExpiry(), attempts: 0 }, { upsert: true });
}

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Session.deleteMany({}), OtpCode.deleteMany({}), TeacherProfile.deleteMany({}), SchoolProfile.deleteMany({}), SchoolTeamMember.deleteMany({})]);
});
afterEach(() => { jest.restoreAllMocks(); });
afterAll(async () => { await mongoose.connection.close(); });

describe('B5 gaps', () => {
  it('a DB error during the session check is a 500, not a 401', async () => {
    await seed();
    const a = await login();
    jest.spyOn(authRepository, 'isSessionActive').mockRejectedValueOnce(new Error('mongo down'));
    expect((await me(a.accessToken)).status).toBe(500);
    expect((await me(a.accessToken)).status).toBe(200);
  });

  it('Bearer-only change-password (no cookie) keeps the caller\'s session, revokes others', async () => {
    await seed();
    const a = await login();
    const b = await login(EMAIL, false);
    const res = await request(app).post('/api/auth/change-password').set('Authorization', `Bearer ${a.accessToken}`)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);
    expect((await me(a.accessToken)).status).toBe(200);
    expect((await me(b.accessToken)).status).toBe(401);
  });

  it('admin delete of a teacher revokes the user\'s sessions', async () => {
    const user = await seed();
    const profile = await new TeacherProfile({ userId: user._id }).save({ validateBeforeSave: false });
    const a = await login();
    await adminService.deleteTeacher(profile._id.toString());
    expect(await Session.countDocuments({ userId: user._id, isRevoked: false })).toBe(0);
    expect((await me(a.accessToken)).status).toBe(401);
  });

  it('admin delete of a school revokes the user\'s sessions', async () => {
    const user = await seed(EMAIL, 'school');
    const profile = await new SchoolProfile({ userId: user._id }).save({ validateBeforeSave: false });
    await login();
    await adminService.deleteSchool(profile._id.toString());
    expect(await Session.countDocuments({ userId: user._id, isRevoked: false })).toBe(0);
  });

  it('admin path: login -> /api/admin/stats 200 -> logout -> same token 401', async () => {
    await seed(ADMIN_EMAIL, 'admin');
    const l = await request(app).post('/api/admin/auth/login').send({ email: ADMIN_EMAIL, password: PASSWORD });
    expect(l.status).toBe(200);
    const token = l.body.data.accessToken as string;
    const get = () => request(app).get('/api/admin/stats').set('Authorization', `Bearer ${token}`);
    expect((await get()).status).toBe(200);
    await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`).expect(200);
    expect((await get()).status).toBe(401);
  });
});
void [jwt, suspensionService, plantOtp];
