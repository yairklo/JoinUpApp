const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
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
const { authenticateToken } = require('../utils/auth');

const router = express.Router();

// Get all fields
router.get('/', async (req, res) => {
  try {
    const fields = await prisma.field.findMany({
      where: { available: true },
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
router.post('/', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { name, location, price, type, image } = req.body;

    // Validate required fields
    if (!name || !location || !type) {
      return res.status(400).json({ error: 'Name, location and type are required' });
    }

    // Validate field type
    if (!['open', 'closed'].includes(type)) {
      return res.status(400).json({ error: 'Type must be "open" or "closed"' });
    }

    const savedField = await prisma.field.create({
      data: {
        name,
        location,
        price: type === 'open' ? 0 : (price || 0),
        rating: 0,
        image: image || 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=300&fit=crop',
        available: true,
        type: type.toUpperCase() === 'CLOSED' ? 'CLOSED' : 'OPEN',
      }
    });
    res.status(201).json(mapFieldForClient(savedField));
  } catch (error) {
    console.error('Create field error:', error);
    res.status(500).json({ error: 'Failed to create field' });
  }
});

// Update field (Admin only)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { name, location, price, type, image, available } = req.body;
    const updates = {};

    if (name !== undefined) updates.name = name;
    if (location !== undefined) updates.location = location;
    if (price !== undefined) updates.price = price;
    if (type !== undefined) {
      if (!['open', 'closed'].includes(type)) {
        return res.status(400).json({ error: 'Type must be "open" or "closed"' });
      }
      updates.type = type.toUpperCase() === 'CLOSED' ? 'CLOSED' : 'OPEN';
    }
    if (image !== undefined) updates.image = image;
    if (available !== undefined) updates.available = available;

    const updatedField = await prisma.field.update({ where: { id: req.params.id }, data: updates });
    res.json(mapFieldForClient(updatedField));
  } catch (error) {
    console.error('Update field error:', error);
    res.status(500).json({ error: 'Failed to update field' });
  }
});

// Delete field (Admin only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    await prisma.field.delete({ where: { id: req.params.id } });
    res.json({ message: 'Field deleted successfully' });
  } catch (error) {
    console.error('Delete field error:', error);
    res.status(500).json({ error: 'Failed to delete field' });
  }
});

module.exports = router; 