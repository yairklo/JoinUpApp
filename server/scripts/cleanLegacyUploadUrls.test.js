const s = require('./cleanLegacyUploadUrls');

describe('cleanLegacyUploadUrls pure logic', () => {
  const u = 'https://joinup-api.duckdns.org/uploads/avatars/abcdef12-3456.jpg';

  it('detects and masks legacy urls', () => {
    expect(s.isLegacyUploadUrl(u)).toBe(true);
    expect(s.isLegacyUploadUrl('https://res.cloudinary.com/x/a.jpg')).toBe(false);
    expect(s.isLegacyUploadUrl(null)).toBe(false);
    const m = s.maskUrl(u);
    expect(m).toBe('https://joinup-api.duckdns.org/uploads/av….jpg');
    expect(m).not.toContain('abcdef12');
  });

  it('extracts host only', () => {
    expect(s.dbHostFromUrl('postgres://user:secret@ep-x-1.neon.tech:5432/db?sslmode=require')).toBe('ep-x-1.neon.tech');
    expect(s.dbHostFromUrl('garbage')).toBeNull();
  });

  it('parses args and rejects unknown ones', () => {
    expect(s.parseArgs([]).apply).toBe(false);
    const o = s.parseArgs(['--apply', '--yes-host=h', '--concurrency=3']);
    expect(o).toMatchObject({ apply: true, yesHost: 'h', concurrency: 3 });
    expect(() => s.parseArgs(['--nope'])).toThrow();
  });

  it('enforces safety rules', () => {
    const dry = s.parseArgs([]);
    const apply = s.parseArgs(['--apply', '--yes-host=h']);
    expect(s.checkSafety({ env: { NODE_ENV: 'test' }, opts: dry, host: 'h' })).toMatch(/NODE_ENV=test/);
    expect(s.checkSafety({ env: {}, opts: dry, host: null })).toMatch(/host/);
    expect(s.checkSafety({ env: {}, opts: dry, host: 'h' })).toBeNull();
    expect(s.checkSafety({ env: {}, opts: apply, host: 'h' })).toMatch(/CONFIRM_CLEAN_UPLOADS/);
    expect(
      s.checkSafety({ env: { CONFIRM_CLEAN_UPLOADS: 'yes' }, opts: s.parseArgs(['--apply', '--yes-host=x']), host: 'h' }),
    ).toMatch(/yes-host/);
    expect(s.checkSafety({ env: { CONFIRM_CLEAN_UPLOADS: 'yes' }, opts: apply, host: 'h' })).toBeNull();
  });

  it('only 404 is dead', () => {
    expect(s.isDeadStatus(404)).toBe(true);
    for (const x of [200, 403, 500, 'error', 'relative']) expect(s.isDeadStatus(x)).toBe(false);
  });

  it('collects and prunes', () => {
    const c = s.collectLegacyUrls([u, null, [u, 'https://c/x.jpg'], 'https://c/y.jpg']);
    expect(c.get(u)).toBe(2);
    expect(c.size).toBe(1);
    expect(s.pruneArray([u, 'https://c/x.jpg'], new Set([u]))).toEqual(['https://c/x.jpg']);
    expect(s.pruneArray(['a'], new Set([u]))).toBeNull();
  });

  it('headStatus retries 5xx and errors, returns 404 directly', async () => {
    const calls = [];
    const f = async () => {
      calls.push(1);
      if (calls.length === 1) throw new Error('boom');
      if (calls.length === 2) return { status: 503 };
      return { status: 404 };
    };
    expect(await s.headStatus(u, { timeoutMs: 100, retries: 2, fetchImpl: f })).toBe(404);
    expect(
      await s.headStatus(u, { timeoutMs: 100, retries: 0, fetchImpl: async () => { throw new Error('x'); } }),
    ).toBe('error');
    expect(await s.headStatus('/uploads/a.jpg', { timeoutMs: 1, retries: 0 })).toBe('relative');
  });

  it('mapLimit preserves order', async () => {
    expect(await s.mapLimit([1, 2, 3], 2, async (x) => x * 2)).toEqual([2, 4, 6]);
  });
});
