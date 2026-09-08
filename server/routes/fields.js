const express = require('express');
const { prisma } = require('../lib/prisma');
const dataManager = require('../utils/dataManager');
const { getJerusalemDayHour } = require('../utils/timezone');

function mapFieldForClient(f) {
  if (!f) return f;
  const favoritesCount = (f._count && typeof f._count.favorites === 'number') ? f._count.favorites : (f.favoritesCount || 0);
  const upcomingGamesCount = (f._count && typeof f._count.games === 'number') ? f._count.games : 0;
  return { ...f, type: f.type === 'CLOSED' ? 'closed' : 'open', favoritesCount, upcomingGamesCount };
}

const MAP_FIELD_SELECT = {
  id: true,
  name: true,
  lat: true,
  lng: true,
  city: true,
  location: true,
  supportedSports: true,
  type: true,
};

function mapFieldForMapClient(f) {
  return {
    id: f.id,
    name: f.name,
    lat: f.lat,
    lng: f.lng,
    city: f.city,
    location: f.location,
    supportedSports: f.supportedSports,
    type: f.type === 'CLOSED' ? 'closed' : 'open',
  };
}

function buildFieldSearchWhere(query) {
  const { location, type, available, minLat, maxLat, minLng, maxLng } = query;
  const where = {};
  if (location) where.location = { contains: String(location), mode: 'insensitive' };
  if (type) where.type = String(type).toUpperCase() === 'CLOSED' ? 'CLOSED' : 'OPEN';
  if (typeof available === 'undefined') {
    where.available = true;
  } else {
    where.available = String(available) === 'true';
  }
  if (minLat && maxLat && minLng && maxLng) {
    where.lat = { gte: parseFloat(minLat), lte: parseFloat(maxLat) };
    where.lng = { gte: parseFloat(minLng), lte: parseFloat(maxLng) };
  }
  return where;
}

function hasBoundingBox(query) {
  const { minLat, maxLat, minLng, maxLng } = query;
  return !!(minLat && maxLat && minLng && maxLng);
}

const VALID_SPORT_TYPES = ['SOCCER', 'BASKETBALL', 'TENNIS'];

// Validates the 9 optional Field detail columns shared by POST/PUT. Returns
// { data } with only the keys present in `body` (so callers can spread the
// result into a create/update payload without disturbing omitted fields), or
// { error } if something present is invalid. Callers must check `error` and
// bail out (400) before touching the database, so an invalid field never lets
// other valid fields in the same request partially commit.
function validateOptionalFieldExtras(body) {
  const data = {};
  const stringFields = ['description', 'phone', 'email', 'neighborhood', 'street', 'streetNumber'];
  for (const field of stringFields) {
    if (body[field] !== undefined) data[field] = body[field] || null;
  }

  if (body.supportedSports !== undefined) {
    const sports = Array.isArray(body.supportedSports) ? body.supportedSports.map((v) => String(v).toUpperCase()) : null;
    if (!sports || sports.length === 0 || !sports.every((v) => VALID_SPORT_TYPES.includes(v))) {
      return { error: 'supportedSports must be a non-empty array of SOCCER/BASKETBALL/TENNIS' };
    }
    data.supportedSports = sports;
  }

  if (body.lat !== undefined) {
    const lat = Number(body.lat);
    if (!Number.isFinite(lat)) return { error: 'lat/lng must be valid numbers' };
    data.lat = lat;
  }

  if (body.lng !== undefined) {
    const lng = Number(body.lng);
    if (!Number.isFinite(lng)) return { error: 'lat/lng must be valid numbers' };
    data.lng = lng;
  }

  return { data };
}

const { authenticateToken, attachOptionalUser } = require('../utils/auth');
const { requireAdmin } = require('../utils/admin');
const { createImageUpload, handleSingleUpload, absoluteUrlFor, deleteUploadedFile } = require('../middleware/upload');

const router = express.Router();
const fieldImageUpload = createImageUpload('fields');

// Adds the browse/admin pages' free-text (name/location/city/neighborhood/
// street) and sport filters on top of a base where-clause. Only touches the
// query when `q`/`sport` are actually present, so callers that never send
// them (map, game-creator pickers) see no behavior change.
function applyBrowseFilters(where, query) {
  const { q, sport, city } = query;
  if (q) {
    where.OR = ['name', 'location', 'city', 'neighborhood', 'street'].map((field) => ({
      [field]: { contains: String(q), mode: 'insensitive' },
    }));
  }
  if (sport && sport !== 'ALL') {
    where.supportedSports = { has: String(sport).toUpperCase() };
  }
  if (city) {
    where.city = String(city);
  }
  return where;
}

