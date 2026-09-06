// Closes the TESTING_GAPS.md Priority 1 gap: "middleware/upload.js -- no
// test on file-type/size validation." Exercises the middleware directly
// through a minimal standalone Express app rather than any real route, so
// this is a unit test of the middleware's own contract, not of any
// particular route that happens to use it (fields.js/users.js/series.js all
// share this same code). Uses a real, throwaway subfolder under the
// module's actual UPLOADS_ROOT (cleaned up in afterAll) rather than trying
// to redirect the middleware's own path resolution, which is baked in at
// require-time and awkward to safely override from a test.
const express = require('express');
const request = require('supertest');
const fs = require('fs');
const path = require('path');

jest.setTimeout(15000);

const { createImageUpload, handleSingleUpload, absoluteUrlFor, deleteUploadedFile, UPLOADS_ROOT } = require('../middleware/upload');

const TEST_SUBFOLDER = 'test-fixture-upload-middleware';
const testDir = path.join(UPLOADS_ROOT, TEST_SUBFOLDER);

function buildTestApp() {
  const upload = createImageUpload(TEST_SUBFOLDER);
  const app = express();
  app.post('/upload', handleSingleUpload(upload, 'image'), (req, res) => {
    res.json({ filename: req.file?.filename, url: absoluteUrlFor(req, TEST_SUBFOLDER, req.file.filename) });
  });
  return app;
}

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

describe('middleware/upload.js', () => {
  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('accepts a valid small PNG and saves it under the configured subfolder', async () => {
    const app = buildTestApp();
    const res = await request(app).post('/upload').attach('image', TINY_PNG, 'test.png');

    expect(res.statusCode).toEqual(200);
    expect(res.body.url).toEqual(expect.stringContaining(`/uploads/${TEST_SUBFOLDER}/`));
    expect(fs.existsSync(path.join(testDir, res.body.filename))).toBe(true);
  });

  test('rejects a disallowed MIME type with 400, not the generic 500 handler', async () => {
    const app = buildTestApp();
    const res = await request(app)
      .post('/upload')
      .attach('image', Buffer.from('not an image'), { filename: 'note.txt', contentType: 'text/plain' });

    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toMatch(/JPEG, PNG, WEBP, and GIF/);
  });

  test('rejects a file over the 5MB limit with 413', async () => {
    const app = buildTestApp();
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1024, 0);
    const res = await request(app)
      .post('/upload')
      .attach('image', oversized, { filename: 'big.png', contentType: 'image/png' });

    expect(res.statusCode).toEqual(413);
  });

  test('never trusts the client-supplied filename (random name, correct extension)', async () => {
    const app = buildTestApp();
    const res = await request(app)
      .post('/upload')
      .attach('image', TINY_PNG, { filename: '../../etc/passwd.png', contentType: 'image/png' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.filename).not.toContain('passwd');
    expect(res.body.filename).not.toContain('..');
    expect(res.body.filename.endsWith('.png')).toBe(true);
  });

  describe('deleteUploadedFile', () => {
    test('deletes a file that lives under /uploads/', async () => {
      fs.mkdirSync(testDir, { recursive: true });
      const filePath = path.join(testDir, 'sample.png');
      fs.writeFileSync(filePath, TINY_PNG);
      expect(fs.existsSync(filePath)).toBe(true);

      deleteUploadedFile(`http://localhost:3005/uploads/${TEST_SUBFOLDER}/sample.png`);

      // fs.unlink inside deleteUploadedFile is async/best-effort; poll briefly.
      for (let i = 0; i < 20 && fs.existsSync(filePath); i++) {
        await new Promise((r) => setTimeout(r, 25));
      }
      expect(fs.existsSync(filePath)).toBe(false);
    });

    test('no-ops (does not throw) for an external URL', () => {
      expect(() => deleteUploadedFile('https://images.unsplash.com/photo-123')).not.toThrow();
    });

    test('no-ops (does not throw) for a falsy or non-string value', () => {
      expect(() => deleteUploadedFile(null)).not.toThrow();
      expect(() => deleteUploadedFile(undefined)).not.toThrow();
    });

    test('ignores a path-traversal attempt outside /uploads/', () => {
      expect(() => deleteUploadedFile('/uploads/../../etc/passwd')).not.toThrow();
    });
  });
});
