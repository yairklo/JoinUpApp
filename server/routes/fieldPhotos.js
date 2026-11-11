const express = require('express');
const { prisma } = require('../lib/prisma');
const { authenticateToken, attachOptionalUser } = require('../utils/auth');
const { requireAdmin } = require('../utils/admin');
const { createRateLimiter } = require('../middleware/rateLimit');
const { createImageUpload, handleSingleUpload, absoluteUrlFor, deleteUploadedFile } = require('../middleware/upload');
const { MAX_FIELD_PHOTOS, computeFieldPhotoAllowance } = require('../shared/upload');
const {
  photoForClient,
  approvedPhotos,
  nextSortOrder,
  syncFieldCover,
  allowanceCounts,
} = require('../utils/fieldPhotos');

// Field photo gallery. Any signed-in user may suggest photos for a field; a suggestion is a
// PENDING FieldPhoto that only its uploader (and admins) can see until an admin approves it.
// Mounted at /api, so paths below are spelled out in full. The legacy admin-only
// POST/DELETE /api/fields/:id/photos in routes/fields.js are different paths and still work.
const router = express.Router();

const fieldPhotoUpload = createImageUpload('fields');

// Sized so a full multi-select batch (one request per photo) passes untouched; the per-user
// pending and daily limits are what actually bound a user. Keyed by user, not by IP.
const submitLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 30,
  prefix: 'field-photo',
  resolveUserId: async (req) => req.user?.id || null,
});

const LIMIT_MESSAGES = {
  FIELD_FULL: 'This field already has the maximum number of photos',
  PENDING_PER_FIELD: 'You have too many photos awaiting review on this field',
  PENDING_TOTAL: 'You have too many photos awaiting review',
  DAILY: 'Daily photo upload limit reached',
};

function limitResponse(res, reason) {
  return res.status(409).json({ error: LIMIT_MESSAGES[reason] || 'Photo limit reached', code: reason });
}

async function allowanceFor(db, fieldId, user) {
  const counts = await allowanceCounts(db, fieldId, user.id);
  return computeFieldPhotoAllowance({ ...counts, isAdmin: !!user.isAdmin, requested: 1 });
}

// GET /api/fields/:id/photos - approved photos for everyone; a signed-in viewer also gets their
// own pending photos and how many more they may add.
router.get('/fields/:id/photos', attachOptionalUser, async (req, res) => {
  // A request that carried credentials can produce a per-user body, so it must never be stored by
  // a shared cache -- decided by the header, not by whether auth succeeded, so an expired token
  // cannot make a cache key that is later served to someone else.
  res.setHeader('Vary', 'Authorization');
  if (req.headers.authorization) res.setHeader('Cache-Control', 'private, no-store');

  try {
    const fieldId = req.params.id;
    const field = await prisma.field.findUnique({ where: { id: fieldId }, select: { id: true } });
    if (!field) return res.status(404).json({ error: 'Field not found' });

    const photos = await approvedPhotos(prisma, fieldId);
    const body = {
      photos: photos.map(photoForClient),
      mine: [],
      remaining: null,
      fieldFull: photos.length >= MAX_FIELD_PHOTOS,
    };

    if (req.user) {
      const [mine, allowance] = await Promise.all([
        prisma.fieldPhoto.findMany({
          where: { fieldId, uploadedById: req.user.id, status: 'PENDING' },
          orderBy: { createdAt: 'asc' },
        }),
        allowanceFor(prisma, fieldId, req.user),
      ]);
      body.mine = mine.map(photoForClient);
      body.remaining = allowance.remaining;
    }

    res.json(body);
  } catch (error) {
    console.error('List field photos error:', error);
    res.status(500).json({ error: 'Failed to load field photos' });
  }
});

// Runs before the file is accepted, so a user who is blocked or already at a limit does not get
// a file stored (and then discarded) for every attempt. The handler re-checks after the upload.
async function precheckSubmit(req, res, next) {
  try {
    const field = await prisma.field.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!field) return res.status(404).json({ error: 'Field not found' });

    if (!req.user.isAdmin) {
      const u = await prisma.user.findUnique({ where: { id: req.user.id }, select: { blockedFromFieldSocial: true } });
      if (u?.blockedFromFieldSocial) return res.status(403).json({ error: 'You are blocked from adding field content' });
    }

    const allowance = await allowanceFor(prisma, req.params.id, req.user);
    if (allowance.allowed < 1) return limitResponse(res, allowance.reason);
    next();
  } catch (error) {
    console.error('Field photo precheck error:', error);
    res.status(500).json({ error: 'Failed to upload photo' });
  }
}

