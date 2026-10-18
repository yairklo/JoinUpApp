// Cloudinary branch of middleware/upload.js, with the SDK mocked (no network). The module reads
// CLOUDINARY_URL at require time, so each scenario re-requires it after jest.resetModules.
const express = require('express');
const request = require('supertest');
const { PassThrough } = require('stream');

jest.setTimeout(15000);

const CLOUD = 'democloud';
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

function load(env = {}) {
  const saved = { ...process.env };
  delete process.env.CLOUDINARY_URL;
  delete process.env.ALLOW_DISK_UPLOADS;
  Object.assign(process.env, { NODE_ENV: 'test' }, env);
  const destroy = jest.fn().mockResolvedValue({ result: 'ok' });
  const upload_stream = jest.fn((opts, cb) => {
    const s = new PassThrough();
    s.on('finish', () => cb(null, {
      secure_url: `https://res.cloudinary.com/${CLOUD}/image/upload/v1/${opts.folder}/${opts.public_id}.png`,
      public_id: `${opts.folder}/${opts.public_id}`,
      bytes: 68,
    }));
    s.resume();
    return s;
  });
  // The SDK is required lazily at call time, so the mock must stay registered (no isolateModules).
  jest.resetModules();
  jest.doMock('cloudinary', () => ({ v2: { uploader: { upload_stream, destroy } } }));
  let mod;
  try {
    mod = require('../middleware/upload');
  } finally {
    process.env = saved;
  }
  return { mod, destroy, upload_stream };
}

const CLOUD_ENV = { CLOUDINARY_URL: `cloudinary://key:secret@${CLOUD}` };
const url = (id) => `https://res.cloudinary.com/${CLOUD}/image/upload/v123/joinup/users/${id}.png`;

describe('upload.js boot check', () => {
  test('throws when CLOUDINARY_URL is missing outside test/development', () => {
    expect(() => load({ NODE_ENV: 'production' })).toThrow(/CLOUDINARY_URL is not set/);
  });
  test('ALLOW_DISK_UPLOADS=true opts back in', () => {
    expect(() => load({ NODE_ENV: 'production', ALLOW_DISK_UPLOADS: 'true' })).not.toThrow();
  });
  test('throws on a malformed URL without echoing the secret', () => {
    let err;
    try { load({ CLOUDINARY_URL: 'CLOUDINARY_URL=cloudinary://k:topsecret@c' }); } catch (e) { err = e; }
    expect(err.message).toMatch(/malformed/);
    expect(err.message).not.toContain('topsecret');
  });
  test('accepts a URL with a query string', () => {
    expect(() => load({ CLOUDINARY_URL: `cloudinary://k:s@${CLOUD}?secure_distribution=x.com` })).not.toThrow();
  });
});

describe('Cloudinary storage', () => {
  function app(mod, status = 200) {
    const a = express();
    a.post('/u', mod.handleSingleUpload(mod.createImageUpload('users'), 'image'), (req, res) => {
      res.status(status).json({ url: mod.absoluteUrlFor(req, 'users', req.file.filename) });
    });
    return a;
  }
  const flush = () => new Promise((r) => setTimeout(r, 50));

  test('uploads to the folder with a random public_id and returns the https URL untouched', async () => {
    const { mod, upload_stream, destroy } = load(CLOUD_ENV);
    const res = await request(app(mod)).post('/u').attach('image', TINY_PNG, 'a.png');
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(new RegExp(`^https://res\.cloudinary\.com/${CLOUD}/image/upload/v1/joinup/users/[0-9a-f-]{36}\.png$`));
    expect(upload_stream.mock.calls[0][0]).toMatchObject({ folder: 'joinup/users', resource_type: 'image' });
    await flush();
    expect(destroy).not.toHaveBeenCalled();
  });

  test('destroys the stored image when the route answers with an error (no orphans)', async () => {
    const { mod, destroy } = load(CLOUD_ENV);
    const res = await request(app(mod, 403)).post('/u').attach('image', TINY_PNG, 'a.png');
    expect(res.status).toBe(403);
    await flush();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(destroy.mock.calls[0][0]).toMatch(/^joinup\/users\/[0-9a-f-]{36}$/);
  });

  test('rejects a disallowed MIME type before touching Cloudinary', async () => {
    const { mod, upload_stream } = load(CLOUD_ENV);
    const res = await request(app(mod)).post('/u')
      .attach('image', Buffer.from('x'), { filename: 'a.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(upload_stream).not.toHaveBeenCalled();
  });
});

describe('deleteUploadedFile (Cloudinary URLs)', () => {
  test('destroys our own image by public_id', () => {
    const { mod, destroy } = load(CLOUD_ENV);
    mod.deleteUploadedFile(url('abc'));
    expect(destroy).toHaveBeenCalledWith('joinup/users/abc', { invalidate: true });
  });
  test('handles transformation segments and no version', () => {
    const { mod, destroy } = load(CLOUD_ENV);
    mod.deleteUploadedFile(`https://res.cloudinary.com/${CLOUD}/image/upload/c_fill,w_100/joinup/users/abc.png?x=1`);
    expect(destroy).toHaveBeenCalledWith('joinup/users/abc', { invalidate: true });
  });
  test.each([
    ['another cloud', 'https://res.cloudinary.com/othercloud/image/upload/v1/joinup/users/abc.png'],
    ['outside our folder', `https://res.cloudinary.com/${CLOUD}/image/upload/v1/other/abc.png`],
    ['path traversal', `https://res.cloudinary.com/${CLOUD}/image/upload/v1/joinup/../other/abc.png`],
    ['bad percent-encoding', `https://res.cloudinary.com/${CLOUD}/image/upload/v1/joinup/%E0%A4%A.png`],
  ])('ignores %s', (_n, u) => {
    const { mod, destroy } = load(CLOUD_ENV);
    expect(() => mod.deleteUploadedFile(u)).not.toThrow();
    expect(destroy).not.toHaveBeenCalled();
  });
  test('a failing destroy is swallowed (logged), never thrown', async () => {
    const { mod, destroy } = load(CLOUD_ENV);
    destroy.mockRejectedValueOnce(new Error('boom'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => mod.deleteUploadedFile(url('abc'))).not.toThrow();
    await new Promise((r) => setTimeout(r, 20));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
  test('isManagedUploadUrl recognises only our URLs', () => {
    const { mod } = load(CLOUD_ENV);
    expect(mod.isManagedUploadUrl(url('abc'))).toBe(true);
    expect(mod.isManagedUploadUrl('http://x/uploads/users/a.png')).toBe(true);
    expect(mod.isManagedUploadUrl('https://img.clerk.com/a.png')).toBe(false);
  });
  test('disk delete rejects sibling directories sharing the uploads prefix', () => {
    const { mod } = load();
    expect(mod.isManagedUploadUrl('/uploads/../uploads-private/x.png')).toBe(false);
  });
});
