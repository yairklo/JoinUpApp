const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');
const { mountUploads } = require('../middleware/uploadsStatic');

describe('mountUploads', () => {
  let dir;
  let app;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-test-'));
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.writeFileSync(path.join(dir, 'sub', 'a.txt'), 'hello');
    app = express();
    mountUploads(app, dir);
    app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('serves an existing file', async () => {
    const res = await request(app).get('/uploads/sub/a.txt');
    expect(res.status).toBe(200);
    expect(res.text).toBe('hello');
  });

  it('answers a missing file with an empty non-JSON 404', async () => {
    const res = await request(app).get('/uploads/sub/missing.jpg');
    expect(res.status).toBe(404);
    expect(res.text).toBe('');
    expect(res.headers['content-type'] || '').not.toMatch(/json/);
    expect(res.headers['cache-control']).toBe('public, max-age=300');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('answers HEAD for a missing file with 404', async () => {
    const res = await request(app).head('/uploads/x/y.png');
    expect(res.status).toBe(404);
  });
});
