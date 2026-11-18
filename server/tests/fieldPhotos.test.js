const request = require('supertest');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

jest.setTimeout(30000);

jest.mock('../utils/auth', () => {
  const users = {
    mock_token_admin: { id: 'user_admin_fp', name: 'Admin', isAdmin: true },
    mock_token_member: { id: 'user_member_fp', name: 'Member', isAdmin: false },
    mock_token_other: { id: 'user_other_fp', name: 'Other', isAdmin: false },
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
    // Like the real one: a bad or missing token is a guest, never an error.
    attachOptionalUser: (req, _res, next) => {
      const token = tokenOf(req);
      if (token && users[token]) req.user = users[token];
      next();
    },
    clerkClient: { users: { updateUserMetadata: jest.fn().mockResolvedValue({}) } },
  };
});

jest.mock('../workers/cleanupWorker', () => ({ startCleanupWorker: jest.fn() }));

const { prisma } = require('../services/gameService');
const { app } = require('../index');
const { UPLOADS_ROOT } = require('../middleware/upload');
const {
  MAX_FIELD_PHOTOS,
  MAX_PENDING_PHOTOS_PER_USER_PER_FIELD,
  MAX_PENDING_PHOTOS_PER_USER,
  MAX_PHOTO_UPLOADS_PER_DAY,
} = require('../shared/upload');

const FIELD = 'field_fp_1';
const MEMBER = 'user_member_fp';
const DAY_MS = 24 * 60 * 60 * 1000;

// 1x1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

