const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const dataManager = require('../utils/dataManager');

function mapFieldForClient(f) {
  if (!f) return f;
  const favoritesCount = (f._count && typeof f._count.favorites === 'number') ? f._count.favorites : (f.favoritesCount || 0);
  return { ...f, type: f.type === 'CLOSED' ? 'closed' : 'open', favoritesCount };
}
const { authenticateToken } = require('../utils/auth');

const router = express.Router();

// Get all fields
router.get('/', async (req, res) => {
  try {
    const fields = await prisma.field.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { favorites: true } } } });
    res.json(fields.map(mapFieldForClient));
  } catch (error) {
    console.error('Get fields error:', error);
    // Fallback: serve from local JSON for dev environments without DB
    try {
      const fields = await dataManager.readData('fields.json');
      return res.json(fields.map(mapFieldForClient));
    } catch (fallbackErr) {
      console.error('Fallback read fields.json failed:', fallbackErr);
      return res.status(500).json({ error: 'Failed to get fields' });
    }
  }
});

// Search fields
router.get('/search', async (req, res) => {
  try {
    const { location, type, available } = req.query;
    const where = {};
    if (location) where.location = { contains: String(location), mode: 'insensitive' };
    if (type) where.type = String(type).toUpperCase() === 'CLOSED' ? 'CLOSED' : 'OPEN';
    if (available !== undefined) where.available = available === 'true';
    const fields = await prisma.field.findMany({ where, orderBy: { name: 'asc' }, include: { _count: { select: { favorites: true } } } });
    res.json(fields.map(mapFieldForClient));
  } catch (error) {
    console.error('Search fields error:', error);
    // Fallback: filter local JSON
    try {
      const { location, type, available } = req.query;
      const raw = await dataManager.readData('fields.json');
      const filtered = raw.filter((f) => {
        const matchLocation = location ? (f.location || '').toLowerCase().includes(String(location).toLowerCase()) : true;
        const matchType = type ? ((String(type).toLowerCase() === 'closed') ? (String(f.type).toLowerCase() === 'closed') : (String(f.type).toLowerCase() !== 'closed')) : true;
        const matchAvail = typeof available !== 'undefined' ? (String(available) === 'true' ? !!f.available : !f.available) : true;
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
    const fields = await prisma.field.findMany({ where: { type: type.toUpperCase() === 'CLOSED' ? 'CLOSED' : 'OPEN' }, include: { _count: { select: { favorites: true } } } });
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
      const filtered = raw.filter((f) => String(f.type).toLowerCase() === String(type).toLowerCase());
      return res.json(filtered.map(mapFieldForClient));
    } catch (fallbackErr) {
      console.error('Fallback type filter fields.json failed:', fallbackErr);
      return res.status(500).json({ error: 'Failed to get fields by type' });
    }
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