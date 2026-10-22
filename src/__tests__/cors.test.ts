/**
 * CORS allowlist regression (SEC-001): the API must never reflect an
 * arbitrary Origin with credentials, or any site can read /auth/refresh.
 */
import request from 'supertest';
import app from '../app';

const preflight = (origin: string) =>
  request(app)
    .options('/api/auth/refresh')
    .set('Origin', origin)
    .set('Access-Control-Request-Method', 'POST');

describe('CORS allowlist', () => {
  it.each(['https://hiring.abjadteach.com', 'https://hiring-admin.abjadteach.com'])('allows %s', async (origin) => {
    const res = await preflight(origin);
    expect(res.headers['access-control-allow-origin']).toBe(origin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it.each(['https://evil.example.com', 'https://hiring.abjadteach.com.evil.com', 'null'])('rejects %s', async (origin) => {
    const res = await preflight(origin);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('CORS allowlist in production', () => {
  it('excludes localhost and ignores CLIENT_URL', () => {
    const prev = { env: process.env.NODE_ENV, url: process.env.CLIENT_URL };
    process.env.NODE_ENV = 'production';
    process.env.CLIENT_URL = 'https://stale.vercel.app';
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { config } = require('../config');
      expect(config.cors.origin).toEqual(['https://hiring.abjadteach.com', 'https://hiring-admin.abjadteach.com']);
    });
    process.env.NODE_ENV = prev.env;
    process.env.CLIENT_URL = prev.url;
  });
});
