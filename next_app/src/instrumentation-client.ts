import * as Sentry from '@sentry/nextjs';

// Client-side error monitoring. No-ops when the public DSN isn't configured,
// so this stays inert in local/dev/CI builds.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || 0.1),
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