// POST /api/fields/:id/photos/submit - one photo per request (the clients send a multi-select
// as a sequence). A user's photo is PENDING; an admin's is published immediately.
router.post(
  '/fields/:id/photos/submit',
  authenticateToken,
  submitLimiter,
  precheckSubmit,
  handleSingleUpload(fieldPhotoUpload, 'photo'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No image file provided' });
      const fieldId = req.params.id;
      const url = absoluteUrlFor(req, 'fields', req.file.filename);
      const isAdmin = !!req.user.isAdmin;

      // Any 4xx/5xx below makes handleSingleUpload discard the stored file.
      const result = await prisma.$transaction(async (tx) => {
        const allowance = await allowanceFor(tx, fieldId, req.user);
        if (allowance.allowed < 1) return { reason: allowance.reason };
        const photo = await tx.fieldPhoto.create({
          data: isAdmin
            ? {
              fieldId,
              url,
              uploadedById: req.user.id,
              status: 'APPROVED',
              sortOrder: await nextSortOrder(tx, fieldId),
              reviewedAt: new Date(),
              reviewedById: req.user.id,
            }
            : { fieldId, url, uploadedById: req.user.id, status: 'PENDING' },
        });
        if (isAdmin) await syncFieldCover(tx, fieldId);
        return { photo };
      });

      if (result.reason) return limitResponse(res, result.reason);
      res.status(201).json(photoForClient(result.photo));
    } catch (error) {
      console.error('Submit field photo error:', error);
      res.status(500).json({ error: 'Failed to upload photo' });
    }
  },
);

// PUT /api/fields/:id/photos/order - admin sets the display order of the approved photos.
// Declared before the /:photoId route so "order" is never read as a photo id.
router.put('/fields/:id/photos/order', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const fieldId = req.params.id;
    const { orderedIds } = req.body || {};
    if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== 'string')) {
      return res.status(400).json({ error: 'orderedIds must be an array of photo ids' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const current = await approvedPhotos(tx, fieldId);
      const known = new Set(current.map((p) => p.id));
      const sameSet = orderedIds.length === known.size
        && new Set(orderedIds).size === orderedIds.length
        && orderedIds.every((id) => known.has(id));
      if (!sameSet) return null;
      for (let i = 0; i < orderedIds.length; i += 1) {
        await tx.fieldPhoto.update({ where: { id: orderedIds[i] }, data: { sortOrder: i } });
      }
      if (orderedIds.length > 0) await syncFieldCover(tx, fieldId);
      return approvedPhotos(tx, fieldId);
    });

    if (!result) {
      return res.status(400).json({ error: "orderedIds must be exactly this field's approved photos" });
    }
    res.json(result.map(photoForClient));
  } catch (error) {
    console.error('Reorder field photos error:', error);
    res.status(500).json({ error: 'Failed to reorder photos' });
  }
});

// DELETE /api/fields/:id/photos/:photoId - an admin removes any photo; the uploader may withdraw
// their own while it is still pending.
router.delete('/fields/:id/photos/:photoId', authenticateToken, async (req, res) => {
  try {
    const { id: fieldId, photoId } = req.params;
    const photo = await prisma.fieldPhoto.findUnique({ where: { id: photoId } });
    if (!photo || photo.fieldId !== fieldId) return res.status(404).json({ error: 'Photo not found' });

    const isAdmin = !!req.user.isAdmin;
    const ownPending = photo.uploadedById === req.user.id && photo.status === 'PENDING';
    if (!isAdmin && !ownPending) {
      // Same answer as "not found": a non-owner learns nothing about someone else's pending photo.
      return res.status(404).json({ error: 'Photo not found' });
    }

    if (isAdmin) {
      await prisma.$transaction(async (tx) => {
        await tx.fieldPhoto.delete({ where: { id: photoId } });
        if (photo.status === 'APPROVED') await syncFieldCover(tx, fieldId);
      });
    } else {
      // A withdrawn photo keeps its row (as REJECTED) so withdrawing cannot refill the daily count.
      const { count } = await prisma.fieldPhoto.updateMany({
        where: { id: photoId, status: 'PENDING', uploadedById: req.user.id },
        data: { status: 'REJECTED', reviewedAt: new Date(), reviewedById: req.user.id },
      });
      if (count === 0) return res.status(404).json({ error: 'Photo not found' });
    }

    // A rejected photo's file was already deleted when it was rejected.
    if (photo.status !== 'REJECTED') deleteUploadedFile(photo.url);
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete field photo error:', error);
    res.status(500).json({ error: 'Failed to delete photo' });
  }
});

