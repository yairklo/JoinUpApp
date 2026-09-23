const express = require('express');
const { prisma } = require('../lib/prisma');
const { authenticateToken } = require('../utils/auth');
const { requireAdmin } = require('../utils/admin');
const { createRateLimiter } = require('../middleware/rateLimit');
const { sanitizeFreeText } = require('../utils/sanitize');
const { SPORT_KEYS } = require('../shared/sports');
const { validateOptionalFieldExtras, mapFieldForClient } = require('./fields');

// "הצע מגרש חדש": a user asks the team to add a venue to the public field list. Submitting
// only records a PENDING FieldSuggestion -- it never creates a Field, so the venue can't show
// up in field search/pickers until an admin approves it (which creates the real Field).
const router = express.Router();

const NAME_MAX_LENGTH = 200;
const ADDRESS_MAX_LENGTH = 300;
const CONTACT_MAX_LENGTH = 200;
const NOTE_MAX_LENGTH = 500;
const DEFAULT_FIELD_IMAGE = 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=300&fit=crop';

const submitLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 5, prefix: 'field-suggest' });

const USER_SELECT = { select: { id: true, name: true, imageUrl: true } };

function optionalFiniteNumber(value) {
  if (value === undefined || value === null || value === '') return { value: null };
  const n = Number(value);
  return Number.isFinite(n) ? { value: n } : { error: true };
}

// POST /api/field-suggestions - submit a venue suggestion (any signed-in user)
router.post('/', authenticateToken, submitLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    const name = typeof body.name === 'string' ? sanitizeFreeText(body.name.trim(), NAME_MAX_LENGTH).trim() : '';
    const address = typeof body.address === 'string' ? sanitizeFreeText(body.address.trim(), ADDRESS_MAX_LENGTH).trim() : '';
    if (!name || !address) {
      return res.status(400).json({ error: 'name and address are required' });
    }
    if (body.isPaid !== undefined && body.isPaid !== null && typeof body.isPaid !== 'boolean') {
      return res.status(400).json({ error: 'isPaid must be true, false or null' });
    }
    const contactInfo = typeof body.contactInfo === 'string'
      ? sanitizeFreeText(body.contactInfo.trim(), CONTACT_MAX_LENGTH).trim()
      : '';
    const lat = optionalFiniteNumber(body.lat);
    const lng = optionalFiniteNumber(body.lng);
    if (lat.error || lng.error) {
      return res.status(400).json({ error: 'lat/lng must be valid numbers' });
    }
    const sport = body.sport ? String(body.sport).toUpperCase() : null;
    if (sport && !SPORT_KEYS.includes(sport)) {
      return res.status(400).json({ error: 'Invalid sport' });
    }

    const suggestion = await prisma.fieldSuggestion.create({
      data: {
        userId: req.user.id,
        name,
        address,
        isPaid: typeof body.isPaid === 'boolean' ? body.isPaid : null,
        contactInfo: contactInfo || null,
        lat: lat.value,
        lng: lng.value,
        sport,
      },
    });
    res.status(201).json({ id: suggestion.id, status: suggestion.status });
  } catch (error) {
    console.error('Create field suggestion error:', error);
    res.status(500).json({ error: 'Failed to submit suggestion' });
  }
});

// GET /api/field-suggestions - admin queue of PENDING suggestions, newest first
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const rows = await prisma.fieldSuggestion.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { user: USER_SELECT },
    });
    res.json(rows);
  } catch (error) {
    console.error('List field suggestions error:', error);
    res.status(500).json({ error: 'Failed to list field suggestions' });
  }
});

// POST /api/field-suggestions/:id/approve - create the real Field and mark the suggestion
// APPROVED, atomically. Body = the same payload the admin create-field endpoint
// (POST /api/fields) takes, so the admin can correct the details before publishing.
router.post('/:id/approve', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, location, city, price, type, image } = req.body || {};
    if (!name || !location || !type) {
      return res.status(400).json({ error: 'Name, location and type are required' });
    }
    if (!['open', 'closed'].includes(type)) {
      return res.status(400).json({ error: 'Type must be "open" or "closed"' });
    }
    const extras = validateOptionalFieldExtras(req.body);
    if (extras.error) {
      return res.status(400).json({ error: extras.error });
    }

    const result = await prisma.$transaction(async (tx) => {
      const suggestion = await tx.fieldSuggestion.findUnique({ where: { id: req.params.id } });
      if (!suggestion) return { status: 404 };
      if (suggestion.status !== 'PENDING') return { status: 409 };

      const field = await tx.field.create({
        data: {
          name,
          location,
          city: city || null,
          price: type === 'open' ? 0 : (price || 0),
          rating: 0,
          image: image || DEFAULT_FIELD_IMAGE,
          available: true,
          type: type === 'closed' ? 'CLOSED' : 'OPEN',
          ...extras.data,
        },
      });
      // Conditional on still being PENDING so two admins approving at once can't both create a Field.
      const { count } = await tx.fieldSuggestion.updateMany({
        where: { id: suggestion.id, status: 'PENDING' },
        data: { status: 'APPROVED', createdFieldId: field.id, resolvedAt: new Date() },
      });
      if (count !== 1) throw Object.assign(new Error('Suggestion already resolved'), { code: 'ALREADY_RESOLVED' });
      return { status: 201, field };
    });

    if (result.status === 404) return res.status(404).json({ error: 'Suggestion not found' });
    if (result.status === 409) return res.status(409).json({ error: 'Suggestion already resolved' });
    res.status(201).json(mapFieldForClient(result.field));
  } catch (error) {
    if (error.code === 'ALREADY_RESOLVED') {
      return res.status(409).json({ error: 'Suggestion already resolved' });
    }
    console.error('Approve field suggestion error:', error);
    res.status(500).json({ error: 'Failed to approve suggestion' });
  }
});

// POST /api/field-suggestions/:id/reject - dismiss without creating a Field
router.post('/:id/reject', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const note = typeof req.body?.adminNote === 'string'
      ? sanitizeFreeText(req.body.adminNote.trim(), NOTE_MAX_LENGTH).trim()
      : '';
    const { count } = await prisma.fieldSuggestion.updateMany({
      where: { id: req.params.id, status: 'PENDING' },
      data: { status: 'REJECTED', adminNote: note || null, resolvedAt: new Date() },
    });
    if (count !== 1) {
      const exists = await prisma.fieldSuggestion.findUnique({ where: { id: req.params.id }, select: { id: true } });
      return exists
        ? res.status(409).json({ error: 'Suggestion already resolved' })
        : res.status(404).json({ error: 'Suggestion not found' });
    }
    res.json({ id: req.params.id, status: 'REJECTED' });
  } catch (error) {
    console.error('Reject field suggestion error:', error);
    res.status(500).json({ error: 'Failed to reject suggestion' });
  }
});

module.exports = router;
