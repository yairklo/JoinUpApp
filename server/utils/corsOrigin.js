// CORS origin policy for the Express `cors` middleware and Socket.IO. Same allowlist, but each
// consumer needs a different way of rejecting:
//
// - Express (default): `callback(null, false)`. The response carries no Access-Control-Allow-*
//   headers, so the browser blocks it. An Error would go to the global error handler, which
//   answers 500 and reports to Sentry — any scanner with a random Origin would flood Sentry.
// - Socket.IO (`rejectWithError: true`): engine.io only aborts the handshake (400) when the cors
//   middleware errors; `false` lets polling AND WebSocket handshakes through. Browsers don't
//   enforce CORS on WebSockets, so this is the only origin gate there. engine.io never forwards
//   the Error to the Express error handler, so it doesn't reach Sentry.

// Vercel preview/deployment hosts of THIS team only: join-up[-app]-<hash or git-branch>-<team>.vercel.app.
// The team slug is mandatory, so another Vercel account's project named join-up-* / join-up-app-*
// can't pass CORS with credentials. Not a bare `*.vercel.app` wildcard either.
function vercelPreviewPattern() {
  const team = (process.env.CORS_VERCEL_TEAM_SLUG || 'yair-klausners-projects').toLowerCase();
  const escaped = team.replace(/[^a-z0-9-]/g, '');
  return new RegExp(`^https://join-up(-app)?-[a-z0-9-]+-${escaped}\.vercel\.app$`, 'i');
}

const LOCAL_DEV_ORIGIN_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/i,
  /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/i,
  /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/i,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}(:\d+)?$/i,
  /^exp:\/\/[\w.-]+(:\d+)?$/i,
  vercelPreviewPattern(),
];

function isLocalDevOrigin(origin) {
  return LOCAL_DEV_ORIGIN_PATTERNS.some((re) => re.test(origin));
}

// Warn once per distinct rejected origin, so scanners can't flood the logs. Bounded so a stream
// of random origins can't grow it forever.
const MAX_WARNED_ORIGINS = 500;
const warnedOrigins = new Set();

function warnRejectedOrigin(origin, details) {
  if (warnedOrigins.has(origin)) return;
  if (warnedOrigins.size >= MAX_WARNED_ORIGINS) warnedOrigins.clear();
  warnedOrigins.add(origin);
  console.warn('[CORS] Rejected origin:', origin, details);
}

function createCorsOriginCallback({ allowedOrigins, permissive, rejectWithError = false }) {
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

    warnRejectedOrigin(origin, {
      NODE_ENV: process.env.NODE_ENV,
      corsPermissive: permissive,
      allowedOrigins,
    });
    if (rejectWithError) {
      return callback(new Error('The CORS policy for this site does not allow access from the specified Origin.'), false);
    }
    return callback(null, false);
  };
}

module.exports = { createCorsOriginCallback, isLocalDevOrigin };
