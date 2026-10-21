const http = require('http');
const express = require('express');
const cors = require('cors');
const request = require('supertest');
const { Server } = require('socket.io');
const { createCorsOriginCallback } = require('../utils/corsOrigin');

const ALLOWED = ['https://join-up-app.vercel.app'];

// A rejected Origin must not reach the global error handler (500 + Sentry report); the response
// just lacks Access-Control-Allow-Origin so the browser blocks it.
function buildApp({ permissive = false } = {}) {
  const app = express();
  const errorHandler = jest.fn((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  app.use(cors({
    origin: createCorsOriginCallback({ allowedOrigins: ALLOWED, permissive }),
    credentials: true,
  }));
  app.get('/api/health', (_req, res) => res.json({ status: 'OK' }));
  app.use(errorHandler);
  return { app, errorHandler };
}

describe('CORS origin policy (Express)', () => {
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

  test('rejected origin is warned about once, not on every request', async () => {
    const { app } = buildApp();
    for (let i = 0; i < 3; i += 1) {
      await request(app).get('/api/health').set('Origin', 'https://repeat-scanner.example');
    }
    const calls = warnSpy.mock.calls.filter((c) => c[1] === 'https://repeat-scanner.example');
    expect(calls).toHaveLength(1);
  });

  test('rejected origin preflight: no CORS headers, not a 500', async () => {
    const { app, errorHandler } = buildApp();
    const res = await request(app)
      .options('/api/health')
      .set('Origin', 'https://not-joinup.example')
      .set('Access-Control-Request-Method', 'POST');
    // cors() steps aside, so Express's default OPTIONS reply answers; the browser still blocks it.
    expect(res.status).not.toBe(500);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(errorHandler).not.toHaveBeenCalled();
  });

  test('allowed origin preflight is answered with CORS headers', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .options('/api/health')
      .set('Origin', 'https://join-up-app.vercel.app')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://join-up-app.vercel.app');
    expect(res.headers['access-control-allow-methods']).toBeDefined();
  });

  test.each([
    'https://join-up-app.vercel.app',
    'https://join-up-bqendlnhc-yair-klausners-projects.vercel.app',
    'https://join-up-app-abc123xyz-yair-klausners-projects.vercel.app',
    'https://join-up-git-feat-cors-yair-klausners-projects.vercel.app',
    'https://join-up-app-git-feat-cors-yair-klausners-projects.vercel.app',
    'http://localhost:3000',
  ])('allowed origin %s is echoed back', async (origin) => {
    const { app } = buildApp();
    const res = await request(app).get('/api/health').set('Origin', origin);
    expect(res.headers['access-control-allow-origin']).toBe(origin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  test('no Origin header (mobile / curl) passes without CORS headers', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('permissive mode echoes any origin', async () => {
    const { app } = buildApp({ permissive: true });
    const res = await request(app).get('/api/health').set('Origin', 'https://anything.example');
    expect(res.headers['access-control-allow-origin']).toBe('https://anything.example');
  });

  test.each([
    'https://evil-join-up-app.vercel.app',
    'https://join-up-app.vercel.app.evil.com',
    'https://evil.vercel.app',
    'https://join-up-evil.vercel.app',
    'https://join-up-x-otherteam.vercel.app',
    'https://join-up-app-x-otherteam.vercel.app',
    'https://join-up-app-git-x-otherteam.vercel.app',
    'https://join-up-x-yair-klausners-projects.vercel.app.evil.com',
    'http://join-up-bqendlnhc-yair-klausners-projects.vercel.app',
    'https://join-up-bqendlnhc-yair-klausners-projects.vercel.app.evil.com',
    'https://join.up-bqendlnhc-yair-klausners-projects.vercel.app',
    'https://join-up-a.b-yair-klausners-projects.vercel.app',
    'https://evil.com/join-up-x-yair-klausners-projects.vercel.app',
    'https://join-up--yair-klausners-projects.vercel.app',
    'https://join-up-x-yair-klausners-projectsXvercel.app',
    'https://join-up-x-yair-klausners-projects.vercelXapp',
    'https://join-up-x-yair-klausners-projectsXvercelYapp',
    'https://xjoin-up-x-yair-klausners-projects.vercel.app',
  ])('lookalike origin %s is not allowed', async (origin) => {
    const { app } = buildApp();
    const res = await request(app).get('/api/health').set('Origin', origin);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

// Browsers don't enforce CORS on WebSockets, so engine.io's origin check is the only gate there.
// It only aborts the handshake when the cors middleware errors — hence rejectWithError.
describe('CORS origin policy (Socket.IO)', () => {
  let httpServer;
  let io;
  let warnSpy;

  beforeAll(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    httpServer = http.createServer();
    io = new Server(httpServer, {
      path: '/api/socket',
      cors: {
        origin: createCorsOriginCallback({ allowedOrigins: ALLOWED, permissive: false, rejectWithError: true }),
        credentials: true,
      },
    });
  });

  afterAll(async () => {
    await new Promise((resolve) => io.close(resolve));
    warnSpy.mockRestore();
  });

  const handshake = (origin) => request(httpServer)
    .get('/api/socket/?EIO=4&transport=polling')
    .set('Origin', origin);

  test('disallowed origin: polling handshake is aborted with 400', async () => {
    const res = await handshake('https://not-joinup.example');
    expect(res.status).toBe(400);
    expect(res.text).not.toContain('"sid"');
  });

  test('allowed origin: polling handshake opens a session', async () => {
    const res = await handshake('https://join-up-app.vercel.app');
    expect(res.status).toBe(200);
    expect(res.text).toContain('"sid"');
    expect(res.headers['access-control-allow-origin']).toBe('https://join-up-app.vercel.app');
  });
});

describe('Vercel preview pattern construction', () => {
  const load = (slug) => {
    jest.resetModules();
    const prev = process.env.CORS_VERCEL_TEAM_SLUG;
    if (slug === undefined) delete process.env.CORS_VERCEL_TEAM_SLUG; else process.env.CORS_VERCEL_TEAM_SLUG = slug;
    try { return require('../utils/corsOrigin'); } finally {
      if (prev === undefined) delete process.env.CORS_VERCEL_TEAM_SLUG; else process.env.CORS_VERCEL_TEAM_SLUG = prev;
    }
  };

  test('regex source has escaped dots', () => {
    const { isLocalDevOrigin } = load();
    expect(isLocalDevOrigin('https://join-up-x-yair-klausners-projects.vercel.app')).toBe(true);
    const src = require('fs').readFileSync(require.resolve('../utils/corsOrigin'), 'utf8');
    expect(src).toContain("'\\.vercel\\.app$'");
  });

  test.each(['', '...', '$$$', '.*'])('malformed slug %j falls back to default', (slug) => {
    const { isLocalDevOrigin } = load(slug);
    expect(isLocalDevOrigin('https://join-up-x-yair-klausners-projects.vercel.app')).toBe(true);
    expect(isLocalDevOrigin('https://join-up-x-other.vercel.app')).toBe(false);
  });

  test('custom slug is honoured', () => {
    const { isLocalDevOrigin } = load('my-team');
    expect(isLocalDevOrigin('https://join-up-x-my-team.vercel.app')).toBe(true);
    expect(isLocalDevOrigin('https://join-up-x-yair-klausners-projects.vercel.app')).toBe(false);
  });
});