// Get all fields. Pass `take` to page the result as { items, total, hasMore }
// instead of a bare array — used by the public fields browser so it doesn't
// have to fetch and render the entire (900+ row) table on every load.
router.get('/', attachOptionalUser, async (req, res) => {
  try {
    const includeUnavailable = String(req.query.includeUnavailable) === 'true' && !!req.user?.isAdmin;
    const where = applyBrowseFilters(includeUnavailable ? {} : { available: true }, req.query);

    if (typeof req.query.take !== 'undefined') {
      const take = Math.min(Math.max(parseInt(req.query.take, 10) || 24, 1), 100);
      const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);
      const [fields, total] = await Promise.all([
        prisma.field.findMany({
          where,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          include: { _count: { select: { favorites: true } } },
          take,
          skip,
        }),
        prisma.field.count({ where }),
      ]);
      return res.json({ items: fields.map(mapFieldForClient), total, hasMore: skip + fields.length < total });
    }

    const fields = await prisma.field.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { _count: { select: { favorites: true } } }
    });
    res.json(fields.map(mapFieldForClient));
  } catch (error) {
    console.error('Get fields error:', error);
    // Fallback: serve from local JSON for dev environments without DB
    try {
      const fields = await dataManager.readData('fields.json');
      const filtered = fields.filter((f) => f.available !== false);
      return res.json(filtered.map(mapFieldForClient));
    } catch (fallbackErr) {
      console.error('Fallback read fields.json failed:', fallbackErr);
      return res.status(500).json({ error: 'Failed to get fields' });
    }
  }
});

// Get list of unique cities
router.get('/cities', async (req, res) => {
  try {
    const { q } = req.query;
    const where = {
      city: { not: null },
    };
    if (q) {
      where.city = { ...where.city, contains: String(q), mode: 'insensitive' };
    }

    const fields = await prisma.field.findMany({
      where,
      select: { city: true },
      distinct: ['city'],
      orderBy: { city: 'asc' }
    });

    const cities = fields.map(f => f.city).filter(Boolean);
    res.json(cities);
  } catch (error) {
    console.error('Get cities error:', error);
    res.status(500).json({ error: 'Failed to get cities' });
  }
});

// Most active city by upcoming/recent game volume -- used as the guest default city
// (no saved city, no GPS permission) instead of a hardcoded literal.
router.get('/cities/top', async (req, res) => {
  try {
    const rows = await prisma.$queryRaw`
      SELECT f.city AS city, COUNT(g.id)::int AS count
      FROM "Field" f
      JOIN "Game" g ON g."fieldId" = f.id
      WHERE f.city IS NOT NULL
        AND g.start >= NOW() - INTERVAL '30 days'
      GROUP BY f.city
      ORDER BY count DESC
      LIMIT 1
    `;
    res.json({ city: rows[0]?.city || null });
  } catch (error) {
    console.error('Get top city error:', error);
    res.status(500).json({ error: 'Failed to get top city' });
  }
});

// Slim bbox query for map markers — no relational counts
router.get('/map', async (req, res) => {
  try {
    if (!hasBoundingBox(req.query)) {
      return res.status(400).json({ error: 'Bounding box (minLat, maxLat, minLng, maxLng) is required' });
    }
    const fields = await prisma.field.findMany({
      where: buildFieldSearchWhere(req.query),
      orderBy: { name: 'asc' },
      select: MAP_FIELD_SELECT,
    });
    res.json(fields.map(mapFieldForMapClient));
  } catch (error) {
    console.error('Map fields error:', error);
    return res.status(503).json({ error: 'Failed to load map fields' });
  }
});

// Search fields
router.get('/search', async (req, res) => {
  try {
    const { date, map } = req.query;
    const where = buildFieldSearchWhere(req.query);

    const useMapMode = map === '1' || map === 'true';
    if (useMapMode) {
      const fields = await prisma.field.findMany({
        where,
        orderBy: { name: 'asc' },
        select: MAP_FIELD_SELECT,
      });
      return res.json(fields.map(mapFieldForMapClient));
    }

    let startOfDay, endOfDay;
    if (date) {
      const d = new Date(String(date));
      startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    }

    const fields = await prisma.field.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            favorites: true,
            games: {
              where: {
                start: date ? {
                  gte: startOfDay,
                  lte: endOfDay
                } : {
                  gte: new Date()
                },
                status: 'OPEN'
              }
            }
          }
        }
      }
    });
    res.json(fields.map(mapFieldForClient));
  } catch (error) {
    console.error('Search fields error:', error);
    if (hasBoundingBox(req.query)) {
      return res.status(503).json({ error: 'Failed to search fields' });
    }
    // Fallback: filter local JSON (non-bbox text search only)
    try {
      const { location, type, available } = req.query;
      const raw = await dataManager.readData('fields.json');
      const filtered = raw.filter((f) => {
        const matchLocation = location ? (f.location || '').toLowerCase().includes(String(location).toLowerCase()) : true;
        const matchType = type ? ((String(type).toLowerCase() === 'closed') ? (String(f.type).toLowerCase() === 'closed') : (String(f.type).toLowerCase() !== 'closed')) : true;
        const matchAvail = typeof available !== 'undefined'
          ? (String(available) === 'true' ? f.available !== false : f.available === false)
          : f.available !== false;
        return matchLocation && matchType && matchAvail;
      });
      return res.json(filtered.map(mapFieldForClient));
    } catch (fallbackErr) {
      console.error('Fallback search fields.json failed:', fallbackErr);
      return res.status(500).json({ error: 'Failed to search fields' });
    }
  }
});

