// Thin, optional Sentry wrapper. No-ops safely when SENTRY_DSN is not set,
// so this is inert in local/dev/CI and only reports once ops sets the env var.
let Sentry = null;

if (process.env.SENTRY_DSN) {
  Sentry = require('@sentry/node');
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
  });
  console.log('[sentry] error monitoring enabled');
} else {
  console.log('[sentry] SENTRY_DSN not set — error monitoring disabled');
}

function captureException(err, context) {
  if (Sentry) {
    Sentry.captureException(err, context ? { extra: context } : undefined);
  }
}

module.exports = { Sentry, captureException };
