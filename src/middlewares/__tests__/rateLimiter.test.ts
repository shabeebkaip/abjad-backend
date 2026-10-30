/**
 * Limiter keying tests (B1). The real limiters skip themselves when
 * NODE_ENV=test, so flip to 'production' for the duration of this file and
 * mount them on a throwaway app. `trust proxy` is enabled on that app only so
 * each test can pick its own client IP via X-Forwarded-For.
 */
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { refreshLimiter } from '../rateLimiter';

const COOKIE = 'abjad_session'; // config.cookie.refreshTokenName outside production
const ok = (_req: express.Request, res: express.Response) => { res.json({ ok: true }); };

const app = express();
app.set('trust proxy', true);
app.use(express.json());
app.use(cookieParser());
app.post('/refresh', refreshLimiter, ok);

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
    expect(res.headers['ratelimit-remaining']).toBe('9');
  });

  it('is keyed per session: users on one IP have independent budgets', async () => {
    const ip = '10.1.0.2';
    for (let i = 0; i < 10; i++) {
      const r = await request(app).post('/refresh').set('X-Forwarded-For', ip).set('Cookie', `${COOKIE}=sess-one`);
      expect(r.status).toBe(200);
    }
    expect((await request(app).post('/refresh').set('X-Forwarded-For', ip).set('Cookie', `${COOKIE}=sess-one`)).status).toBe(429);
    expect((await request(app).post('/refresh').set('X-Forwarded-For', ip).set('Cookie', `${COOKIE}=sess-two`)).status).toBe(200);
  });

  it('also keys a body-supplied refresh token', async () => {
    const r = await request(app).post('/refresh').set('X-Forwarded-For', '10.1.0.3').send({ refreshToken: 'body-token' });
    expect(r.status).toBe(200);
    expect(r.headers['ratelimit-remaining']).toBe('9');
  });
});

