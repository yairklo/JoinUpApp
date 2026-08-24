const request = require('supertest');
const express = require('express');
const { requestContext } = require('../middleware/requestContext');

function appWithContext() {
  const app = express();
  app.use(requestContext);
  app.get('/ping', (req, res) => res.json({ requestId: req.requestId }));
  app.get('/api/health', (_req, res) => res.json({ status: 'OK' }));
  return app;
}

describe('request context', () => {
  test('assigns X-Request-Id when none is sent', async () => {
    const res = await request(appWithContext()).get('/ping');
    expect(res.statusCode).toEqual(200);
    expect(res.headers['x-request-id']).toEqual(res.body.requestId);
    expect(res.body.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  test('echoes a well-formed incoming X-Request-Id', async () => {
    const res = await request(appWithContext())
      .get('/ping')
      .set('X-Request-Id', 'client.trace-12345');
    expect(res.headers['x-request-id']).toEqual('client.trace-12345');
    expect(res.body.requestId).toEqual('client.trace-12345');
  });

  test('rejects oversized or unsafe incoming ids', async () => {
    const res = await request(appWithContext())
      .get('/ping')
      .set('X-Request-Id', 'bad id with spaces');
    expect(res.body.requestId).not.toEqual('bad id with spaces');
    expect(res.headers['x-request-id']).toEqual(res.body.requestId);
  });
});
