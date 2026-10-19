// CORS origin policy shared by the Express `cors` middleware and Socket.IO.
//
// A disallowed origin is rejected with `callback(null, false)`, not an Error: the response simply
// carries no Access-Control-Allow-* headers, so the browser blocks it. Passing an Error instead
// sends the request into the global error handler, which answers 500 and reports it to Sentry —
// any scanner with a random Origin header would then flood Sentry with non-bugs.

const LOCAL_DEV_ORIGIN_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/i,
  /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/i,
  /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/i,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}(:\d+)?$/i,
  /^exp:\/\/[\w.-]+(:\d+)?$/i,
  // Vercel preview deployments of THIS project only (e.g. join-up-app-git-<branch>-<team>.vercel.app).
  // Not a bare `*.vercel.app` wildcard — that would let any Vercel-hosted app pass CORS with credentials.
  /^https:\/\/join-up-app(-[\w-]+)?\.vercel\.app$/i,
];

function isLocalDevOrigin(origin) {
  return LOCAL_DEV_ORIGIN_PATTERNS.some((re) => re.test(origin));
}

function createCorsOriginCallback({ allowedOrigins, permissive }) {
  function isOriginAllowed(origin) {
    if (!origin) return true;
    if (allowedOrigins.includes(origin)) return true;
    if (isLocalDevOrigin(origin)) return true;
    if (permissive) return true;
    return false;
  }

  return function corsOriginCallback(origin, callback) {
    // React Native, Expo, Postman, curl — no Origin header
    if (!origin) return callback(null, true);

    if (isOriginAllowed(origin)) {
      // Must echo the exact origin (not *) when credentials: true
      return callback(null, origin);
    }

    console.warn('[CORS] Rejected origin:', origin, {
      NODE_ENV: process.env.NODE_ENV,
      corsPermissive: permissive,
      allowedOrigins,
    });
    return callback(null, false);
  };
}

module.exports = { createCorsOriginCallback, isLocalDevOrigin };
