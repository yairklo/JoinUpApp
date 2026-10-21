const s = require('./cleanLegacyUploadUrls');

describe('cleanLegacyUploadUrls pure logic', () => {
  const hosts = new Set(['joinup-api.duckdns.org']);
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
    const apply = s.parseArgs(['--apply', '--yes-host=h', '--api-host=joinup-api.duckdns.org']);
    expect(s.checkSafety({ env: { NODE_ENV: 'test' }, opts: dry, host: 'h' })).toMatch(/NODE_ENV=test/);
    expect(s.checkSafety({ env: {}, opts: dry, host: null })).toMatch(/host/);
    expect(s.checkSafety({ env: {}, opts: dry, host: 'h' })).toBeNull();
    expect(s.checkSafety({ env: {}, opts: apply, host: 'h' })).toMatch(/CONFIRM_CLEAN_UPLOADS/);
    expect(
      s.checkSafety({ env: { CONFIRM_CLEAN_UPLOADS: 'yes' }, opts: s.parseArgs(['--apply', '--yes-host=x', '--api-host=a.b']), host: 'h' }),
    ).toMatch(/yes-host/);
    expect(
      s.checkSafety({ env: { CONFIRM_CLEAN_UPLOADS: 'yes' }, opts: s.parseArgs(['--apply', '--yes-host=h']), host: 'h' }),
    ).toMatch(/api-host/);
    expect(s.checkSafety({ env: { CONFIRM_CLEAN_UPLOADS: 'yes' }, opts: apply, host: 'h' })).toBeNull();
  });

  it('only 404 is dead', () => {
    expect(s.isDeadStatus(404)).toBe(true);
    for (const x of [200, 403, 500, 'error', 'relative']) expect(s.isDeadStatus(x)).toBe(false);
  });

  it('collects and prunes', () => {
    const c = s.collectLegacyUrls([u, null, [u, 'https://c/x.jpg'], 'https://c/y.jpg'], hosts, 'joinup-api.duckdns.org');
    expect(c.own.get(u).count).toBe(2);
    expect(c.own.size).toBe(1);
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

  it('classifies own vs external urls', () => {
    const P = 'joinup-api.duckdns.org';
    expect(s.classifyUrl(u, hosts, P)).toEqual({ kind: 'own', url: u });
    expect(s.classifyUrl('/uploads/a/b.jpg', hosts, P)).toEqual({ kind: 'own', url: `https://${P}/uploads/a/b.jpg` });
    expect(s.classifyUrl('https://club.example/wp-content/uploads/2020/a.jpg', hosts, P)).toEqual({ kind: 'external' });
    expect(s.classifyUrl('https://other.example/uploads/a.jpg', hosts, P)).toEqual({ kind: 'external' });
    expect(s.classifyUrl(`https://${P}/x/uploads/a.jpg`, hosts, P)).toEqual({ kind: 'external' });
    expect(s.classifyUrl('https://res.cloudinary.com/demo/image/upload/v1/a.jpg', hosts, P)).toBeNull();
    expect(s.classifyUrl(null, hosts, P)).toBeNull();
  });

  it('counts external values without selecting them', () => {
    const c = s.collectLegacyUrls(['https://club.example/wp-content/uploads/a.jpg', ['/uploads/x/y.jpg']], hosts, 'joinup-api.duckdns.org');
    expect(c.external).toBe(1);
    expect([...c.own.keys()]).toEqual(['/uploads/x/y.jpg']);
  });

  it('aborts when every URL is 404 unless forced', () => {
    const many = Array(21).fill(404);
    expect(s.allDeadAbort(many, false)).toMatch(/aborting/);
    expect(s.allDeadAbort(many, true)).toBeNull();
    expect(s.allDeadAbort(Array(20).fill(404), false)).toBeNull();
    expect(s.allDeadAbort([...many, 200], false)).toBeNull();
  });

  it('headStatus uses the given method', async () => {
    let m;
    await s.headStatus(u, { timeoutMs: 100, retries: 0, fetchImpl: async (_, o) => { m = o.method; return { status: 200 }; } }, 'GET');
    expect(m).toBe('GET');
  });
});
