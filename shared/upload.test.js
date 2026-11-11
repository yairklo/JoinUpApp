const {
  MAX_IMAGE_FILE_SIZE,
  MAX_FIELD_PHOTOS,
  MAX_PENDING_PHOTOS_PER_USER_PER_FIELD,
  MAX_PENDING_PHOTOS_PER_USER,
  MAX_PHOTO_UPLOADS_PER_DAY,
  IMAGE_RESIZE_MAX_EDGE,
  computeFieldPhotoAllowance,
  validateFieldPhotoFile,
  computeResizedDimensions,
} = require('./upload');

const fresh = { approvedCountForField: 0, userPendingForField: 0, userPendingTotal: 0, userUploadsLast24h: 0 };
const allowance = (over) => computeFieldPhotoAllowance({ ...fresh, ...over });

describe('field photo limits are the agreed numbers', () => {
  test('constants', () => {
    expect(MAX_FIELD_PHOTOS).toBe(10);
    expect(MAX_PENDING_PHOTOS_PER_USER_PER_FIELD).toBe(5);
    expect(MAX_PENDING_PHOTOS_PER_USER).toBe(15);
    expect(MAX_PHOTO_UPLOADS_PER_DAY).toBe(20);
  });
});

describe('computeFieldPhotoAllowance for a regular user', () => {
  test('a user with nothing pending may add a full per-field batch', () => {
    expect(allowance({ requested: 5 })).toEqual({ allowed: 5, remaining: 5, reason: null });
  });

  test('requested defaults to one photo', () => {
    expect(allowance({})).toEqual({ allowed: 1, remaining: 5, reason: null });
  });

  test('a multi-select larger than the slots left is trimmed, with the binding limit named', () => {
    expect(allowance({ userPendingForField: 2, requested: 6 })).toEqual({
      allowed: 3,
      remaining: 3,
      reason: 'PENDING_PER_FIELD',
    });
  });

  test('per-field pending limit blocks at five', () => {
    expect(allowance({ userPendingForField: 5, userPendingTotal: 5 })).toEqual({
      allowed: 0,
      remaining: 0,
      reason: 'PENDING_PER_FIELD',
    });
  });

  test('overall pending limit binds when it is tighter than the per-field one', () => {
    expect(allowance({ userPendingForField: 1, userPendingTotal: 13, requested: 4 })).toEqual({
      allowed: 2,
      remaining: 2,
      reason: 'PENDING_TOTAL',
    });
    expect(allowance({ userPendingTotal: 15 })).toEqual({ allowed: 0, remaining: 0, reason: 'PENDING_TOTAL' });
  });

  test('daily limit binds when it is the tightest', () => {
    expect(allowance({ userUploadsLast24h: 19, requested: 3 })).toEqual({
      allowed: 1,
      remaining: 1,
      reason: 'DAILY',
    });
    expect(allowance({ userUploadsLast24h: 20 })).toEqual({ allowed: 0, remaining: 0, reason: 'DAILY' });
  });

  test('on a tie the narrowest limit is reported', () => {
    expect(allowance({ userPendingForField: 4, userPendingTotal: 14, userUploadsLast24h: 19, requested: 2 }).reason)
      .toBe('PENDING_PER_FIELD');
  });

  test('an approval or rejection frees the pending slot', () => {
    const blocked = allowance({ userPendingForField: 5, userPendingTotal: 5, userUploadsLast24h: 5 });
    expect(blocked.allowed).toBe(0);
    // One of the five was reviewed: both pending counts drop, the daily count does not.
    const after = allowance({ userPendingForField: 4, userPendingTotal: 4, userUploadsLast24h: 5 });
    expect(after).toEqual({ allowed: 1, remaining: 1, reason: null });
  });

  test('a full gallery blocks suggestions even with every personal slot free', () => {
    expect(allowance({ approvedCountForField: 10, requested: 2 })).toEqual({
      allowed: 0,
      remaining: 0,
      reason: 'FIELD_FULL',
    });
  });

  test('a nearly full gallery does not shrink the suggestion queue', () => {
    // Suggestions are pending, not approved; the admin picks which ones take the last slots.
    expect(allowance({ approvedCountForField: 9, requested: 5 })).toEqual({ allowed: 5, remaining: 5, reason: null });
  });

  test('counts past a limit never go negative', () => {
    expect(allowance({ userPendingForField: 9, userPendingTotal: 40, userUploadsLast24h: 99 })).toEqual({
      allowed: 0,
      remaining: 0,
      reason: 'PENDING_PER_FIELD',
    });
  });

  test('garbage input is treated as zero rather than opening the gate', () => {
    expect(allowance({ requested: 0 })).toEqual({ allowed: 0, remaining: 5, reason: null });
    expect(allowance({ requested: -3 }).allowed).toBe(0);
    expect(allowance({ requested: NaN }).allowed).toBe(0);
    expect(allowance({ userPendingForField: undefined, requested: 2 }).allowed).toBe(2);
    expect(computeFieldPhotoAllowance(undefined)).toEqual({ allowed: 1, remaining: 5, reason: null });
  });
});

