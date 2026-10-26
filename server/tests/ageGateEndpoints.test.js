const request = require('supertest');

jest.setTimeout(30000);

// POST /api/users/me/age-gate, the ageGate block on GET /api/users/me, and the birth-date lock
// on PUT /api/users/:id. Real dev DB; auth is mocked.
jest.mock('../utils/auth', () => {
  const tokenMap = {
    tok_adult: { id: 'agt_test_adult', name: 'Adult' },
    tok_minor: { id: 'agt_test_minor', name: 'Minor' },
    tok_child: { id: 'agt_test_child', name: 'Child' },
    tok_fresh: { id: 'agt_test_fresh', name: 'Fresh Person' },
  };
  const userFor = (req) => tokenMap[(req.headers.authorization || '').split(' ')[1]];
  return {
    authenticateToken: (req, res, next) => {
      const user = userFor(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      req.user = user;
      return next();
    },
    attachOptionalUser: (req, _res, next) => {
      const user = userFor(req);
      if (user) req.user = user;
      next();
    },
    invalidateAccountState: jest.fn(),
  };
});
jest.mock('../workers/reviewWorker', () => ({ processReviewQueue: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../workers/cleanupWorker', () => ({
  startCleanupWorker: jest.fn().mockResolvedValue(undefined),
  runCleanup: jest.fn().mockResolvedValue(undefined),
}));

const { prisma } = require('../services/gameService');
const { app } = require('../index');
const { LEGAL_VERSION } = require('../shared/ageGate');

const ymd = (yearsAgo) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - yearsAgo);
  d.setUTCDate(d.getUTCDate() - 30); // a month past the birthday, clear of boundary flakiness
  return d.toISOString().slice(0, 10);
};

const ids = ['agt_test_adult', 'agt_test_minor', 'agt_test_child', 'agt_test_fresh'];
const auth = (tok) => ({ Authorization: `Bearer ${tok}` });
const gate = (tok, body) => request(app).post('/api/users/me/age-gate').set(auth(tok)).send(body);

describe('age gate endpoints', () => {
  const cleanup = () => prisma.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {});

  beforeAll(async () => {
    await cleanup();
    for (const id of ['agt_test_adult', 'agt_test_minor', 'agt_test_child']) {
      await prisma.user.create({ data: { id, name: id } });
    }
  });
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test('GET /me reports NEEDS_BIRTHDATE for a user without a birth date', async () => {
    const res = await request(app).get('/api/users/me').set(auth('tok_adult'));
    expect(res.status).toBe(200);
    expect(res.body.ageGate).toMatchObject({ status: 'NEEDS_BIRTHDATE', minAge: 13, adultAge: 18, legalVersion: LEGAL_VERSION });
  });

  test('rejects a missing or implausible birth date', async () => {
    expect((await gate('tok_adult', { acceptTerms: true })).body.code).toBe('INVALID_BIRTHDATE');
    expect((await gate('tok_adult', { birthDate: '2999-01-01', acceptTerms: true })).body.code).toBe('INVALID_BIRTHDATE');
  });

  test('adult must accept terms, then passes', async () => {
    const noTerms = await gate('tok_adult', { birthDate: ymd(30) });
    expect(noTerms.status).toBe(400);
    expect(noTerms.body.code).toBe('TERMS_REQUIRED');

    const ok = await gate('tok_adult', { birthDate: ymd(30), acceptTerms: true });
    expect(ok.status).toBe(200);
    expect(ok.body.ageGate.status).toBe('OK');
    const row = await prisma.user.findUnique({ where: { id: 'agt_test_adult' } });
    expect(row.termsVersion).toBe(LEGAL_VERSION);
    expect(row.guardianConsentAt).toBeNull();
  });

  test('a stored birth date cannot be changed through the gate or the profile', async () => {
    const viaGate = await gate('tok_adult', { birthDate: ymd(40), acceptTerms: true });
    expect(viaGate.status).toBe(409);
    expect(viaGate.body.code).toBe('BIRTHDATE_LOCKED');

    const viaProfile = await request(app).put('/api/users/agt_test_adult').set(auth('tok_adult')).send({ birthDate: ymd(40) });
    expect(viaProfile.status).toBe(409);
    const clear = await request(app).put('/api/users/agt_test_adult').set(auth('tok_adult')).send({ birthDate: null });
    expect(clear.status).toBe(409);

    const same = await request(app)
      .put('/api/users/agt_test_adult')
      .set(auth('tok_adult'))
      .send({ birthDate: new Date(ymd(30)).toISOString(), city: 'חיפה' });
    expect(same.status).toBe(200);
  });

  test('minor needs the guardian declaration', async () => {
    const noConsent = await gate('tok_minor', { birthDate: ymd(15), acceptTerms: true });
    expect(noConsent.status).toBe(400);
    expect(noConsent.body.code).toBe('GUARDIAN_CONSENT_REQUIRED');

    const ok = await gate('tok_minor', { birthDate: ymd(15), acceptTerms: true, guardianConsent: true });
    expect(ok.body.ageGate.status).toBe('OK');
    const row = await prisma.user.findUnique({ where: { id: 'agt_test_minor' } });
    expect(row.guardianConsentAt).not.toBeNull();
  });

  test('under 13: birth date is stored and the account stays gated', async () => {
    const res = await gate('tok_child', { birthDate: ymd(11), acceptTerms: true, guardianConsent: true });
    expect(res.status).toBe(200);
    expect(res.body.ageGate.status).toBe('UNDER_MIN_AGE');
    const row = await prisma.user.findUnique({ where: { id: 'agt_test_child' } });
    expect(row.birthDate).not.toBeNull();
    expect(row.termsAcceptedAt).toBeNull();
  });

  test('creates the user row if it does not exist yet', async () => {
    const res = await gate('tok_fresh', { birthDate: ymd(25), acceptTerms: true });
    expect(res.status).toBe(200);
    expect(res.body.ageGate.status).toBe('OK');
  });
});