// The database is an in-memory list of FieldPhoto rows behind the handful of Prisma calls the
// routes make -- enough to exercise the real limit, visibility and ordering logic without the
// FieldPhoto table having to exist in the shared dev DB.
describe('Field photo gallery', () => {
  let rows;
  let field;
  let blocked;
  let nextId;
  let localUsers;
  let reports;
  const spies = [];
  const spy = (obj, method, impl) => {
    const s = jest.spyOn(obj, method).mockImplementation(impl);
    spies.push(s);
    return s;
  };

  const matches = (row, where = {}) => Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('in' in v) return v.in.includes(row[k]);
      if ('gte' in v) return row[k] >= v.gte;
    }
    return row[k] === v;
  });
  const sorted = (list, orderBy) => {
    const keys = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []).map((o) => Object.entries(o)[0]);
    return [...list].sort((a, b) => {
      for (const [k, dir] of keys) {
        if (a[k] < b[k]) return dir === 'asc' ? -1 : 1;
        if (a[k] > b[k]) return dir === 'asc' ? 1 : -1;
      }
      return 0;
    });
  };
  const addRow = (over = {}) => {
    const id = over.id || `fp_${nextId++}`;
    const row = {
      id,
      fieldId: FIELD,
      url: `http://127.0.0.1/uploads/fields/${id}.png`,
      status: 'PENDING',
      sortOrder: 0,
      uploadedById: MEMBER,
      createdAt: new Date(Date.now() - 1000 * (1000 - nextId)),
      reviewedAt: null,
      reviewedById: null,
      ...over,
    };
    rows.push(row);
    return row;
  };
  const addMany = (n, over = {}) => Array.from({ length: n }, (_, i) => addRow(typeof over === 'function' ? over(i) : over));

  beforeEach(() => {
    rows = [];
    reports = [];
    nextId = 1;
    blocked = false;
    field = { id: FIELD, name: 'מגרש הבדיקה', image: null, photos: [], type: 'OPEN' };

    spy(prisma, '$transaction', async (fn) => fn(prisma));
    // A copy, like a real query result: the routes compare the row they read with what they then write.
    spy(prisma.field, 'findUnique', async ({ where }) => (where.id === field.id ? { ...field, photos: [...field.photos] } : null));
    spy(prisma.field, 'update', async ({ where, data }) => {
      if (where.id !== field.id) return field;
      const { photos, ...rest } = data;
      Object.assign(field, rest);
      if (photos?.push) field.photos = [...field.photos, photos.push];
      if (photos?.set) field.photos = photos.set;
      return field;
    });
    // The routes must make sure the uploader's User row exists before writing the foreign key
    // (a Clerk account can be signed in without one). `localUsers` records who was ensured.
    localUsers = new Set();
    spy(prisma.user, 'upsert', async ({ where }) => {
      localUsers.add(where.id);
      return { id: where.id, name: 'Member', blockedFromFieldSocial: blocked };
    });
    spy(prisma.user, 'updateMany', async () => ({ count: 0 }));

    // The row locks (FOR NO KEY UPDATE) are exercised against real Postgres in fieldPhotosDb.test.js.
    spy(prisma, '$queryRaw', async () => []);
    spy(prisma.fieldPhoto, 'count', async ({ where }) => rows.filter((r) => matches(r, where)).length);
    spy(prisma.fieldPhoto, 'findMany', async ({ where, orderBy, include } = {}) => {
      const list = sorted(rows.filter((r) => matches(r, where)), orderBy);
      return include
        ? list.map((r) => ({ ...r, field: { id: field.id, name: field.name }, uploadedBy: r.uploadedById ? { id: r.uploadedById, name: 'Member' } : null }))
        : list;
    });
    spy(prisma.fieldPhoto, 'findFirst', async ({ where, orderBy }) => sorted(rows.filter((r) => matches(r, where)), orderBy)[0] || null);
    spy(prisma.fieldPhoto, 'findUnique', async ({ where }) => rows.find((r) => r.id === where.id) || null);
    spy(prisma.fieldPhoto, 'create', async ({ data }) => {
      // What Postgres does for FieldPhoto_uploadedById_fkey.
      if (data.uploadedById && !localUsers.has(data.uploadedById)) {
        throw Object.assign(new Error('Foreign key constraint violated'), { code: 'P2003' });
      }
      return addRow({ createdAt: new Date(), ...data });
    });
    spy(prisma.fieldPhoto, 'update', async ({ where, data }) => Object.assign(rows.find((r) => r.id === where.id), data));
    spy(prisma.fieldPhoto, 'updateMany', async ({ where, data }) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    });
    spy(prisma.fieldPhoto, 'delete', async ({ where }) => {
      const i = rows.findIndex((r) => r.id === where.id);
      return rows.splice(i, 1)[0];
    });
    spy(prisma.fieldPhoto, 'deleteMany', async ({ where }) => {
      const keep = rows.filter((r) => !matches(r, where));
      const count = rows.length - keep.length;
      rows.splice(0, rows.length, ...keep);
      return { count };
    });
    spy(prisma.fieldPhotoReport, 'create', async ({ data }) => {
      if (data.reporterId && !localUsers.has(data.reporterId)) {
        throw Object.assign(new Error('Foreign key constraint violated'), { code: 'P2003' });
      }
      if (reports.some((r) => r.photoId === data.photoId && r.reporterId === data.reporterId)) {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      }
      const report = { id: `rep_${reports.length + 1}`, createdAt: new Date(), resolvedAt: null, resolvedById: null, ...data };
      reports.push(report);
      return report;
    });
    spy(prisma.fieldPhotoReport, 'findMany', async ({ where }) => reports.filter((r) => matches(r, where)));
    spy(prisma.fieldPhotoReport, 'updateMany', async ({ where, data }) => {
      const hit = reports.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    });
    spy(prisma.fieldPhoto, 'groupBy', async ({ where }) => {
      const byField = new Map();
      rows.filter((r) => matches(r, where)).forEach((r) => byField.set(r.fieldId, (byField.get(r.fieldId) || 0) + 1));
      return [...byField].map(([fieldId, n]) => ({ fieldId, _count: { _all: n } }));
    });
  });

  afterEach(() => {
    while (spies.length) spies.pop().mockRestore();
  });

  // Uploads really land in server/uploads/fields in the test environment; leave nothing behind.
  const uploadDir = path.join(UPLOADS_ROOT, 'fields');
  let filesBefore;
  beforeAll(() => {
    filesBefore = new Set(fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir) : []);
  });
  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 100)); // let fire-and-forget unlinks settle
    if (!fs.existsSync(uploadDir)) return;
    for (const f of fs.readdirSync(uploadDir)) {
      if (!filesBefore.has(f)) fs.unlinkSync(path.join(uploadDir, f));
    }
  });
  const storedFiles = () => fs.readdirSync(uploadDir).filter((f) => !filesBefore.has(f));

  const as = (token) => (r) => r.set('Authorization', `Bearer ${token}`);
  const member = as('mock_token_member');
  const other = as('mock_token_other');
  const admin = as('mock_token_admin');

  const list = (auth) => (auth ? auth(request(app).get(`/api/fields/${FIELD}/photos`)) : request(app).get(`/api/fields/${FIELD}/photos`));
  const submit = (auth, file = { buffer: PNG, name: 'a.png', type: 'image/png' }) => {
    const r = request(app).post(`/api/fields/${FIELD}/photos/submit`);
    return (auth ? auth(r) : r).attach('photo', file.buffer, { filename: file.name, contentType: file.type });
  };

  describe('GET /api/fields/:id/photos', () => {
    test('a guest gets approved photos only, in order, without uploader ids', async () => {
      addRow({ id: 'b', status: 'APPROVED', sortOrder: 1 });
      addRow({ id: 'a', status: 'APPROVED', sortOrder: 0 });
      addRow({ id: 'p', status: 'PENDING' });
      addRow({ id: 'r', status: 'REJECTED' });

      const res = await list();
      expect(res.statusCode).toBe(200);
      expect(res.body.photos.map((p) => p.id)).toEqual(['a', 'b']);
      expect(res.body.mine).toEqual([]);
      expect(res.body.remaining).toBeNull();
      expect(res.body.fieldFull).toBe(false);
      expect(JSON.stringify(res.body)).not.toContain(MEMBER);
      expect(res.body.photos[0]).toEqual({
        id: 'a', url: expect.any(String), status: 'APPROVED', sortOrder: 0, createdAt: expect.any(String),
      });
    });

    test('the uploader also sees their own pending photos; another user does not', async () => {
      addRow({ id: 'a', status: 'APPROVED' });
      addRow({ id: 'mine', status: 'PENDING', uploadedById: MEMBER });

      const mine = await list(member);
      expect(mine.body.mine.map((p) => p.id)).toEqual(['mine']);
      expect(mine.body.photos.map((p) => p.id)).toEqual(['a']);
      expect(mine.body.remaining).toBe(MAX_PENDING_PHOTOS_PER_USER_PER_FIELD - 1);

      const theirs = await list(other);
      expect(theirs.body.mine).toEqual([]);
      expect(theirs.body.photos.map((p) => p.id)).toEqual(['a']);
      expect(theirs.body.remaining).toBe(MAX_PENDING_PHOTOS_PER_USER_PER_FIELD);
    });

    test("a user's own rejected photo is not shown back to them", async () => {
      addRow({ id: 'r', status: 'REJECTED', uploadedById: MEMBER });
      const res = await list(member);
      expect(res.body.mine).toEqual([]);
      expect(res.body.photos).toEqual([]);
    });

    test('a response to a request with credentials is never publicly cacheable', async () => {
      const res = await list(member);
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(res.headers.vary).toMatch(/Authorization/i);
    });

    test('a request with an invalid token is treated as a guest but still not cached', async () => {
      addRow({ id: 'mine', status: 'PENDING', uploadedById: MEMBER });
      const res = await as('not_a_real_token')(request(app).get(`/api/fields/${FIELD}/photos`));
      expect(res.statusCode).toBe(200);
      expect(res.body.mine).toEqual([]);
      expect(res.headers['cache-control']).toBe('private, no-store');
    });

    test('a guest response varies on Authorization so a cache cannot serve it to a signed-in user', async () => {
      const res = await list();
      expect(res.headers.vary).toMatch(/Authorization/i);
      expect(res.headers['cache-control'] || '').not.toMatch(/private/);
    });

    test('reports a full gallery and 404s for an unknown field', async () => {
      addMany(MAX_FIELD_PHOTOS, (i) => ({ status: 'APPROVED', sortOrder: i, uploadedById: null }));
      const full = await list(member);
      expect(full.body.fieldFull).toBe(true);
      expect(full.body.remaining).toBe(0);

      const missing = await request(app).get('/api/fields/nope/photos');
      expect(missing.statusCode).toBe(404);
    });
  });

  // A phone photo: the exact place and time it was taken are in the file.
  const GPS_EXIF = {
    IFD0: { Make: 'LeakyCam', Software: 'GpsLeakTest 1.0' },
    IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '32/1 5/1 7/1', GPSLongitudeRef: 'E', GPSLongitude: '34/1 46/1 54/1' },
  };
  const photoWithGps = () => sharp({ create: { width: 40, height: 30, channels: 3, background: '#336699' } })
    .jpeg().withExif(GPS_EXIF).toBuffer();
  const storedBytes = (url) => fs.readFileSync(path.join(uploadDir, path.basename(url)));
  const expectNoMetadata = async (bytes) => {
    expect((await sharp(bytes).metadata()).exif).toBeUndefined();
    expect(bytes.includes(Buffer.from('LeakyCam'))).toBe(false);
  };

  describe('metadata is stripped from every stored photo', () => {
    test('a suggested photo has no EXIF/GPS on disk (the fixture does have it going in)', async () => {
      const input = await photoWithGps();
      expect((await sharp(input).metadata()).exif).toBeDefined();
      expect(input.includes(Buffer.from('LeakyCam'))).toBe(true);

      const res = await submit(member, { buffer: input, name: 'phone.jpg', type: 'image/jpeg' });
      expect(res.statusCode).toBe(201);
      await expectNoMetadata(storedBytes(res.body.url));
    });

    test("an admin's photo, which is published at once, is stripped too", async () => {
      const res = await submit(admin, { buffer: await photoWithGps(), name: 'phone.jpg', type: 'image/jpeg' });
      expect(res.statusCode).toBe(201);
      expect(res.body.status).toBe('APPROVED');
      await expectNoMetadata(storedBytes(res.body.url));
    });

    test('the legacy admin endpoints strip it as well', async () => {
      const gallery = await admin(request(app).post(`/api/fields/${FIELD}/photos`))
        .attach('photo', await photoWithGps(), { filename: 'phone.jpg', contentType: 'image/jpeg' });
      expect(gallery.statusCode).toBe(201);
      await expectNoMetadata(storedBytes(gallery.body.photos[0]));

      const cover = await admin(request(app).post(`/api/fields/${FIELD}/image`))
        .attach('image', await photoWithGps(), { filename: 'phone.jpg', contentType: 'image/jpeg' });
      expect(cover.statusCode).toBe(200);
      await expectNoMetadata(storedBytes(cover.body.image));
    });

    test('a file that is not really an image is refused with a 400 and nothing is stored', async () => {
      const before = storedFiles().length;
      const res = await submit(member, { buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), name: 'a.png', type: 'image/png' });
      expect(res.statusCode).toBe(400);
      expect(rows).toHaveLength(0);
      expect(storedFiles().length).toBe(before);
    });
  });

  describe('POST /api/fields/:id/photos/submit', () => {
    test('requires auth', async () => {
      const res = await submit(null);
      expect(res.statusCode).toBe(401);
      expect(rows).toHaveLength(0);
    });

    test("creates the uploader's local User row first, so the foreign key always holds", async () => {
      expect(localUsers.has(MEMBER)).toBe(false);
      const res = await submit(member);
      expect(res.statusCode).toBe(201);
      expect(localUsers.has(MEMBER)).toBe(true);
    });

    test("a lost race to create the uploader's User row is retried, not a 500", async () => {
      // Parallel first requests from an account with no row all try to create it; the loser gets
      // a unique violation on the id, and the row exists by the time it asks again.
      prisma.user.upsert.mockImplementationOnce(async () => {
        throw Object.assign(new Error('Unique constraint failed on the fields: (`id`)'), { code: 'P2002' });
      });
      const res = await submit(member);
      expect(res.statusCode).toBe(201);
      expect(prisma.user.upsert).toHaveBeenCalledTimes(2);
    });

    test("a user's photo is stored as PENDING and attributed to them", async () => {
      const res = await submit(member);
      expect(res.statusCode).toBe(201);
      expect(res.body.status).toBe('PENDING');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ fieldId: FIELD, uploadedById: MEMBER, status: 'PENDING' });
      expect(field.image).toBeNull(); // not public yet, so not the cover
    });

    test("an admin's photo is published at once, last in order, and becomes the cover of an empty gallery", async () => {
      const first = await submit(admin);
      expect(first.statusCode).toBe(201);
      expect(first.body).toMatchObject({ status: 'APPROVED', sortOrder: 0 });
      expect(field.image).toBe(first.body.url);

      const second = await submit(admin);
      expect(second.body.sortOrder).toBe(1);
      expect(field.image).toBe(first.body.url);
    });

    test('rejects a wrong file type with 400 and stores nothing', async () => {
      const before = storedFiles().length;
      const res = await submit(member, { buffer: Buffer.from('%PDF-1.4'), name: 'a.pdf', type: 'application/pdf' });
      expect(res.statusCode).toBe(400);
      expect(rows).toHaveLength(0);
      expect(storedFiles().length).toBe(before);
    });

    test('rejects an oversized file with 413', async () => {
      const res = await submit(member, { buffer: Buffer.alloc(5 * 1024 * 1024 + 1), name: 'big.png', type: 'image/png' });
      expect(res.statusCode).toBe(413);
      expect(rows).toHaveLength(0);
    });

    test('rejects a request with no file', async () => {
      const res = await member(request(app).post(`/api/fields/${FIELD}/photos/submit`));
      expect(res.statusCode).toBe(400);
    });

    test('404s for an unknown field', async () => {
      const res = await member(request(app).post('/api/fields/nope/photos/submit'))
        .attach('photo', PNG, { filename: 'a.png', contentType: 'image/png' });
      expect(res.statusCode).toBe(404);
    });

    test('a user blocked from field content gets 403', async () => {
      blocked = true;
      const res = await submit(member);
      expect(res.statusCode).toBe(403);
      expect(rows).toHaveLength(0);
    });

    test('per-field pending limit: the sixth pending photo is refused before any file is stored', async () => {
      addMany(MAX_PENDING_PHOTOS_PER_USER_PER_FIELD, { status: 'PENDING' });
      const before = storedFiles().length;
      const res = await submit(member);
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('PENDING_PER_FIELD');
      expect(rows).toHaveLength(MAX_PENDING_PHOTOS_PER_USER_PER_FIELD);
      expect(storedFiles().length).toBe(before);
    });

    test('overall pending limit across fields', async () => {
      addMany(MAX_PENDING_PHOTOS_PER_USER, (i) => ({ status: 'PENDING', fieldId: `other_field_${i % 5}` }));
      const res = await submit(member);
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('PENDING_TOTAL');
    });

    test('daily limit counts every status, including rejected', async () => {
      addMany(MAX_PHOTO_UPLOADS_PER_DAY, (i) => ({ status: i % 2 ? 'REJECTED' : 'APPROVED', fieldId: `other_field_${i}`, createdAt: new Date() }));
      const res = await submit(member);
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('DAILY');
    });

    test('uploads older than 24 hours no longer count toward the day', async () => {
      addMany(MAX_PHOTO_UPLOADS_PER_DAY, (i) => ({ status: 'APPROVED', fieldId: `other_field_${i}`, createdAt: new Date(Date.now() - DAY_MS - 60000) }));
      const res = await submit(member);
      expect(res.statusCode).toBe(201);
    });

    test('a full gallery refuses suggestions', async () => {
      addMany(MAX_FIELD_PHOTOS, (i) => ({ status: 'APPROVED', sortOrder: i, uploadedById: null }));
      const res = await submit(member);
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('FIELD_FULL');
    });

    test('approving or rejecting a pending photo frees the slot', async () => {
      const pending = addMany(MAX_PENDING_PHOTOS_PER_USER_PER_FIELD, { status: 'PENDING', createdAt: new Date(Date.now() - 2 * DAY_MS) });
      expect((await submit(member)).statusCode).toBe(409);

      await admin(request(app).post(`/api/field-photos/${pending[0].id}/reject`));
      expect((await submit(member)).statusCode).toBe(201);
      expect((await submit(member)).statusCode).toBe(409);

      await admin(request(app).post(`/api/field-photos/${pending[1].id}/approve`));
      expect((await submit(member)).statusCode).toBe(201);
    });

    test('an admin is exempt from the per-user limits but not from the field cap', async () => {
      addMany(MAX_PHOTO_UPLOADS_PER_DAY, (i) => ({ status: 'PENDING', uploadedById: 'user_admin_fp', fieldId: i < 5 ? FIELD : `other_${i}`, createdAt: new Date() }));
      expect((await submit(admin)).statusCode).toBe(201);

      addMany(MAX_FIELD_PHOTOS - 1, (i) => ({ status: 'APPROVED', sortOrder: i + 1, uploadedById: null }));
      const res = await submit(admin);
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('FIELD_FULL');
    });

    test('a limit reached between the precheck and the write discards the stored file', async () => {
      // The precheck passes, then four more pending rows appear before the handler re-checks.
      addMany(MAX_PENDING_PHOTOS_PER_USER_PER_FIELD - 1, { status: 'PENDING' });
      let calls = 0;
      prisma.$transaction.mockImplementationOnce(async (fn) => {
        calls += 1;
        addRow({ status: 'PENDING' });
        return fn(prisma);
      });
      const before = storedFiles().length;
      const res = await submit(member);
      expect(calls).toBe(1);
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('PENDING_PER_FIELD');
      await new Promise((r) => setTimeout(r, 100));
      expect(storedFiles().length).toBe(before);
    });
  });

  describe('DELETE /api/fields/:id/photos/:photoId', () => {
    test('the uploader withdraws their own pending photo; it stops counting as pending but still counts for the day', async () => {
      const p = addRow({ status: 'PENDING', createdAt: new Date() });
      const res = await member(request(app).delete(`/api/fields/${FIELD}/photos/${p.id}`));
      expect(res.statusCode).toBe(200);
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('REJECTED');
      const after = await list(member);
      expect(after.body.mine).toEqual([]);
    });

    test("another user cannot remove it, and cannot tell it exists", async () => {
      const p = addRow({ status: 'PENDING' });
      const res = await other(request(app).delete(`/api/fields/${FIELD}/photos/${p.id}`));
      expect(res.statusCode).toBe(404);
      expect(rows[0].status).toBe('PENDING');
    });

    test('a user cannot remove their own photo once it is approved', async () => {
      const p = addRow({ status: 'APPROVED' });
      const res = await member(request(app).delete(`/api/fields/${FIELD}/photos/${p.id}`));
      expect(res.statusCode).toBe(404);
      expect(rows).toHaveLength(1);
    });

    test('an admin removes an approved photo and the cover moves to the next one', async () => {
      const a = addRow({ id: 'a', status: 'APPROVED', sortOrder: 0 });
      const b = addRow({ id: 'b', status: 'APPROVED', sortOrder: 1 });
      field.image = a.url;
      const res = await admin(request(app).delete(`/api/fields/${FIELD}/photos/a`));
      expect(res.statusCode).toBe(200);
      expect(rows.map((r) => r.id)).toEqual(['b']);
      expect(field.image).toBe(b.url);

      await admin(request(app).delete(`/api/fields/${FIELD}/photos/b`));
      expect(field.image).toBeNull();
    });

    test('the photo must belong to the field in the path', async () => {
      const p = addRow({ status: 'APPROVED', fieldId: 'another_field' });
      const res = await admin(request(app).delete(`/api/fields/${FIELD}/photos/${p.id}`));
      expect(res.statusCode).toBe(404);
      expect(rows).toHaveLength(1);
    });
  });

  describe('admin review queue', () => {
    test('pending list is admin only', async () => {
      expect((await request(app).get('/api/field-photos/pending')).statusCode).toBe(401);
      expect((await member(request(app).get('/api/field-photos/pending'))).statusCode).toBe(403);
    });

    test('pending list carries the field, its approved count and the uploader, oldest first', async () => {
      addRow({ id: 'ap', status: 'APPROVED' });
      addRow({ id: 'new', status: 'PENDING', createdAt: new Date() });
      addRow({ id: 'old', status: 'PENDING', createdAt: new Date(Date.now() - DAY_MS) });
      const res = await admin(request(app).get('/api/field-photos/pending'));
      expect(res.statusCode).toBe(200);
      expect(res.body.map((p) => p.id)).toEqual(['old', 'new']);
      expect(res.body[0].field).toEqual({ id: FIELD, name: 'מגרש הבדיקה', approvedCount: 1 });
      expect(res.body[0].uploader).toEqual({ id: MEMBER, name: 'Member' });
      expect(res.headers['cache-control']).toBe('private, no-store');
    });

    test('approve publishes the photo last and makes it the cover when it is the first', async () => {
      const p = addRow({ status: 'PENDING' });
      expect((await member(request(app).post(`/api/field-photos/${p.id}/approve`))).statusCode).toBe(403);

      const res = await admin(request(app).post(`/api/field-photos/${p.id}/approve`));
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ status: 'APPROVED', sortOrder: 0 });
      expect(rows[0]).toMatchObject({ status: 'APPROVED', reviewedById: 'user_admin_fp' });
      expect(field.image).toBe(p.url);

      const q = addRow({ status: 'PENDING' });
      const second = await admin(request(app).post(`/api/field-photos/${q.id}/approve`));
      expect(second.body.sortOrder).toBe(1);
      expect(field.image).toBe(p.url);
    });

    test('approve is refused when the gallery is full, and a photo is only reviewed once', async () => {
      addMany(MAX_FIELD_PHOTOS, (i) => ({ status: 'APPROVED', sortOrder: i, uploadedById: null }));
      const p = addRow({ status: 'PENDING' });
      const full = await admin(request(app).post(`/api/field-photos/${p.id}/approve`));
      expect(full.statusCode).toBe(409);
      expect(full.body.code).toBe('FIELD_FULL');
      expect(p.status).toBe('PENDING');

      const rejected = await admin(request(app).post(`/api/field-photos/${p.id}/reject`));
      expect(rejected.statusCode).toBe(200);
      const again = await admin(request(app).post(`/api/field-photos/${p.id}/reject`));
      expect(again.statusCode).toBe(409);
      expect(again.body.code).toBe('NOT_PENDING');
      const approveAfter = await admin(request(app).post(`/api/field-photos/${p.id}/approve`));
      expect(approveAfter.body.code).toBe('NOT_PENDING');
    });

    test('reject keeps the row and never touches the cover', async () => {
      const a = addRow({ id: 'a', status: 'APPROVED' });
      field.image = a.url;
      const p = addRow({ status: 'PENDING' });
      const res = await admin(request(app).post(`/api/field-photos/${p.id}/reject`));
      expect(res.statusCode).toBe(200);
      expect(rows).toHaveLength(2);
      expect(p.status).toBe('REJECTED');
      expect(field.image).toBe(a.url);
      expect((await admin(request(app).post('/api/field-photos/nope/reject'))).statusCode).toBe(404);
    });
  });

  describe('PUT /api/fields/:id/photos/order', () => {
    const order = (auth, orderedIds) => auth(request(app).put(`/api/fields/${FIELD}/photos/order`)).send({ orderedIds });

    beforeEach(() => {
      addRow({ id: 'a', status: 'APPROVED', sortOrder: 0 });
      addRow({ id: 'b', status: 'APPROVED', sortOrder: 1 });
      addRow({ id: 'c', status: 'APPROVED', sortOrder: 2 });
      addRow({ id: 'p', status: 'PENDING' });
    });

    test('admin only', async () => {
      expect((await order(member, ['c', 'b', 'a'])).statusCode).toBe(403);
    });

    test('reorders and moves the cover to the new first photo', async () => {
      const res = await order(admin, ['c', 'a', 'b']);
      expect(res.statusCode).toBe(200);
      expect(res.body.map((p) => p.id)).toEqual(['c', 'a', 'b']);
      expect(res.body.map((p) => p.sortOrder)).toEqual([0, 1, 2]);
      expect(field.image).toBe(rows.find((r) => r.id === 'c').url);
      expect((await list()).body.photos.map((p) => p.id)).toEqual(['c', 'a', 'b']);
    });

    test.each([
      ['a missing id', ['a', 'b']],
      ['a duplicate id', ['a', 'a', 'b']],
      ['a pending photo', ['a', 'b', 'c', 'p']],
      ['an unknown id', ['a', 'b', 'x']],
      ['not an array', 'a,b,c'],
      ['non-string ids', ['a', 'b', 3]],
    ])('refuses %s and changes nothing', async (_name, ids) => {
      const res = await order(admin, ids);
      expect(res.statusCode).toBe(400);
      expect(rows.filter((r) => r.status === 'APPROVED').map((r) => r.sortOrder)).toEqual([0, 1, 2]);
    });
  });

  // Older admin clients still call the pre-gallery endpoints in routes/fields.js. They must keep
  // working and must not leave FieldPhoto (what the gallery reads) out of step.
  describe('legacy admin endpoints write through to the gallery', () => {
    const png = { filename: 'a.png', contentType: 'image/png' };

    test('POST /api/fields/:id/photos adds an approved gallery photo and sets the cover', async () => {
      expect((await member(request(app).post(`/api/fields/${FIELD}/photos`)).attach('photo', PNG, png)).statusCode).toBe(403);

      const res = await admin(request(app).post(`/api/fields/${FIELD}/photos`)).attach('photo', PNG, png);
      expect(res.statusCode).toBe(201);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: 'APPROVED', sortOrder: 0, uploadedById: 'user_admin_fp' });
      expect(res.body.photos).toEqual([rows[0].url]);
      expect(field.image).toBe(rows[0].url);
      expect((await list()).body.photos.map((p) => p.url)).toEqual([rows[0].url]);
    });

    test('POST /api/fields/:id/photos respects the field cap', async () => {
      addMany(MAX_FIELD_PHOTOS, (i) => ({ status: 'APPROVED', sortOrder: i, uploadedById: null }));
      const res = await admin(request(app).post(`/api/fields/${FIELD}/photos`)).attach('photo', PNG, png);
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('FIELD_FULL');
      expect(rows).toHaveLength(MAX_FIELD_PHOTOS);
    });

    test('POST /api/fields/:id/image replaces the cover photo and stays first', async () => {
      const oldCover = addRow({ id: 'cover', status: 'APPROVED', sortOrder: 0 });
      addRow({ id: 'second', status: 'APPROVED', sortOrder: 1 });
      field.image = oldCover.url;

      const res = await admin(request(app).post(`/api/fields/${FIELD}/image`)).attach('image', PNG, png);
      expect(res.statusCode).toBe(200);
      expect(rows.some((r) => r.id === 'cover')).toBe(false);
      const photos = (await list()).body.photos;
      expect(photos).toHaveLength(2);
      expect(photos[0].url).toBe(res.body.image);
      expect(photos[1].id).toBe('second');
      expect(field.image).toBe(res.body.image);
    });

    test('DELETE /api/fields/:id/image removes that photo and the next one becomes the cover', async () => {
      const cover = addRow({ id: 'cover', status: 'APPROVED', sortOrder: 0 });
      const second = addRow({ id: 'second', status: 'APPROVED', sortOrder: 1 });
      field.image = cover.url;

      const res = await admin(request(app).delete(`/api/fields/${FIELD}/image`));
      expect(res.statusCode).toBe(200);
      expect(res.body.image).toBe(second.url);
      expect(rows.map((r) => r.id)).toEqual(['second']);

      const last = await admin(request(app).delete(`/api/fields/${FIELD}/image`));
      expect(last.body.image).toBeNull();
      expect(rows).toHaveLength(0);
    });

    test('DELETE /api/fields/:id/photos removes the gallery photo by url', async () => {
      const a = addRow({ id: 'a', status: 'APPROVED', sortOrder: 0 });
      const b = addRow({ id: 'b', status: 'APPROVED', sortOrder: 1 });
      field.image = a.url;
      field.photos = [b.url];

      const res = await admin(request(app).delete(`/api/fields/${FIELD}/photos`)).send({ url: a.url });
      expect(res.statusCode).toBe(200);
      expect(rows.map((r) => r.id)).toEqual(['b']);
      expect(field.image).toBe(b.url);
      expect(field.photos).toEqual([b.url]);
    });
  });

  describe('reporting a published photo', () => {
    const report = (auth, photoId, body = { reason: 'PEOPLE' }, fieldId = FIELD) => {
      const r = request(app).post(`/api/fields/${fieldId}/photos/${photoId}/report`);
      return (auth ? auth(r) : r).send(body);
    };

    beforeEach(() => {
      addRow({ id: 'pub', status: 'APPROVED', uploadedById: null });
    });

    test('requires auth', async () => {
      expect((await report(null, 'pub')).statusCode).toBe(401);
      expect(reports).toHaveLength(0);
    });

    test.each([
      ['no reason', {}],
      ['an unknown reason', { reason: 'BORING' }],
      ['a reason of the wrong type', { reason: ['PEOPLE'] }],
    ])('refuses %s with a 400', async (_name, body) => {
      const res = await report(member, 'pub', body);
      expect(res.statusCode).toBe(400);
      expect(reports).toHaveLength(0);
    });

    test.each(['PEOPLE', 'INAPPROPRIATE', 'WRONG_PLACE', 'OTHER'])('records a %s report, and makes sure the reporter has a User row first', async (reason) => {
      const res = await report(member, 'pub', { reason });
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual({ ok: true });
      expect(reports).toHaveLength(1);
      expect(reports[0]).toMatchObject({ photoId: 'pub', reporterId: MEMBER, reason, resolvedAt: null });
      expect(localUsers.has(MEMBER)).toBe(true);
    });

    test('reporting the same photo again is a harmless no-op; another user can still report it', async () => {
      expect((await report(member, 'pub')).statusCode).toBe(201);
      const again = await report(member, 'pub', { reason: 'OTHER' });
      expect(again.statusCode).toBe(200);
      expect(again.body).toEqual({ ok: true, alreadyReported: true });
      expect(reports).toHaveLength(1);

      expect((await report(other, 'pub')).statusCode).toBe(201);
      expect(reports).toHaveLength(2);
    });

    test('only published photos can be reported: pending, rejected, unknown or another field is "not found"', async () => {
      const pending = addRow({ id: 'pend', status: 'PENDING' });
      const rejected = addRow({ id: 'rej', status: 'REJECTED' });
      const elsewhere = addRow({ id: 'else', status: 'APPROVED', fieldId: 'another_field' });
      for (const id of [pending.id, rejected.id, elsewhere.id, 'nope']) {
        expect((await report(other, id)).statusCode).toBe(404);
      }
      expect(reports).toHaveLength(0);
    });

    test('a user blocked from field content cannot report', async () => {
      blocked = true;
      expect((await report(member, 'pub')).statusCode).toBe(403);
      expect(reports).toHaveLength(0);
    });
  });

  describe('admin view of reports', () => {
    const addReport = (photoId, reporterId, reason, over = {}) =>
      reports.push({ id: `r${reports.length + 1}`, photoId, reporterId, reason, createdAt: new Date(), resolvedAt: null, resolvedById: null, ...over });

    beforeEach(() => {
      addRow({ id: 'a', status: 'APPROVED', uploadedById: null });
      addRow({ id: 'b', status: 'APPROVED', uploadedById: null });
    });

    test('is admin only', async () => {
      expect((await request(app).get('/api/field-photos/reports')).statusCode).toBe(401);
      expect((await member(request(app).get('/api/field-photos/reports'))).statusCode).toBe(403);
      expect((await member(request(app).post('/api/field-photos/a/reports/resolve'))).statusCode).toBe(403);
    });

    test('lists reported photos, most reported first, with a count and the reasons', async () => {
      addReport('a', 'u1', 'PEOPLE', { createdAt: new Date(Date.now() - 3000) });
      addReport('b', 'u1', 'OTHER', { createdAt: new Date(Date.now() - 2000) });
      addReport('b', 'u2', 'PEOPLE', { createdAt: new Date(Date.now() - 1000) });
      addReport('b', 'u3', 'PEOPLE', { createdAt: new Date() });
      addReport('a', 'u9', 'PEOPLE', { resolvedAt: new Date() }); // already dealt with: not listed

      const res = await admin(request(app).get('/api/field-photos/reports'));
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(res.body.map((e) => e.photo.id)).toEqual(['b', 'a']);
      expect(res.body[0]).toMatchObject({ count: 3, reasons: { PEOPLE: 2, OTHER: 1 } });
      expect(res.body[0].photo.field).toEqual({ id: FIELD, name: 'מגרש הבדיקה' });
      expect(res.body[1]).toMatchObject({ count: 1, reasons: { PEOPLE: 1 } });
      expect(JSON.stringify(res.body)).not.toContain('u1'); // reporters are not exposed
    });

    test('dismissing clears the open reports for that photo only', async () => {
      addReport('a', 'u1', 'PEOPLE');
      addReport('a', 'u2', 'OTHER');
      addReport('b', 'u1', 'PEOPLE');

      const res = await admin(request(app).post('/api/field-photos/a/reports/resolve'));
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ ok: true, resolved: 2 });
      expect(reports.filter((r) => r.photoId === 'a').every((r) => r.resolvedAt && r.resolvedById === 'user_admin_fp')).toBe(true);
      expect(reports.find((r) => r.photoId === 'b').resolvedAt).toBeNull();

      const list = await admin(request(app).get('/api/field-photos/reports'));
      expect(list.body.map((e) => e.photo.id)).toEqual(['b']);
    });

    test('an empty queue is an empty list', async () => {
      const res = await admin(request(app).get('/api/field-photos/reports'));
      expect(res.body).toEqual([]);
    });
  });
});
