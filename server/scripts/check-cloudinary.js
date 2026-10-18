// Real end-to-end check of the upload path: sends a 1x1 PNG through the same middleware the routes
// use, prints the resulting URL, verifies it is served from res.cloudinary.com, then deletes it.
// Usage: CLOUDINARY_URL='cloudinary://<key>:<secret>@<cloud>' node scripts/check-cloudinary.js
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
const express = require('express');
const request = require('supertest');
const { createImageUpload, handleSingleUpload, absoluteUrlFor, deleteUploadedFile } = require('../middleware/upload');

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

(async () => {
  const app = express();
  app.post('/u', handleSingleUpload(createImageUpload('healthcheck'), 'image'), (req, res) => {
    res.json({ url: absoluteUrlFor(req, 'healthcheck', req.file.filename) });
  });
  const res = await request(app).post('/u').attach('image', TINY_PNG, 'x.png');
  if (res.status !== 200) throw new Error(`upload failed: ${res.status} ${JSON.stringify(res.body)}`);
  const { url } = res.body;
  console.log('uploaded:', url);
  if (!url.startsWith('https://res.cloudinary.com/')) throw new Error('URL is not a Cloudinary URL');
  const head = await fetch(url);
  console.log('GET status:', head.status);
  if (!head.ok) throw new Error('uploaded image is not reachable');
  deleteUploadedFile(url);
  console.log('OK: Cloudinary upload works (test image deleted)');
  setTimeout(() => process.exit(0), 1500);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
