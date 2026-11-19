// createImageUpload(subfolder, { sanitize: true }): the stored file has no metadata, on both the
// local-disk and the Cloudinary storage paths, and what is not a real image never gets stored.
// Uses a throwaway subfolder under the real UPLOADS_ROOT (removed in afterAll), like
// uploadMiddleware.test.js.
const express = require('express');
const request = require('supertest');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { PassThrough } = require('stream');

jest.setTimeout(30000);

const SUBFOLDER = 'test-fixture-upload-sanitize';
const GPS_POINTER_LE = Buffer.from([0x25, 0x88]);
const GPS_POINTER_BE = Buffer.from([0x88, 0x25]);
const hasGps = (exif) => !!exif && (exif.includes(GPS_POINTER_LE) || exif.includes(GPS_POINTER_BE));

const EXIF = {
  IFD0: { Make: 'LeakyCam', Software: 'GpsLeakTest 1.0' },
  IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '32/1 5/1 7/1', GPSLongitudeRef: 'E', GPSLongitude: '34/1 46/1 54/1' },
};
const photoWithGps = (w = 40, h = 30) =>
  sharp({ create: { width: w, height: h, channels: 3, background: '#336699' } }).jpeg().withExif(EXIF).toBuffer();

function appFor(mod, sanitize) {
  const upload = mod.createImageUpload(SUBFOLDER, { sanitize });
  const app = express();
  app.post('/u', mod.handleSingleUpload(upload, 'image'), (req, res) => {
    res.json({ filename: req.file.filename, size: req.file.size });
  });
  return app;
}

describe('createImageUpload with sanitize (local disk)', () => {
  let mod;
  let dir;
  beforeAll(() => {
    jest.resetModules();
    mod = require('../middleware/upload');
    dir = path.join(mod.UPLOADS_ROOT, SUBFOLDER);
  });
  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const stored = () => (fs.existsSync(dir) ? fs.readdirSync(dir) : []);

  test('the stored file has no EXIF or GPS, and is still the photo', async () => {
    const input = await photoWithGps();
    expect(hasGps((await sharp(input).metadata()).exif)).toBe(true);

    const res = await request(appFor(mod, true)).post('/u').attach('image', input, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.statusCode).toBe(200);

    const bytes = fs.readFileSync(path.join(dir, res.body.filename));
    const meta = await sharp(bytes).metadata();
    expect(meta.exif).toBeUndefined();
    expect(bytes.includes(Buffer.from('LeakyCam'))).toBe(false);
    expect([meta.width, meta.height]).toEqual([40, 30]);
    expect(res.body.size).toBe(bytes.length);
  });

  test('without the option the file is stored untouched (other uploads are unchanged)', async () => {
    const input = await photoWithGps();
    const res = await request(appFor(mod, false)).post('/u').attach('image', input, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.statusCode).toBe(200);
    expect(fs.readFileSync(path.join(dir, res.body.filename)).equals(input)).toBe(true);
  });

  test('the stored name follows what the bytes are, not what the client declared', async () => {
    const jpeg = await photoWithGps();
    const res = await request(appFor(mod, true)).post('/u').attach('image', jpeg, { filename: 'a.png', contentType: 'image/png' });
    expect(res.statusCode).toBe(200);
    expect(res.body.filename).toMatch(/\.jpg$/);
  });

  test.each([
    ['an SVG declared as a PNG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/png'],
    ['a PDF declared as a JPEG', Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n'), 'image/jpeg'],
    ['text declared as a GIF', Buffer.from('GIF89a but not really'), 'image/gif'],
  ])('refuses %s with a 400 and stores nothing', async (_name, bytes, contentType) => {
    const before = stored().length;
    const res = await request(appFor(mod, true)).post('/u').attach('image', bytes, { filename: 'x.bin', contentType });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/not a valid/i);
    expect(stored().length).toBe(before);
  });

  test('still answers 413 for an oversized file, and stores nothing', async () => {
    const before = stored().length;
    const res = await request(appFor(mod, true)).post('/u')
      .attach('image', Buffer.alloc(5 * 1024 * 1024 + 1), { filename: 'big.png', contentType: 'image/png' });
    expect(res.statusCode).toBe(413);
    expect(stored().length).toBe(before);
  });

  test('still refuses a disallowed declared type before reading the file', async () => {
    const res = await request(appFor(mod, true)).post('/u')
      .attach('image', Buffer.from('x'), { filename: 'a.txt', contentType: 'text/plain' });
    expect(res.statusCode).toBe(400);
  });
});

describe('createImageUpload with sanitize (Cloudinary)', () => {
  test('the bytes handed to Cloudinary have no metadata', async () => {
    const received = [];
    const upload_stream = jest.fn((opts, cb) => {
      const s = new PassThrough();
      const chunks = [];
      s.on('data', (c) => chunks.push(c));
      s.on('end', () => {
        received.push(Buffer.concat(chunks));
        cb(null, {
          secure_url: `https://res.cloudinary.com/democloud/image/upload/v1/${opts.folder}/${opts.public_id}.jpg`,
          public_id: `${opts.folder}/${opts.public_id}`,
          bytes: received[received.length - 1].length,
        });
      });
      return s;
    });
    const saved = { ...process.env };
    delete process.env.ALLOW_DISK_UPLOADS;
    process.env.NODE_ENV = 'test';
    process.env.CLOUDINARY_URL = 'cloudinary://key:secret@democloud';
    jest.resetModules();
    jest.doMock('cloudinary', () => ({ v2: { uploader: { upload_stream, destroy: jest.fn().mockResolvedValue({}) } } }));
    let mod;
    try {
      mod = require('../middleware/upload');
    } finally {
      process.env = saved;
    }

    const input = await photoWithGps();
    const res = await request(appFor(mod, true)).post('/u').attach('image', input, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.statusCode).toBe(200);
    expect(res.body.filename).toMatch(/^https:\/\/res\.cloudinary\.com\/democloud\//);
    expect(upload_stream).toHaveBeenCalledTimes(1);

    const sent = received[0];
    expect(sent.equals(input)).toBe(false);
    expect((await sharp(sent).metadata()).exif).toBeUndefined();
    expect(sent.includes(Buffer.from('LeakyCam'))).toBe(false);

    // And a file that is not an image never reaches Cloudinary.
    const bad = await request(appFor(mod, true)).post('/u')
      .attach('image', Buffer.from('<svg/>'), { filename: 'a.svg', contentType: 'image/png' });
    expect(bad.statusCode).toBe(400);
    expect(upload_stream).toHaveBeenCalledTimes(1);
  });
});