// Get fields by type
router.get('/type/:type', async (req, res) => {
  try {
    const { type } = req.params;

    if (!['open', 'closed'].includes(type)) {
      return res.status(400).json({ error: 'Type must be "open" or "closed"' });
    }
    const fields = await prisma.field.findMany({
      where: { type: type.toUpperCase() === 'CLOSED' ? 'CLOSED' : 'OPEN', available: true },
      include: { _count: { select: { favorites: true } } }
    });
    res.json(fields.map(mapFieldForClient));
  } catch (error) {
    console.error('Get fields by type error:', error);
    // Fallback: filter local JSON
    try {
      const { type } = req.params;
      if (!['open', 'closed'].includes(type)) {
        return res.status(400).json({ error: 'Type must be "open" or "closed"' });
      }
      const raw = await dataManager.readData('fields.json');
      const filtered = raw.filter((f) => (f.available !== false) && (String(f.type).toLowerCase() === String(type).toLowerCase()));
      return res.json(filtered.map(mapFieldForClient));
    } catch (fallbackErr) {
      console.error('Fallback type filter fields.json failed:', fallbackErr);
      return res.status(500).json({ error: 'Failed to get fields by type' });
    }
  }
});

// How far back crowd reports count toward the busy-times profile.
// Keeps the chart responsive to seasonal/schedule changes at the field.
const REPORT_WINDOW_DAYS = 90;
// Minimum gap between two reports from the same user for the same field.
const REPORT_THROTTLE_MINUTES = 60;

// GET /api/fields/:id/analytics - Field profile analytics:
// upcoming week's schedule + crowdsourced 7x24 busy-times profile.
router.get('/:id/analytics', authenticateToken, async (req, res) => {
  try {
    const fieldId = req.params.id;
    const field = await prisma.field.findUnique({ where: { id: fieldId }, select: { id: true } });
    if (!field) {
      return res.status(404).json({ error: 'Field not found' });
    }

    const now = new Date();
    const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const windowStart = new Date(now.getTime() - REPORT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const [games, grouped] = await Promise.all([
      // Upcoming week's schedule. Friends-only games are excluded so private
      // matches never leak on a public field profile.
      prisma.game.findMany({
        where: {
          fieldId,
          status: 'OPEN',
          isFriendsOnly: false,
          start: { gte: now, lt: weekAhead }
        },
        orderBy: { start: 'asc' },
        select: {
          id: true,
          title: true,
          start: true,
          duration: true,
          sport: true,
          maxPlayers: true,
          price: true,
          joinPolicy: true,
          participants: {
            where: { status: 'CONFIRMED' },
            select: { id: true }
          }
        }
      }),
      // Crowd density profile: average busyLevel per (dayOfWeek, hour) cell
      // over the rolling report window.
      prisma.fieldReport.groupBy({
        by: ['dayOfWeek', 'hour'],
        where: { fieldId, createdAt: { gte: windowStart } },
        _avg: { busyLevel: true },
        _count: { id: true }
      })
    ]);

    // Dense 7x24 matrix. Cells without data stay { avg: null, samples: 0 } —
    // "no data" is deliberately distinct from "empty field" on the clients.
    const busyProfile = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => ({ avg: null, samples: 0 }))
    );
    let totalReports = 0;
    grouped.forEach(cell => {
      if (cell.dayOfWeek >= 0 && cell.dayOfWeek <= 6 && cell.hour >= 0 && cell.hour <= 23) {
        busyProfile[cell.dayOfWeek][cell.hour] = {
          avg: cell._avg.busyLevel !== null ? Math.round(cell._avg.busyLevel * 10) / 10 : null,
          samples: cell._count.id
        };
        totalReports += cell._count.id;
      }
    });

    res.json({
      schedule: games.map(g => ({
        id: g.id,
        title: g.title,
        start: g.start,
        duration: g.duration,
        sport: g.sport,
        maxPlayers: g.maxPlayers,
        price: g.price,
        joinPolicy: g.joinPolicy,
        confirmedCount: g.participants.length
      })),
      busyProfile,
      totalReports,
      reportWindowDays: REPORT_WINDOW_DAYS
    });
  } catch (error) {
    console.error('Get field analytics error:', error);
    res.status(500).json({ error: 'Failed to get field analytics' });
  }
});

// POST /api/fields/:id/report - Submit a live crowd status for a field.
// Throttled to one report per user per field per hour.
router.post('/:id/report', authenticateToken, async (req, res) => {
  try {
    const fieldId = req.params.id;
    const busyLevel = parseInt(req.body?.busyLevel, 10);

    if (!Number.isInteger(busyLevel) || busyLevel < 1 || busyLevel > 5) {
      return res.status(400).json({ error: 'busyLevel must be an integer between 1 and 5' });
    }

    const field = await prisma.field.findUnique({ where: { id: fieldId }, select: { id: true } });
    if (!field) {
      return res.status(404).json({ error: 'Field not found' });
    }

    const throttleCutoff = new Date(Date.now() - REPORT_THROTTLE_MINUTES * 60 * 1000);
    const recent = await prisma.fieldReport.findFirst({
      where: { fieldId, userId: req.user.id, createdAt: { gte: throttleCutoff } },
      select: { id: true }
    });
    if (recent) {
      // Soft response: the widget already showed its thank-you state; no need to error.
      return res.json({ ok: true, throttled: true });
    }

    const { dayOfWeek, hour } = getJerusalemDayHour();
    await prisma.fieldReport.create({
      data: { fieldId, userId: req.user.id, dayOfWeek, hour, busyLevel }
    });

    res.status(201).json({ ok: true, throttled: false });
  } catch (error) {
    console.error('Submit field report error:', error);
    res.status(500).json({ error: 'Failed to submit field report' });
  }
});

