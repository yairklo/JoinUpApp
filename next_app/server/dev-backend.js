/* Dev backend to provide minimal API for frontend development
 * - Serves /api/fields from src/data/fields.json
 * - Provides lightweight stubs for /api/games, /api/users, /api/messages
 * - Intended for local development only (port 3005)
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));

const port = process.env.PORT || 3005;
const dataDir = path.join(__dirname, '..', 'src', 'data');

function loadFields() {
  const fieldsFile = path.join(dataDir, 'fields.json');
  if (!fs.existsSync(fieldsFile)) return [];
  try {
    const raw = fs.readFileSync(fieldsFile, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load fields.json', e);
    return [];
  }
}

let fields = loadFields();

// GET /api/fields
app.get('/api/fields', (req, res) => {
  res.json(fields);
});

// GET /api/fields/:id
app.get('/api/fields/:id', (req, res) => {
  const id = req.params.id;
  const f = fields.find((x) => String(x.id) === String(id));
  if (!f) return res.status(404).json({ error: 'Not found' });
  res.json(f);
});

// games endpoints (stubs)
app.get('/api/games', (req, res) => {
  return res.json([]);
});
app.post('/api/games', (req, res) => {
  return res.status(201).json({ id: 'mock-game-id', ...req.body });
});
app.post('/api/games/:id/join', (req, res) => {
  return res.status(204).end();
});
app.post('/api/games/:id/leave', (req, res) => {
  return res.status(204).end();
});

// users endpoints (simple stubs)
app.get('/api/users/:id', (req, res) => {
  res.json({ id: req.params.id, name: 'Dev User' });
});
app.get('/api/users/:id/favorites', (req, res) => {
  // return empty list - this is fine for UI behavior
  res.json([]);
});
app.post('/api/users/:id/favorites/:fieldId', (req, res) => {
  res.status(201).json({});
});
app.delete('/api/users/:id/favorites/:fieldId', (req, res) => {
  res.status(204).end();
});

// messages
app.get('/api/messages', (req, res) => {
  res.json([]);
});
app.post('/api/messages', (req, res) => {
  res.status(201).json({ id: 'mock-msg', ...req.body });
});

// reload route to refresh fields.json without restarting
app.post('/_reload-fields', (req, res) => {
  fields = loadFields();
  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`Dev backend listening at http://localhost:${port}`);
});
