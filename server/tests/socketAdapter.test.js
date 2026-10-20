jest.mock('@socket.io/redis-adapter', () => ({ createAdapter: jest.fn(() => 'ADAPTER') }));
jest.mock('../lib/redis', () => {
  const clients = () => {
    const mk = () => ({ on: jest.fn(), quit: jest.fn().mockResolvedValue('OK'), disconnect: jest.fn() });
    return { pub: mk(), sub: mk() };
  };
  return { createAdapterClients: jest.fn(clients) };
});

const { createAdapter } = require('@socket.io/redis-adapter');
const { createAdapterClients } = require('../lib/redis');
const { attachSocketAdapter } = require('../socket/adapter');

const quiet = { warn: jest.fn(), error: jest.fn() };

beforeEach(() => jest.clearAllMocks());

test('flag off => no adapter attached', () => {
  const io = { adapter: jest.fn() };
  const r = attachSocketAdapter(io, { enabled: false, url: 'redis://x', logger: quiet });
  expect(r.enabled).toBe(false);
  expect(io.adapter).not.toHaveBeenCalled();
  expect(createAdapterClients).not.toHaveBeenCalled();
});

test('flag on without REDIS_URL => in-memory, warns, does not throw', () => {
  const io = { adapter: jest.fn() };
  const r = attachSocketAdapter(io, { enabled: true, url: '', logger: quiet });
  expect(r.enabled).toBe(false);
  expect(quiet.warn).toHaveBeenCalled();
  expect(io.adapter).not.toHaveBeenCalled();
});

test('flag on => createAdapter(pub, sub) with distinct clients, wired once', async () => {
  const io = { adapter: jest.fn() };
  const r = attachSocketAdapter(io, { enabled: true, url: 'redis://x', logger: quiet });
  expect(r.enabled).toBe(true);
  expect(createAdapter).toHaveBeenCalledTimes(1);
  const [pub, sub] = createAdapter.mock.calls[0];
  expect(pub).not.toBe(sub);
  expect(io.adapter).toHaveBeenCalledWith('ADAPTER');
  await r.close();
  expect(pub.quit).toHaveBeenCalled();
  expect(sub.quit).toHaveBeenCalled();
});

test('adapter construction failure degrades to in-memory instead of throwing', () => {
  createAdapter.mockImplementationOnce(() => { throw new Error('bad'); });
  const io = { adapter: jest.fn() };
  const r = attachSocketAdapter(io, { enabled: true, url: 'redis://x', logger: quiet });
  expect(r.enabled).toBe(false);
  expect(quiet.error).toHaveBeenCalled();
});