const VALID_ISSUE_CATEGORIES = ['POTHOLE', 'LIGHTING', 'SURFACE', 'GOAL_NET', 'FENCE', 'OTHER'];
const VALID_FLAG_REASONS = ['OFFENSIVE', 'FALSE_INFO', 'SPAM', 'OTHER'];
const MAX_TEXT_LENGTH = 1000;
const USER_SELECT = { id: true, name: true, imageUrl: true };

// Field comments/issue-reports are a separate, lighter-weight moderation surface from
// the account-level Clerk `isBanned` flag (server/routes/admin.js) -- a user can be
// blocked here without losing access to the rest of the app. authenticateToken's
// req.user comes from Clerk only, so this column (on our own User row) needs its own lookup.
async function isBlockedFromFieldSocial(userId) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { blockedFromFieldSocial: true } });
  return !!u?.blockedFromFieldSocial;
}

function reactionSummary(reactions, viewerId) {
  const likeCount = (reactions || []).filter((r) => r.type === 'LIKE').length;
  const dislikeCount = (reactions || []).filter((r) => r.type === 'DISLIKE').length;
  const viewerReaction = viewerId ? (reactions || []).find((r) => r.userId === viewerId)?.type || null : null;
  return { likeCount, dislikeCount, viewerReaction };
}

function mapCommentForClient(c, viewerId) {
  return {
    id: c.id,
    parentId: c.parentId,
    text: c.text,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    edited: c.updatedAt.getTime() !== c.createdAt.getTime(),
    user: c.user,
    ...reactionSummary(c.reactions, viewerId),
    replies: (c.replies || []).map((r) => mapCommentForClient(r, viewerId)),
  };
}

function mapIssueForClient(i, viewerId) {
  return {
    id: i.id,
    parentId: i.parentId,
    category: i.category,
    description: i.description,
    photoUrl: i.photoUrl,
    status: i.status,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
    edited: i.updatedAt.getTime() !== i.createdAt.getTime(),
    user: i.user,
    ...reactionSummary(i.reactions, viewerId),
    replies: (i.replies || []).map((r) => mapIssueForClient(r, viewerId)),
  };
}

const REPLIES_INCLUDE = {
  orderBy: { createdAt: 'asc' },
  include: { user: { select: USER_SELECT }, reactions: true },
};

// GET /api/fields/:id/comments - Public list of player comments on a field
// (top-level comments with one level of replies nested inside each).
router.get('/:id/comments', attachOptionalUser, async (req, res) => {
  try {
    const fieldId = req.params.id;
    const comments = await prisma.fieldComment.findMany({
      where: { fieldId, parentId: null },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: USER_SELECT }, reactions: true, replies: REPLIES_INCLUDE },
    });
    res.json(comments.map((c) => mapCommentForClient(c, req.user?.id)));
  } catch (error) {
    console.error('Get field comments error:', error);
    res.status(500).json({ error: 'Failed to get field comments' });
  }
});

// POST /api/fields/:id/comments - Add a comment, or (with parentId) a single-level reply to one.
router.post('/:id/comments', authenticateToken, async (req, res) => {
  try {
    const fieldId = req.params.id;
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    const parentId = typeof req.body?.parentId === 'string' ? req.body.parentId : null;

    if (!text || text.length > MAX_TEXT_LENGTH) {
      return res.status(400).json({ error: `text must be a non-empty string up to ${MAX_TEXT_LENGTH} characters` });
    }
    if (await isBlockedFromFieldSocial(req.user.id)) {
      return res.status(403).json({ error: 'You are blocked from commenting on fields' });
    }

    const field = await prisma.field.findUnique({ where: { id: fieldId }, select: { id: true } });
    if (!field) {
      return res.status(404).json({ error: 'Field not found' });
    }

    if (parentId) {
      const parent = await prisma.fieldComment.findUnique({ where: { id: parentId }, select: { fieldId: true, parentId: true } });
      if (!parent || parent.fieldId !== fieldId) {
        return res.status(404).json({ error: 'Parent comment not found' });
      }
      if (parent.parentId) {
        return res.status(400).json({ error: 'Cannot reply to a reply' });
      }
    }

    const comment = await prisma.fieldComment.create({
      data: { fieldId, userId: req.user.id, text, parentId },
      include: { user: { select: USER_SELECT }, reactions: true, replies: REPLIES_INCLUDE },
    });

    res.status(201).json(mapCommentForClient(comment, req.user.id));
  } catch (error) {
    console.error('Add field comment error:', error);
    res.status(500).json({ error: 'Failed to add field comment' });
  }
});

