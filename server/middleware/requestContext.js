const crypto = require('crypto');

function isNoisyPath(req) {
  const url = String(req.originalUrl || req.url || '');
  return url.startsWith('/api/health') || url.startsWith('/api/socket');
}

function requestContext(req, res, next) {
  const incoming = req.headers['x-request-id'];
  const id = (typeof incoming === 'string' && /^[\w.:-]{8,128}$/.test(incoming))
    ? incoming
    : crypto.randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);

  const skipLog = process.env.NODE_ENV === 'test'
    || !!process.env.JEST_WORKER_ID
    || isNoisyPath(req);

  if (!skipLog) {
    const start = Date.now();
    res.on('finish', () => {
      console.log(JSON.stringify({
        requestId: id,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        ms: Date.now() - start,
        userId: req.user?.id || undefined,
      }));
    });
  }

  next();
}

module.exports = { requestContext, isNoisyPath };
