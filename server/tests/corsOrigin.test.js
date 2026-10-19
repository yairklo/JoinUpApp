const express = require('express');
const cors = require('cors');
const request = require('supertest');
const { createCorsOriginCallback } = require('../utils/corsOrigin');

// A rejected Origin must not reach the global error handler (500 + Sentry report); the response
// just lacks Access-Control-Allow-Origin so the browser blocks it.
function buildApp({ permissive = false } = {}) {
  const app = express();
  const errorHandler = jest.fn((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  app.use(cors({
    origin: createCorsOriginCallback({ allowedOrigins: ['https://join-up-app.vercel.app'], permissive }),
    credentials: true,
  }));
  app.get('/api/health', (_req, res) => res.json({ status: 'OK' }));
  app.use(errorHandler);
  return { app, errorHandler };
}

describe('CORS origin policy', () => {
  let warnSpy;
  beforeEach(() => { warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => warnSpy.mockRestore());

  test('rejected origin: no CORS headers, no error handler, no 500', async () => {
    const { app, errorHandler } = buildApp();
    const res = await request(app).get('/api/health').set('Origin', 'https://not-joinup.example');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(errorHandler).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('[CORS] Rejected origin:', 'https://not-joinup.example', expect.any(Object));
  });

  test('rejected origin preflight is not answered with CORS headers', async () => {
    const { app, errorHandler } = buildApp();
    const res = await request(app)
      .options('/api/health')
      .set('Origin', 'https://not-joinup.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(errorHandler).not.toHaveBeenCalled();
  });

  test.each([
    'https://join-up-app.vercel.app',
    'https://join-up-app-git-feature-team.vercel.app',
    'http://localhost:3000',
  ])('allowed origin %s is echoed back', async (origin) => {
    const { app } = buildApp();
    const res = await request(app).get('/api/health').set('Origin', origin);
    expect(res.headers['access-control-allow-origin']).toBe(origin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  test('no Origin header (mobile / curl) passes', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });

  test('permissive mode echoes any origin', async () => {
    const { app } = buildApp({ permissive: true });
    const res = await request(app).get('/api/health').set('Origin', 'https://anything.example');
    expect(res.headers['access-control-allow-origin']).toBe('https://anything.example');
  });

  test('a lookalike vercel app is not allowed', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/health').set('Origin', 'https://evil-join-up-app.vercel.app');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