describe('computeFieldPhotoAllowance for an admin', () => {
  const admin = (over) => allowance({ isAdmin: true, ...over });

  test('is exempt from every per-user limit', () => {
    expect(admin({ userPendingForField: 5, userPendingTotal: 15, userUploadsLast24h: 20, requested: 4 })).toEqual({
      allowed: 4,
      remaining: 10,
      reason: null,
    });
  });

  test('is still bound by the field cap, since admin uploads are approved at once', () => {
    expect(admin({ approvedCountForField: 8, requested: 5 })).toEqual({
      allowed: 2,
      remaining: 2,
      reason: 'FIELD_FULL',
    });
    expect(admin({ approvedCountForField: 10 })).toEqual({ allowed: 0, remaining: 0, reason: 'FIELD_FULL' });
  });
});

describe('validateFieldPhotoFile', () => {
  test.each(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])('accepts %s', (mimetype) => {
    expect(validateFieldPhotoFile({ mimetype, size: 1024 })).toBeNull();
  });

  test.each(['image/svg+xml', 'image/heic', 'application/pdf', 'text/html', '', undefined, 'toString'])(
    'rejects type %s',
    (mimetype) => {
      expect(validateFieldPhotoFile({ mimetype, size: 1024 })).toBe('TYPE');
    },
  );

  test('size limit is inclusive of exactly 5MB', () => {
    expect(validateFieldPhotoFile({ mimetype: 'image/jpeg', size: MAX_IMAGE_FILE_SIZE })).toBeNull();
    expect(validateFieldPhotoFile({ mimetype: 'image/jpeg', size: MAX_IMAGE_FILE_SIZE + 1 })).toBe('SIZE');
  });

  test('type is checked before size, and a missing size is left to the server', () => {
    expect(validateFieldPhotoFile({ mimetype: 'application/pdf', size: MAX_IMAGE_FILE_SIZE + 1 })).toBe('TYPE');
    expect(validateFieldPhotoFile({ mimetype: 'image/png' })).toBeNull();
    expect(validateFieldPhotoFile(undefined)).toBe('TYPE');
  });
});

describe('computeResizedDimensions', () => {
  test('target edge is 1600', () => {
    expect(IMAGE_RESIZE_MAX_EDGE).toBe(1600);
  });

  test('scales a landscape photo by its width', () => {
    expect(computeResizedDimensions(4000, 3000)).toEqual({ width: 1600, height: 1200, resized: true });
  });

  test('scales a portrait photo by its height', () => {
    expect(computeResizedDimensions(3000, 4000)).toEqual({ width: 1200, height: 1600, resized: true });
  });

  test('scales a square photo', () => {
    expect(computeResizedDimensions(3200, 3200)).toEqual({ width: 1600, height: 1600, resized: true });
  });

  test('never upscales, and leaves an exact-fit image alone', () => {
    expect(computeResizedDimensions(800, 600)).toEqual({ width: 800, height: 600, resized: false });
    expect(computeResizedDimensions(1600, 900)).toEqual({ width: 1600, height: 900, resized: false });
  });

  test('rounds to whole pixels and keeps a thin panorama at least one pixel tall', () => {
    expect(computeResizedDimensions(4032, 3024)).toEqual({ width: 1600, height: 1200, resized: true });
    expect(computeResizedDimensions(1601, 1000)).toEqual({ width: 1600, height: 999, resized: true });
    expect(computeResizedDimensions(20000, 4)).toEqual({ width: 1600, height: 1, resized: true });
  });

  test('honours a custom edge and tolerates missing dimensions', () => {
    expect(computeResizedDimensions(2000, 1000, 500)).toEqual({ width: 500, height: 250, resized: true });
    expect(computeResizedDimensions(0, 0)).toEqual({ width: 0, height: 0, resized: false });
    expect(computeResizedDimensions(undefined, 500)).toEqual({ width: 0, height: 500, resized: false });
  });
});