// PATCH /api/fields/:id/comments/:commentId - Edit own comment/reply text.
router.patch('/:id/comments/:commentId', authenticateToken, async (req, res) => {
  try {
    const { id: fieldId, commentId } = req.params;
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text || text.length > MAX_TEXT_LENGTH) {
      return res.status(400).json({ error: `text must be a non-empty string up to ${MAX_TEXT_LENGTH} characters` });
    }

    const comment = await prisma.fieldComment.findUnique({ where: { id: commentId } });
    if (!comment || comment.fieldId !== fieldId) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    if (comment.userId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to edit this comment' });
    }

    const updated = await prisma.fieldComment.update({
      where: { id: commentId },
      data: { text },
      include: { user: { select: USER_SELECT }, reactions: true, replies: REPLIES_INCLUDE },
    });
    res.json(mapCommentForClient(updated, req.user.id));
  } catch (error) {
    console.error('Edit field comment error:', error);
    res.status(500).json({ error: 'Failed to edit field comment' });
  }
});

// DELETE /api/fields/:id/comments/:commentId - Remove a comment (author or admin only).
// Cascades to its replies (schema onDelete: Cascade on parentId).
router.delete('/:id/comments/:commentId', authenticateToken, async (req, res) => {
  try {
    const { id: fieldId, commentId } = req.params;
    const comment = await prisma.fieldComment.findUnique({ where: { id: commentId } });
    if (!comment || comment.fieldId !== fieldId) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    if (comment.userId !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Not authorized to delete this comment' });
    }

    await prisma.fieldComment.delete({ where: { id: commentId } });
    res.json({ message: 'Comment deleted' });
  } catch (error) {
    console.error('Delete field comment error:', error);
    res.status(500).json({ error: 'Failed to delete field comment' });
  }
});

// POST /api/fields/:id/comments/:commentId/react - Toggle a like/dislike on a comment.
// Posting the same type the viewer already has clears their reaction; a different type replaces it.
router.post('/:id/comments/:commentId/react', authenticateToken, async (req, res) => {
  try {
    const { id: fieldId, commentId } = req.params;
    const type = String(req.body?.type || '').toUpperCase();
    if (!['LIKE', 'DISLIKE'].includes(type)) {
      return res.status(400).json({ error: 'type must be LIKE or DISLIKE' });
    }

    const comment = await prisma.fieldComment.findUnique({ where: { id: commentId }, select: { fieldId: true } });
    if (!comment || comment.fieldId !== fieldId) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const existing = await prisma.fieldCommentReaction.findUnique({
      where: { commentId_userId: { commentId, userId: req.user.id } },
    });
    if (existing && existing.type === type) {
      await prisma.fieldCommentReaction.delete({ where: { id: existing.id } });
    } else {
      await prisma.fieldCommentReaction.upsert({
        where: { commentId_userId: { commentId, userId: req.user.id } },
        create: { commentId, userId: req.user.id, type },
        update: { type },
      });
    }

    const reactions = await prisma.fieldCommentReaction.findMany({ where: { commentId } });
    res.json(reactionSummary(reactions, req.user.id));
  } catch (error) {
    console.error('React to field comment error:', error);
    res.status(500).json({ error: 'Failed to react to comment' });
  }
});

// POST /api/fields/:id/comments/:commentId/flag - Report a comment as offensive/false/spam
// for admin review (server/routes/admin.js's field-comment-flags list). Re-reporting the
// same comment just updates the reason/details (upsert on the unique commentId+reporter pair).
router.post('/:id/comments/:commentId/flag', authenticateToken, async (req, res) => {
  try {
    const { id: fieldId, commentId } = req.params;
    const reason = String(req.body?.reason || '').toUpperCase();
    const details = typeof req.body?.details === 'string' ? req.body.details.trim().slice(0, MAX_TEXT_LENGTH) : null;
    if (!VALID_FLAG_REASONS.includes(reason)) {
      return res.status(400).json({ error: `reason must be one of ${VALID_FLAG_REASONS.join(', ')}` });
    }

    const comment = await prisma.fieldComment.findUnique({ where: { id: commentId }, select: { fieldId: true } });
    if (!comment || comment.fieldId !== fieldId) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    await prisma.fieldCommentFlag.upsert({
      where: { commentId_reporterId: { commentId, reporterId: req.user.id } },
      create: { commentId, reporterId: req.user.id, reason, details },
      update: { reason, details, status: 'PENDING' },
    });

    res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Flag field comment error:', error);
    res.status(500).json({ error: 'Failed to report comment' });
  }
});

// GET /api/fields/:id/issues - Public list of reported physical defects at a field
// (top-level reports with one level of replies nested inside each).
router.get('/:id/issues', attachOptionalUser, async (req, res) => {
  try {
    const fieldId = req.params.id;
    const issues = await prisma.fieldIssueReport.findMany({
      where: { fieldId, parentId: null },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: USER_SELECT }, reactions: true, replies: REPLIES_INCLUDE },
    });
    res.json(issues.map((i) => mapIssueForClient(i, req.user?.id)));
  } catch (error) {
    console.error('Get field issues error:', error);
    res.status(500).json({ error: 'Failed to get field issues' });
  }
});

