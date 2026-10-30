/**
 * Limiter keying tests (B1, B2). The real limiters skip themselves when
 * NODE_ENV=test, so flip to 'production' for the duration of this file and
 * mount them on a throwaway app. `trust proxy` is enabled on that app only so
 * each test can pick its own client IP via X-Forwarded-For.
 */
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import {
  refreshLimiter,
  setPasswordLimiter,
  changePasswordLimiter,
  resetPasswordLimiter,
  passwordIpLimiter,
} from '../rateLimiter';

const COOKIE = 'abjad_session'; // config.cookie.refreshTokenName outside production
const ok = (_req: express.Request, res: express.Response) => { res.json({ ok: true }); };
const fakeAuth: express.RequestHandler = (req, _res, next) => {
  const id = req.header('x-user');
  if (id) (req as any).user = { userId: id };
  next();
};

const app = express();
app.set('trust proxy', true);
app.use(express.json());
app.use(cookieParser());
app.post('/refresh', refreshLimiter, ok);
app.post('/validated-reset', (req, res, next) => (typeof req.body?.email === 'string' && req.body.email.includes('@') ? next() : res.status(400).json({ ok: false })), resetPasswordLimiter, ok);
app.post('/set', fakeAuth, passwordIpLimiter, setPasswordLimiter, ok);
app.post('/change', fakeAuth, passwordIpLimiter, changePasswordLimiter, ok);
app.post('/reset', passwordIpLimiter, resetPasswordLimiter, ok);

const prevEnv = process.env.NODE_ENV;
beforeAll(() => { process.env.NODE_ENV = 'production'; });
afterAll(() => { process.env.NODE_ENV = prevEnv; });

describe('refreshLimiter (B1)', () => {
  it('cookieless calls never consume anyone\'s budget', async () => {
    const ip = '10.1.0.1';
    for (let i = 0; i < 15; i++) {
      await request(app).post('/refresh').set('X-Forwarded-For', ip);
    }
    const res = await request(app).post('/refresh').set('X-Forwarded-For', ip).set('Cookie', `${COOKIE}=real-session-a`);
    expect(res.status).toBe(200);
    // 15 cookieless calls were made first; none of them touched this budget.
    expect(res.headers['ratelimit-remaining']).toBe('29');
  });

  it('is keyed per session: users on one IP have independent budgets', async () => {
    const ip = '10.1.0.2';
    for (let i = 0; i < 30; i++) {
      const r = await request(app).post('/refresh').set('X-Forwarded-For', ip).set('Cookie', `${COOKIE}=sess-one`);
      expect(r.status).toBe(200);
    }
    expect((await request(app).post('/refresh').set('X-Forwarded-For', ip).set('Cookie', `${COOKIE}=sess-one`)).status).toBe(429);
    expect((await request(app).post('/refresh').set('X-Forwarded-For', ip).set('Cookie', `${COOKIE}=sess-two`)).status).toBe(200);
  });

  it('a non-string refresh token is treated as no token (never a 500, never counted)', async () => {
    const ip = '10.1.0.4';
    for (const body of [{ refreshToken: { $ne: 1 } }, { refreshToken: ['a'] }, { refreshToken: 5 }]) {
      const r = await request(app).post('/refresh').set('X-Forwarded-For', ip).send(body);
      expect(r.status).toBe(200);
      expect(r.headers['ratelimit-remaining']).toBeUndefined();
    }
  });

  it('also keys a body-supplied refresh token', async () => {
    const r = await request(app).post('/refresh').set('X-Forwarded-For', '10.1.0.3').send({ refreshToken: 'body-token' });
    expect(r.status).toBe(200);
    expect(r.headers['ratelimit-remaining']).toBe('29');
  });
});

describe('password limiters (B2)', () => {
  it('set/change: 3 per hour per user id, independent across users on the same IP', async () => {
    const ip = '10.2.0.1';
    for (let i = 0; i < 3; i++) {
      expect((await request(app).post('/change').set('X-Forwarded-For', ip).set('x-user', 'alice')).status).toBe(200);
    }
    expect((await request(app).post('/change').set('X-Forwarded-For', ip).set('x-user', 'alice')).status).toBe(429);
    expect((await request(app).post('/change').set('X-Forwarded-For', ip).set('x-user', 'bob')).status).toBe(200);
  });

  it('set and change are separate buckets for the same user', async () => {
    const ip = '10.2.0.2';
    for (let i = 0; i < 3; i++) await request(app).post('/change').set('X-Forwarded-For', ip).set('x-user', 'carol');
    expect((await request(app).post('/change').set('X-Forwarded-For', ip).set('x-user', 'carol')).status).toBe(429);
    expect((await request(app).post('/set').set('X-Forwarded-For', ip).set('x-user', 'carol')).status).toBe(200);
  });

  it('reset: 10 per hour per normalized email; case/whitespace variants share a bucket; other emails unaffected; 429 says when to retry', async () => {
    const ip = '10.2.0.3';
    const send = (email: string) => request(app).post('/reset').set('X-Forwarded-For', ip).send({ email });
    const variants = ['dave@test.com', 'DAVE@test.com', ' dave@test.com '];
    for (let i = 0; i < 10; i++) expect((await send(variants[i % 3])).status).toBe(200);
    const blocked = await send('dave@test.com');
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toMatch(/Try again in \d+ minutes?/);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect((await send('erin@test.com')).status).toBe(200);
  });

  it('a reset is not blocked by exhausted change-password attempts (recovery path stays open)', async () => {
    const ip = '10.2.0.4';
    for (let i = 0; i < 4; i++) await request(app).post('/change').set('X-Forwarded-For', ip).set('x-user', 'frank');
    expect((await request(app).post('/reset').set('X-Forwarded-For', ip).send({ email: 'frank@test.com' })).status).toBe(200);
  });

  it('per-IP backstop: 30/hour across many accounts, then 429 for a brand-new account', async () => {
    const ip = '10.2.0.5';
    for (let i = 0; i < 30; i++) {
      const r = await request(app).post('/reset').set('X-Forwarded-For', ip).send({ email: `spray${i}@test.com` });
      expect(r.status).toBe(200);
    }
    const r = await request(app).post('/reset').set('X-Forwarded-For', ip).send({ email: 'spray-new@test.com' });
    expect(r.status).toBe(429);
  });
});

describe('limiter behaviour (B2 nits)', () => {
  it('a 400 validation failure placed before the limiter does not consume a slot', async () => {
    const ip = '10.3.0.1';
    const send = (email: string) => request(app).post('/validated-reset').set('X-Forwarded-For', ip).send({ email });
    for (let i = 0; i < 12; i++) expect((await send('not-an-email')).status).toBe(400);
    const ok1 = await send('gina@test.com');
    expect(ok1.status).toBe(200);
    expect(ok1.headers['ratelimit-remaining']).toBe('9');
  });

  it('AUTH_THROTTLE_DISABLED=true switches the limiters off', async () => {
    process.env.AUTH_THROTTLE_DISABLED = 'true';
    try {
      const ip = '10.3.0.2';
      for (let i = 0; i < 15; i++) {
        expect((await request(app).post('/change').set('X-Forwarded-For', ip).set('x-user', 'hank')).status).toBe(200);
        expect((await request(app).post('/refresh').set('X-Forwarded-For', ip).set('Cookie', `${COOKIE}=hank-sess`)).status).toBe(200);
      }
    } finally {
      delete process.env.AUTH_THROTTLE_DISABLED;
    }
  });
});
