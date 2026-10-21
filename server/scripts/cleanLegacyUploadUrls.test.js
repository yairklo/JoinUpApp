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

  it('extracts host[:port] only, never credentials', () => {
    expect(s.dbHostFromUrl('postgres://user:secret@ep-x-1.neon.tech:5432/db?sslmode=require')).toBe('ep-x-1.neon.tech:5432');
    expect(s.dbHostFromUrl('garbage')).toBeNull();
  });

  it('parses args and rejects unknown ones', () => {
    expect(s.parseArgs([]).apply).toBe(false);
    const o = s.parseArgs(['--apply', '--yes-host=h', '--concurrency=3']);
    expect(o).toMatchObject({ apply: true, yesHost: 'h', concurrency: 3 });
    expect(() => s.parseArgs(['--nope'])).toThrow();
  });

  it('enforces safety rules', () => {
    const P = 'joinup-api.duckdns.org';
    const dry = s.parseArgs([]);
    const apply = s.parseArgs(['--apply', '--yes-host=h']);
    const env = { CONFIRM_CLEAN_UPLOADS: 'yes', PUBLIC_SERVER_URL: `https://${P}` };
    expect(s.checkSafety({ env: { NODE_ENV: 'test' }, opts: dry, host: 'h' })).toMatch(/NODE_ENV=test/);
    expect(s.checkSafety({ env: {}, opts: dry, host: null })).toMatch(/host/);
    expect(s.checkSafety({ env: {}, opts: dry, host: 'h' })).toBeNull();
    expect(s.checkSafety({ env: { PUBLIC_SERVER_URL: `https://${P}` }, opts: apply, host: 'h' })).toMatch(/CONFIRM_CLEAN_UPLOADS/);
    expect(s.checkSafety({ env, opts: s.parseArgs(['--apply', '--yes-host=x']), host: 'h' })).toMatch(/yes-host/);
    // no PUBLIC_SERVER_URL and no --api-host
    expect(s.checkSafety({ env: { CONFIRM_CLEAN_UPLOADS: 'yes' }, opts: apply, host: 'h' })).toMatch(/PUBLIC_SERVER_URL/);
    // API host defaults from PUBLIC_SERVER_URL
    expect(s.checkSafety({ env, opts: apply, host: 'h' })).toBeNull();
    expect(s.resolveApiHost(env, apply)).toBe(P);
    // an --api-host that differs from the environment's is refused unless allowed
    const other = s.parseArgs(['--apply', '--yes-host=h', '--api-host=dev.example.com']);
    expect(s.checkSafety({ env, opts: other, host: 'h' })).toMatch(/differs/);
    const allowed = s.parseArgs(['--apply', '--yes-host=h', '--api-host=dev.example.com', '--allow-other-host']);
    expect(s.checkSafety({ env, opts: allowed, host: 'h' })).toBeNull();
    // same host passed explicitly is fine
    expect(s.checkSafety({ env, opts: s.parseArgs(['--apply', '--yes-host=h', `--api-host=${P}`]), host: 'h' })).toBeNull();
  });

  it('keeps host:port when comparing', () => {
    expect(s.dbHostFromUrl('postgres://u:p@db.internal:5544/x')).toBe('db.internal:5544');
    expect(s.hostOf('https://api.example.com:8443/x')).toBe('api.example.com:8443');
  });

  it('verdict: only 404 with the miss header is dead', () => {
    expect(s.verdict({ status: 404, miss: true })).toBe('dead');
    expect(s.verdict({ status: 404, miss: false })).toBe('proxy404');
    expect(s.verdict({ status: 429, miss: false })).toBe('undecided');
    expect(s.verdict({ status: null, miss: false })).toBe('undecided');
    expect(s.verdict({ status: 503, miss: false })).toBe('undecided');
    expect(s.verdict({ status: 200, miss: false })).toBe('alive');
    expect(s.verdict({ status: 301, miss: false })).toBe('alive');
  });

  it('collects and prunes', () => {
    const c = s.collectLegacyUrls([u, null, [u, 'https://c/x.jpg'], 'https://c/y.jpg'], hosts, 'joinup-api.duckdns.org');
    expect(c.own.get(u).count).toBe(2);
    expect(c.own.size).toBe(1);
    expect(s.pruneArray([u, 'https://c/x.jpg'], new Set([u]))).toEqual(['https://c/x.jpg']);
    expect(s.pruneArray(['a'], new Set([u]))).toBeNull();
  });

  const hdr = (h = {}) => ({ get: (k) => h[k.toLowerCase()] ?? null });
  const noSleep = async () => {};

  it('probe retries errors and 5xx and reports the miss header', async () => {
    const calls = [];
    const f = async () => {
      calls.push(1);
      if (calls.length === 1) throw new Error('boom');
      if (calls.length === 2) return { status: 503, headers: hdr() };
      return { status: 404, headers: hdr({ 'x-uploads-miss': '1' }) };
    };
    expect(await s.probe(u, { timeoutMs: 100, retries: 2, fetchImpl: f, sleep: noSleep })).toEqual({ status: 404, miss: true });
    const fail = async () => { throw new Error('x'); };
    expect((await s.probe(u, { timeoutMs: 100, retries: 0, fetchImpl: fail, sleep: noSleep })).status).toBeNull();
  });

  it('probe retries 429 honouring Retry-After, then gives up as 429', async () => {
    const waits = [];
    let n = 0;
    const f = async () => (++n < 3 ? { status: 429, headers: hdr({ 'retry-after': '3' }) } : { status: 200, headers: hdr() });
    const r = await s.probe(u, { timeoutMs: 100, retries: 0, fetchImpl: f, sleep: async (ms) => waits.push(ms) });
    expect(r.status).toBe(200);
    expect(waits).toEqual([3000, 3000]);
    const always = async () => ({ status: 429, headers: hdr() });
    const g = await s.probe(u, { timeoutMs: 100, retries: 0, fetchImpl: always, sleep: noSleep });
    expect(s.verdict(g)).toBe('undecided');
  });

  it('probe uses the given method and does not follow redirects', async () => {
    let o;
    await s.probe(u, { timeoutMs: 100, retries: 0, fetchImpl: async (_, opt) => { o = opt; return { status: 200, headers: hdr() }; }, sleep: noSleep }, 'GET');
    expect(o.method).toBe('GET');
    expect(o.redirect).toBe('manual');
  });

  it('controlCheck requires 404 plus header (a proxy 404 fails it)', async () => {
    const good = async () => ({ status: 404, headers: hdr({ 'x-uploads-miss': '1' }) });
    const proxy = async () => ({ status: 404, headers: hdr() });
    expect((await s.controlCheck('a.b', { timeoutMs: 10, retries: 0, fetchImpl: good, sleep: noSleep })).ok).toBe(true);
    expect((await s.controlCheck('a.b', { timeoutMs: 10, retries: 0, fetchImpl: proxy, sleep: noSleep })).ok).toBe(false);
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
});