// POST /api/fields/:id/issues - Report a physical defect (category required), or
// (with parentId) a single-level reply to a report (plain text, no category).
router.post('/:id/issues', authenticateToken, async (req, res) => {
  try {
    const fieldId = req.params.id;
    const parentId = typeof req.body?.parentId === 'string' ? req.body.parentId : null;
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : null;

    if (description && description.length > MAX_TEXT_LENGTH) {
      return res.status(400).json({ error: `description must be up to ${MAX_TEXT_LENGTH} characters` });
    }
    if (await isBlockedFromFieldSocial(req.user.id)) {
      return res.status(403).json({ error: 'You are blocked from reporting issues on fields' });
    }

    const field = await prisma.field.findUnique({ where: { id: fieldId }, select: { id: true } });
    if (!field) {
      return res.status(404).json({ error: 'Field not found' });
    }

    let category = null;
    if (parentId) {
      if (!description) {
        return res.status(400).json({ error: 'description is required for a reply' });
      }
      const parent = await prisma.fieldIssueReport.findUnique({ where: { id: parentId }, select: { fieldId: true, parentId: true } });
      if (!parent || parent.fieldId !== fieldId) {
        return res.status(404).json({ error: 'Parent report not found' });
      }
      if (parent.parentId) {
        return res.status(400).json({ error: 'Cannot reply to a reply' });
      }
    } else {
      category = String(req.body?.category || '').toUpperCase();
      if (!VALID_ISSUE_CATEGORIES.includes(category)) {
        return res.status(400).json({ error: `category must be one of ${VALID_ISSUE_CATEGORIES.join(', ')}` });
      }
    }

    const issue = await prisma.fieldIssueReport.create({
      data: { fieldId, userId: req.user.id, category, description: description || null, parentId, status: 'OPEN' },
      include: { user: { select: USER_SELECT }, reactions: true, replies: REPLIES_INCLUDE },
    });

    res.status(201).json(mapIssueForClient(issue, req.user.id));
  } catch (error) {
    console.error('Add field issue error:', error);
    res.status(500).json({ error: 'Failed to add field issue' });
  }
});

// PATCH /api/fields/:id/issues/:issueId - Either resolve/reopen (admin only, body.status)
// or edit the report/reply's own text (author only, body.description).
router.patch('/:id/issues/:issueId', authenticateToken, async (req, res) => {
  try {
    const { id: fieldId, issueId } = req.params;
    const issue = await prisma.fieldIssueReport.findUnique({ where: { id: issueId } });
    if (!issue || issue.fieldId !== fieldId) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    if (req.body?.status !== undefined) {
      if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Only admins can change issue status' });
      }
      const status = String(req.body.status).toUpperCase();
      if (!['OPEN', 'RESOLVED'].includes(status)) {
        return res.status(400).json({ error: 'status must be OPEN or RESOLVED' });
      }
      const updated = await prisma.fieldIssueReport.update({
        where: { id: issueId },
        data: { status, resolvedAt: status === 'RESOLVED' ? new Date() : null },
        include: { user: { select: USER_SELECT }, reactions: true, replies: REPLIES_INCLUDE },
      });
      return res.json(mapIssueForClient(updated, req.user.id));
    }

    if (req.body?.description !== undefined) {
      if (issue.userId !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized to edit this report' });
      }
      const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
      if (!description || description.length > MAX_TEXT_LENGTH) {
        return res.status(400).json({ error: `description must be a non-empty string up to ${MAX_TEXT_LENGTH} characters` });
      }
      const updated = await prisma.fieldIssueReport.update({
        where: { id: issueId },
        data: { description },
        include: { user: { select: USER_SELECT }, reactions: true, replies: REPLIES_INCLUDE },
      });
      return res.json(mapIssueForClient(updated, req.user.id));
    }

    return res.status(400).json({ error: 'Provide either status or description to update' });
  } catch (error) {
    console.error('Update field issue error:', error);
    res.status(500).json({ error: 'Failed to update field issue' });
  }
});

// DELETE /api/fields/:id/issues/:issueId - Remove a report/reply (author or admin only).
// Cascades to its replies (schema onDelete: Cascade on parentId).
router.delete('/:id/issues/:issueId', authenticateToken, async (req, res) => {
  try {
    const { id: fieldId, issueId } = req.params;
    const issue = await prisma.fieldIssueReport.findUnique({ where: { id: issueId } });
    if (!issue || issue.fieldId !== fieldId) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    if (issue.userId !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Not authorized to delete this report' });
    }

    await prisma.fieldIssueReport.delete({ where: { id: issueId } });
    res.json({ message: 'Report deleted' });
  } catch (error) {
    console.error('Delete field issue error:', error);
    res.status(500).json({ error: 'Failed to delete field issue' });
  }
});

