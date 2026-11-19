// Shared pieces of the field photo gallery, used by routes/fieldPhotos.js and by the legacy
// admin image endpoints in routes/fields.js. Every function takes the Prisma client to use, so
// callers inside a transaction pass `tx` and stay inside it.

const { safeUpsertUserFromAuth } = require('./userSync');

const DAY_MS = 24 * 60 * 60 * 1000;

const APPROVED_ORDER = [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }];

/** The public shape of a photo. Never includes who uploaded it. */
function photoForClient(p) {
  return { id: p.id, url: p.url, status: p.status, sortOrder: p.sortOrder, createdAt: p.createdAt };
}

function approvedPhotos(db, fieldId) {
  return db.fieldPhoto.findMany({ where: { fieldId, status: 'APPROVED' }, orderBy: APPROVED_ORDER });
}

/** The sortOrder that places a newly approved photo last. */
async function nextSortOrder(db, fieldId) {
  const last = await db.fieldPhoto.findFirst({
    where: { fieldId, status: 'APPROVED' },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  return last ? last.sortOrder + 1 : 0;
}

/**
 * Keeps Field.image equal to the first approved photo (null when there is none), so everything
 * that reads the single cover -- field cards, map previews, game payloads -- needs no change.
 * Call after anything that changes which approved photo is first.
 */
async function syncFieldCover(db, fieldId) {
  const first = await db.fieldPhoto.findFirst({
    where: { fieldId, status: 'APPROVED' },
    orderBy: APPROVED_ORDER,
    select: { url: true },
  });
  const image = first ? first.url : null;
  await db.field.update({ where: { id: fieldId }, data: { image } });
  return image;
}

/**
 * Makes sure the signed-in account has its row in our User table (the photo and report tables
 * reference it) and returns it. Safe to call from parallel requests: when an account has no row
 * yet, simultaneous requests all try to create it and the losers fail with a unique violation on
 * the id. By then the row exists, so the same call succeeds the second time.
 */
async function ensureLocalUser(db, authUser) {
  try {
    return await safeUpsertUserFromAuth(db, authUser);
  } catch (error) {
    if (error?.code === 'P2002') return safeUpsertUserFromAuth(db, authUser);
    throw error;
  }
}

// The limits are "count, then insert", which two parallel requests can both pass (each reads 4
// pending, each inserts a fifth). Taking a row lock inside the transaction before counting makes
// them queue instead, as lockGameRow does for rosters. NO KEY UPDATE conflicts with itself (what
// serialises) but not with the key-share locks a foreign-key check takes, so unrelated writes that
// merely reference the row are never blocked.

/** Serialises one user's pending / daily limit checks. Call first inside the transaction. */
async function lockUserForPhotos(tx, userId) {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR NO KEY UPDATE`;
}

/** Serialises changes to one field's set of approved photos (the cap, and the next sortOrder). */
async function lockFieldForPhotos(tx, fieldId) {
  await tx.$queryRaw`SELECT "id" FROM "Field" WHERE "id" = ${fieldId} FOR NO KEY UPDATE`;
}

/** The four counts computeFieldPhotoAllowance needs for one user and one field. */
async function allowanceCounts(db, fieldId, userId, now = Date.now()) {
  const [approvedCountForField, userPendingForField, userPendingTotal, userUploadsLast24h] = await Promise.all([
    db.fieldPhoto.count({ where: { fieldId, status: 'APPROVED' } }),
    db.fieldPhoto.count({ where: { fieldId, uploadedById: userId, status: 'PENDING' } }),
    db.fieldPhoto.count({ where: { uploadedById: userId, status: 'PENDING' } }),
    // Every status counts, rejected included: getting photos rejected must not refill the day.
    db.fieldPhoto.count({ where: { uploadedById: userId, createdAt: { gte: new Date(now - DAY_MS) } } }),
  ]);
  return { approvedCountForField, userPendingForField, userPendingTotal, userUploadsLast24h };
}

module.exports = {
  photoForClient,
  approvedPhotos,
  nextSortOrder,
  syncFieldCover,
  allowanceCounts,
  ensureLocalUser,
  lockUserForPhotos,
  lockFieldForPhotos,
};