// ---- Admin review queue ---------------------------------------------------------------------

// GET /api/field-photos/pending - everything awaiting review, oldest first.
router.get('/field-photos/pending', authenticateToken, requireAdmin, async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const pending = await prisma.fieldPhoto.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: {
        field: { select: { id: true, name: true } },
        uploadedBy: { select: { id: true, name: true } },
      },
    });
    const fieldIds = [...new Set(pending.map((p) => p.fieldId))];
    const counts = fieldIds.length
      ? await prisma.fieldPhoto.groupBy({
        by: ['fieldId'],
        where: { fieldId: { in: fieldIds }, status: 'APPROVED' },
        _count: { _all: true },
      })
      : [];
    const approvedByField = new Map(counts.map((c) => [c.fieldId, c._count._all]));

    res.json(pending.map((p) => ({
      ...photoForClient(p),
      field: { id: p.field.id, name: p.field.name, approvedCount: approvedByField.get(p.fieldId) || 0 },
      uploader: p.uploadedBy ? { id: p.uploadedBy.id, name: p.uploadedBy.name } : null,
    })));
  } catch (error) {
    console.error('List pending field photos error:', error);
    res.status(500).json({ error: 'Failed to load pending photos' });
  }
});

// POST /api/field-photos/:id/approve - publish a pending photo at the end of its field's gallery.
router.post('/field-photos/:id/approve', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const photo = await tx.fieldPhoto.findUnique({ where: { id: req.params.id } });
      if (!photo) return { status: 404, body: { error: 'Photo not found' } };
      if (photo.status !== 'PENDING') return { status: 409, body: { error: 'Photo was already reviewed', code: 'NOT_PENDING' } };

      const approved = await tx.fieldPhoto.count({ where: { fieldId: photo.fieldId, status: 'APPROVED' } });
      if (approved >= MAX_FIELD_PHOTOS) return { status: 409, body: { error: LIMIT_MESSAGES.FIELD_FULL, code: 'FIELD_FULL' } };

      // Compare-and-set on the status, so two admins approving at once publish it only once.
      const { count } = await tx.fieldPhoto.updateMany({
        where: { id: photo.id, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          sortOrder: await nextSortOrder(tx, photo.fieldId),
          reviewedAt: new Date(),
          reviewedById: req.user.id,
        },
      });
      if (count === 0) return { status: 409, body: { error: 'Photo was already reviewed', code: 'NOT_PENDING' } };
      await syncFieldCover(tx, photo.fieldId);
      return { status: 200, body: photoForClient(await tx.fieldPhoto.findUnique({ where: { id: photo.id } })) };
    });
    res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Approve field photo error:', error);
    res.status(500).json({ error: 'Failed to approve photo' });
  }
});

// POST /api/field-photos/:id/reject - decline a pending photo and delete its stored file. The row
// stays (see allowanceCounts) and no longer counts as pending.
router.post('/field-photos/:id/reject', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const photo = await prisma.fieldPhoto.findUnique({ where: { id: req.params.id } });
    if (!photo) return res.status(404).json({ error: 'Photo not found' });

    const { count } = await prisma.fieldPhoto.updateMany({
      where: { id: photo.id, status: 'PENDING' },
      data: { status: 'REJECTED', reviewedAt: new Date(), reviewedById: req.user.id },
    });
    if (count === 0) return res.status(409).json({ error: 'Photo was already reviewed', code: 'NOT_PENDING' });

    deleteUploadedFile(photo.url);
    res.json(photoForClient({ ...photo, status: 'REJECTED' }));
  } catch (error) {
    console.error('Reject field photo error:', error);
    res.status(500).json({ error: 'Failed to reject photo' });
  }
});

module.exports = router;
