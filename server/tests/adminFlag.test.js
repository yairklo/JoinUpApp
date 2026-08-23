const { resolveIsAdmin, metadataIsAdmin, parseAdminAllowlist } = require('../utils/admin');

describe('resolveIsAdmin', () => {
  const previous = process.env.ADMIN_USER_IDS;

  afterEach(() => {
    if (previous === undefined) delete process.env.ADMIN_USER_IDS;
    else process.env.ADMIN_USER_IDS = previous;
  });

  test('is false by default', () => {
    delete process.env.ADMIN_USER_IDS;
    expect(resolveIsAdmin('user_1', { publicMetadata: {} })).toEqual(false);
  });

  test('honors Clerk publicMetadata.isAdmin', () => {
    delete process.env.ADMIN_USER_IDS;
    expect(resolveIsAdmin('user_1', { publicMetadata: { isAdmin: true } })).toEqual(true);
  });

  test('honors Clerk publicMetadata.role=admin', () => {
    delete process.env.ADMIN_USER_IDS;
    expect(resolveIsAdmin('user_1', { publicMetadata: { role: 'admin' } })).toEqual(true);
  });

  test('honors ADMIN_USER_IDS even if Clerk fetch failed', () => {
    process.env.ADMIN_USER_IDS = 'user_ops, user_1';
    expect(resolveIsAdmin('user_1', null)).toEqual(true);
    expect(resolveIsAdmin('user_other', null)).toEqual(false);
  });

  test('parseAdminAllowlist splits commas and whitespace', () => {
    expect(parseAdminAllowlist('a, b  c')).toEqual(['a', 'b', 'c']);
  });

  test('metadataIsAdmin rejects unrelated flags', () => {
    expect(metadataIsAdmin({ role: 'member' })).toEqual(false);
    expect(metadataIsAdmin({ isAdmin: false })).toEqual(false);
  });
});