// POST /api/fields/:id/issues/:issueId/photo - Attach/replace a photo on your own report (author only).
router.post('/:id/issues/:issueId/photo', authenticateToken, handleSingleUpload(fieldImageUpload, 'photo'), async (req, res) => {
  try {
    const { id: fieldId, issueId } = req.params;
    const issue = await prisma.fieldIssueReport.findUnique({ where: { id: issueId } });
    if (!issue || issue.fieldId !== fieldId) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    if (issue.userId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to edit this report' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const photoUrl = absoluteUrlFor(req, 'fields', req.file.filename);
    const updated = await prisma.fieldIssueReport.update({
      where: { id: issueId },
      data: { photoUrl },
      include: { user: { select: USER_SELECT }, reactions: true, replies: REPLIES_INCLUDE },
    });
    if (issue.photoUrl) deleteUploadedFile(issue.photoUrl);

    res.status(201).json(mapIssueForClient(updated, req.user.id));
  } catch (error) {
    console.error('Upload field issue photo error:', error);
    res.status(500).json({ error: 'Failed to upload photo' });
  }
});

// DELETE /api/fields/:id/issues/:issueId/photo - Remove the photo from your own report (author or admin).
router.delete('/:id/issues/:issueId/photo', authenticateToken, async (req, res) => {
  try {
    const { id: fieldId, issueId } = req.params;
    const issue = await prisma.fieldIssueReport.findUnique({ where: { id: issueId } });
    if (!issue || issue.fieldId !== fieldId) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    if (issue.userId !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Not authorized to edit this report' });
    }

    const updated = await prisma.fieldIssueReport.update({
      where: { id: issueId },
      data: { photoUrl: null },
      include: { user: { select: USER_SELECT }, reactions: true, replies: REPLIES_INCLUDE },
    });
    if (issue.photoUrl) deleteUploadedFile(issue.photoUrl);

    res.json(mapIssueForClient(updated, req.user.id));
  } catch (error) {
    console.error('Remove field issue photo error:', error);
    res.status(500).json({ error: 'Failed to remove photo' });
  }
});

// POST /api/fields/:id/issues/:issueId/react - Toggle a like/dislike on a report.
router.post('/:id/issues/:issueId/react', authenticateToken, async (req, res) => {
  try {
    const { id: fieldId, issueId } = req.params;
    const type = String(req.body?.type || '').toUpperCase();
    if (!['LIKE', 'DISLIKE'].includes(type)) {
      return res.status(400).json({ error: 'type must be LIKE or DISLIKE' });
    }

    const issue = await prisma.fieldIssueReport.findUnique({ where: { id: issueId }, select: { fieldId: true } });
    if (!issue || issue.fieldId !== fieldId) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    const existing = await prisma.fieldIssueReportReaction.findUnique({
      where: { issueId_userId: { issueId, userId: req.user.id } },
    });
    if (existing && existing.type === type) {
      await prisma.fieldIssueReportReaction.delete({ where: { id: existing.id } });
    } else {
      await prisma.fieldIssueReportReaction.upsert({
        where: { issueId_userId: { issueId, userId: req.user.id } },
        create: { issueId, userId: req.user.id, type },
        update: { type },
      });
    }

    const reactions = await prisma.fieldIssueReportReaction.findMany({ where: { issueId } });
    res.json(reactionSummary(reactions, req.user.id));
  } catch (error) {
    console.error('React to field issue error:', error);
    res.status(500).json({ error: 'Failed to react to report' });
  }
});

// POST /api/fields/:id/issues/:issueId/flag - Report an issue/reply as offensive/false/spam.
router.post('/:id/issues/:issueId/flag', authenticateToken, async (req, res) => {
  try {
    const { id: fieldId, issueId } = req.params;
    const reason = String(req.body?.reason || '').toUpperCase();
    const details = typeof req.body?.details === 'string' ? req.body.details.trim().slice(0, MAX_TEXT_LENGTH) : null;
    if (!VALID_FLAG_REASONS.includes(reason)) {
      return res.status(400).json({ error: `reason must be one of ${VALID_FLAG_REASONS.join(', ')}` });
    }

    const issue = await prisma.fieldIssueReport.findUnique({ where: { id: issueId }, select: { fieldId: true } });
    if (!issue || issue.fieldId !== fieldId) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    await prisma.fieldIssueReportFlag.upsert({
      where: { issueId_reporterId: { issueId, reporterId: req.user.id } },
      create: { issueId, reporterId: req.user.id, reason, details },
      update: { reason, details, status: 'PENDING' },
    });

    res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Flag field issue error:', error);
    res.status(500).json({ error: 'Failed to report issue' });
  }
});

// Get field by ID
router.get('/:id', async (req, res) => {
  try {
    const field = await prisma.field.findUnique({ where: { id: req.params.id }, include: { _count: { select: { favorites: true } } } });

    if (!field) {
      return res.status(404).json({ error: 'Field not found' });
    }

    res.json(mapFieldForClient(field));
  } catch (error) {
    console.error('Get field error:', error);
    // Fallback: read from local JSON
    try {
      const raw = await dataManager.readData('fields.json');
      const found = raw.find((f) => f.id === req.params.id);
      if (!found) {
        return res.status(404).json({ error: 'Field not found' });
      }
      return res.json(mapFieldForClient(found));
    } catch (fallbackErr) {
      console.error('Fallback get field from fields.json failed:', fallbackErr);
      return res.status(500).json({ error: 'Failed to get field' });
    }
  }
});

// Create new field (Admin only)
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, location, city, price, type, image } = req.body;

    // Validate required fields
    if (!name || !location || !type) {
      return res.status(400).json({ error: 'Name, location and type are required' });
    }

    // Validate field type
    if (!['open', 'closed'].includes(type)) {
      return res.status(400).json({ error: 'Type must be "open" or "closed"' });
    }

    const extras = validateOptionalFieldExtras(req.body);
    if (extras.error) {
      return res.status(400).json({ error: extras.error });
    }

    const savedField = await prisma.field.create({
      data: {
        name,
        location,
        city: city || null,
        price: type === 'open' ? 0 : (price || 0),
        rating: 0,
        image: image || 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=300&fit=crop',
        available: true,
        type: type.toUpperCase() === 'CLOSED' ? 'CLOSED' : 'OPEN',
        ...extras.data,
      }
    });
    res.status(201).json(mapFieldForClient(savedField));
  } catch (error) {
    console.error('Create field error:', error);
    res.status(500).json({ error: 'Failed to create field' });
  }
});

