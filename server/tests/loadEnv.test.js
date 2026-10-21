jest.mock('dotenv', () => ({ config: jest.fn(() => ({ parsed: {} })) }));

const dotenv = require('dotenv');
const { loadEnv } = require('../lib/loadEnv');

describe('loadEnv', () => {
  const prev = process.env.JOINUP_SKIP_DOTENV;

  afterEach(() => {
    dotenv.config.mockClear();
    if (prev === undefined) delete process.env.JOINUP_SKIP_DOTENV;
    else process.env.JOINUP_SKIP_DOTENV = prev;
  });

  test('does not read server/.env when JOINUP_SKIP_DOTENV=1', () => {
    process.env.JOINUP_SKIP_DOTENV = '1';
    loadEnv();
    expect(dotenv.config).not.toHaveBeenCalled();
  });

  test('loads .env when the flag is unset', () => {
    delete process.env.JOINUP_SKIP_DOTENV;
    loadEnv();
    expect(dotenv.config).toHaveBeenCalledTimes(1);
  });
});
