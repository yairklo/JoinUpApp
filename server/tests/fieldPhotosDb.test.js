const request = require('supertest');
const fs = require('fs');
const path = require('path');

jest.setTimeout(30000);

// Companion to fieldPhotos.test.js. That file stubs Prisma to cover the rules exhaustively; this
// one runs the main flow against the real database, because a stub cannot catch what the
// database itself enforces (the first cut of this feature shipped a foreign-key failure that
// only real Postgres showed). Kept small on purpose.
jest.mock('../utils/auth', () => {
  const users = {
    mock_fpdb_admin: { id: 'user_fpdb_admin', name: 'FpDbAdmin', isAdmin: true },
    mock_fpdb_member: { id: 'user_fpdb_member', name: 'FpDbMember', isAdmin: false },
    mock_fpdb_other: { id: 'user_fpdb_other', name: 'FpDbOther', isAdmin: false },
  };
  const tokenOf = (req) => {
    const h = req.headers['authorization'];
    return h && h.split(' ')[1];
  };
  return {
    authenticateToken: (req, res, next) => {
      const token = tokenOf(req);
      if (!token) return res.status(401).json({ error: 'No token provided' });
      if (!users[token]) return res.status(403).json({ error: 'Invalid token' });
      req.user = users[token];
      return next();
    },
    attachOptionalUser: (req, _res, next) => {
      const token = tokenOf(req);
      if (token && users[token]) req.user = users[token];
      next();
    },
    clerkClient: { users: { updateUserMetadata: jest.fn().mockResolvedValue({}) } },
  };
});