// Update field (Admin only)
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, location, city, price, type, image, available } = req.body;

    if (type !== undefined && !['open', 'closed'].includes(type)) {
      return res.status(400).json({ error: 'Type must be "open" or "closed"' });
    }

    const extras = validateOptionalFieldExtras(req.body);
    if (extras.error) {
      return res.status(400).json({ error: extras.error });
    }

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (location !== undefined) updates.location = location;
    if (city !== undefined) updates.city = city || null;
    if (price !== undefined) updates.price = price;
    if (type !== undefined) updates.type = type.toUpperCase() === 'CLOSED' ? 'CLOSED' : 'OPEN';
    if (image !== undefined) updates.image = image;
    if (available !== undefined) updates.available = available;
    Object.assign(updates, extras.data);

    const updatedField = await prisma.field.update({ where: { id: req.params.id }, data: updates });
    res.json(mapFieldForClient(updatedField));
  } catch (error) {
    console.error('Update field error:', error);
    res.status(500).json({ error: 'Failed to update field' });
  }
});

// Upload field/venue image (Admin only)
router.post('/:id/image', authenticateToken, requireAdmin, handleSingleUpload(fieldImageUpload, 'image'), async (req, res) => {
  try {
    const existing = await prisma.field.findUnique({ where: { id: req.params.id }, select: { image: true } });
    if (!existing) return res.status(404).json({ error: 'Field not found' });
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const imageUrl = absoluteUrlFor(req, 'fields', req.file.filename);
    const updated = await prisma.field.update({ where: { id: req.params.id }, data: { image: imageUrl } });
    if (existing.image) deleteUploadedFile(existing.image);

    res.json(mapFieldForClient(updated));
  } catch (error) {
    console.error('Upload field image error:', error);
    res.status(500).json({ error: 'Failed to upload field image' });
  }
});

// Remove field image without replacing it (Admin only) -- parity with users.js's
// DELETE /:id/image, which fields.js was missing (only had the POST/upload half).
router.delete('/:id/image', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const existing = await prisma.field.findUnique({ where: { id: req.params.id }, select: { image: true } });
    if (!existing) return res.status(404).json({ error: 'Field not found' });
    await prisma.field.update({ where: { id: req.params.id }, data: { image: null } });
    if (existing.image) deleteUploadedFile(existing.image);
    res.json({ image: null });
  } catch (error) {
    console.error('Remove field image error:', error);
    res.status(500).json({ error: 'Failed to remove field image' });
  }
});

// Append one photo to the field's gallery (Admin only). Uploads a single file per
// call (matching the client's one-at-a-time picker) and pushes its URL onto the
// existing `photos: String[]` column -- there was previously no endpoint at all
// for this column, only the single `image` column had an upload route.
router.post('/:id/photos', authenticateToken, requireAdmin, handleSingleUpload(fieldImageUpload, 'photo'), async (req, res) => {
  try {
    const existing = await prisma.field.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!existing) return res.status(404).json({ error: 'Field not found' });
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const photoUrl = absoluteUrlFor(req, 'fields', req.file.filename);
    const updated = await prisma.field.update({
      where: { id: req.params.id },
      data: { photos: { push: photoUrl } },
    });
    res.status(201).json(mapFieldForClient(updated));
  } catch (error) {
    console.error('Add field photo error:', error);
    res.status(500).json({ error: 'Failed to add field photo' });
  }
});

// Remove one photo from the field's gallery by URL (Admin only). Prisma has no
// "remove by value" for scalar list columns, so this reads the current array,
// filters it, and writes the result back with `set`.
router.delete('/:id/photos', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });

    const existing = await prisma.field.findUnique({ where: { id: req.params.id }, select: { photos: true } });
    if (!existing) return res.status(404).json({ error: 'Field not found' });

    const remaining = existing.photos.filter((p) => p !== url);
    const updated = await prisma.field.update({
      where: { id: req.params.id },
      data: { photos: { set: remaining } },
    });
    if (remaining.length !== existing.photos.length) deleteUploadedFile(url);
    res.json(mapFieldForClient(updated));
  } catch (error) {
    console.error('Remove field photo error:', error);
    res.status(500).json({ error: 'Failed to remove field photo' });
  }
});

// Delete field (Admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await prisma.field.delete({ where: { id: req.params.id } });
    res.json({ message: 'Field deleted successfully' });
  } catch (error) {
    console.error('Delete field error:', error);
    res.status(500).json({ error: 'Failed to delete field' });
  }
});

module.exports = router;