jest.mock('../workers/reviewWorker', () => ({ processReviewQueue: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../workers/cleanupWorker', () => ({ startCleanupWorker: jest.fn() }));

const { prisma } = require('../services/gameService');
const { app } = require('../index');
const { UPLOADS_ROOT } = require('../middleware/upload');

const USER_IDS = ['user_fpdb_admin', 'user_fpdb_member', 'user_fpdb_other'];
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const png = { filename: 'a.png', contentType: 'image/png' };

describe('Field photo gallery against the real database', () => {
  let fieldId;
  const uploadDir = path.join(UPLOADS_ROOT, 'fields');
  let filesBefore;

  const as = (token) => (r) => r.set('Authorization', `Bearer ${token}`);
  const admin = as('mock_fpdb_admin');
  const member = as('mock_fpdb_member');
  const other = as('mock_fpdb_other');
  const list = (auth) => {
    const r = request(app).get(`/api/fields/${fieldId}/photos`);
    return auth ? auth(r) : r;
  };
  const submit = (auth) => auth(request(app).post(`/api/fields/${fieldId}/photos/submit`)).attach('photo', PNG, png);

  beforeAll(async () => {
    filesBefore = new Set(fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir) : []);
    // Start from "signed in with Clerk, no row in our User table yet".
    await prisma.user.deleteMany({ where: { id: { in: USER_IDS } } });
    const field = await prisma.field.create({
      data: { name: 'FieldPhotosDbPilot', location: 'FieldPhotosDb Ave', type: 'OPEN' },
    });
    fieldId = field.id;
  });

  afterAll(async () => {
    try {
      // Deleting the field cascades to its FieldPhoto rows.
      if (fieldId) await prisma.field.deleteMany({ where: { id: fieldId } });
      await prisma.user.deleteMany({ where: { id: { in: USER_IDS } } });
    } catch (err) {
      console.warn('fieldPhotosDb cleanup skipped:', err.message);
    }
    await new Promise((r) => setTimeout(r, 100)); // let fire-and-forget unlinks settle
    if (fs.existsSync(uploadDir)) {
      for (const f of fs.readdirSync(uploadDir)) {
        if (!filesBefore.has(f)) fs.unlinkSync(path.join(uploadDir, f));
      }
    }
  });

  test('a user with no local User row can submit; the row is created for them', async () => {
    expect(await prisma.user.findUnique({ where: { id: 'user_fpdb_member' } })).toBeNull();

    const res = await submit(member);
    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe('PENDING');

    expect(await prisma.user.findUnique({ where: { id: 'user_fpdb_member' } })).not.toBeNull();
    const row = await prisma.fieldPhoto.findUnique({ where: { id: res.body.id } });
    expect(row).toMatchObject({ fieldId, uploadedById: 'user_fpdb_member', status: 'PENDING' });
  });

  test('the pending photo is visible to its uploader only', async () => {
    const mine = await list(member);
    expect(mine.statusCode).toBe(200);
    expect(mine.body.mine).toHaveLength(1);
    expect(mine.body.photos).toEqual([]);
    expect(mine.body.remaining).toBe(4);
    expect(mine.headers['cache-control']).toBe('private, no-store');

    const theirs = await list(other);
    expect(theirs.body.mine).toEqual([]);
    expect(theirs.body.photos).toEqual([]);

    const guest = await list();
    expect(guest.body).toEqual({ photos: [], mine: [], remaining: null, fieldFull: false });
  });

  test('the admin queue lists it, approving publishes it and makes it the cover', async () => {
    const queue = await admin(request(app).get('/api/field-photos/pending'));
    expect(queue.statusCode).toBe(200);
    const entry = queue.body.find((p) => p.field.id === fieldId);
    expect(entry).toMatchObject({
      field: { id: fieldId, name: 'FieldPhotosDbPilot', approvedCount: 0 },
      uploader: { id: 'user_fpdb_member' },
    });

    const approve = await admin(request(app).post(`/api/field-photos/${entry.id}/approve`));
    expect(approve.statusCode).toBe(200);
    expect(approve.body).toMatchObject({ status: 'APPROVED', sortOrder: 0 });

    const guest = await list();
    expect(guest.body.photos.map((p) => p.id)).toEqual([entry.id]);
    const field = await prisma.field.findUnique({ where: { id: fieldId } });
    expect(field.image).toBe(entry.url);
  });

  test("an admin with no local User row uploads directly; reorder and delete move the cover", async () => {
    expect(await prisma.user.findUnique({ where: { id: 'user_fpdb_admin' } })).toBeNull();

    const added = await submit(admin);
    expect(added.statusCode).toBe(201);
    expect(added.body).toMatchObject({ status: 'APPROVED', sortOrder: 1 });

    const before = (await list()).body.photos.map((p) => p.id);
    expect(before).toHaveLength(2);
    expect(before[1]).toBe(added.body.id);

    const reordered = await admin(request(app).put(`/api/fields/${fieldId}/photos/order`))
      .send({ orderedIds: [before[1], before[0]] });
    expect(reordered.statusCode).toBe(200);
    expect(reordered.body.map((p) => p.id)).toEqual([before[1], before[0]]);
    expect((await prisma.field.findUnique({ where: { id: fieldId } })).image).toBe(added.body.url);

    const removed = await admin(request(app).delete(`/api/fields/${fieldId}/photos/${added.body.id}`));
    expect(removed.statusCode).toBe(200);
    const after = (await list()).body.photos;
    expect(after.map((p) => p.id)).toEqual([before[0]]);
    expect((await prisma.field.findUnique({ where: { id: fieldId } })).image).toBe(after[0].url);
  });

  test('rejecting keeps the row, frees the pending slot and still counts for the day', async () => {
    const pending = await submit(other);
    expect(pending.statusCode).toBe(201);
    expect((await list(other)).body.remaining).toBe(4);

    const rejected = await admin(request(app).post(`/api/field-photos/${pending.body.id}/reject`));
    expect(rejected.statusCode).toBe(200);

    const row = await prisma.fieldPhoto.findUnique({ where: { id: pending.body.id } });
    expect(row.status).toBe('REJECTED');
    const mine = await list(other);
    expect(mine.body.mine).toEqual([]);
    expect(mine.body.remaining).toBe(5);
  });

  test('deleting the uploader keeps their approved photo, with no uploader', async () => {
    const [photo] = (await list()).body.photos;
    await prisma.user.delete({ where: { id: 'user_fpdb_member' } });
    const row = await prisma.fieldPhoto.findUnique({ where: { id: photo.id } });
    expect(row).toMatchObject({ status: 'APPROVED', uploadedById: null });
  });
});
