/**
 * Content-Security-Policy for the web app, shipped as Content-Security-Policy-Report-Only first:
 * the browser reports violations (to Sentry) but blocks nothing, so a missing origin can't break
 * sign-in, maps or push in production. Once the reports are quiet, switch the header name in
 * next.config.ts to Content-Security-Policy.
 *
 * Origins below come from what the live site actually loads (Clerk via the same-origin /__clerk
 * proxy + img.clerk.com, Google Maps, Firebase messaging/analytics, Sentry, Cloudinary images) plus
 * the API/socket origins from env. `'unsafe-inline'` is required for now: Next.js bootstrap
 * scripts and MUI/Emotion styles are inline and the app has no nonce plumbing yet.
 */

type Env = Record<string, string | undefined>;

/** "https://x.y/path" -> "https://x.y"; also yields the ws(s) twin for socket connections. */
function originsFor(url: string | undefined): string[] {
  if (!url) return [];
  try {
    const { protocol, host } = new URL(url);
    if (protocol !== "https:" && protocol !== "http:") return [];
    const ws = protocol === "https:" ? "wss:" : "ws:";
    return [`${protocol}//${host}`, `${ws}//${host}`];
  } catch {
    return [];
  }
}

/**
 * Sentry's CSP report endpoint for a DSN (https://<key>@<host>/<projectId>):
 * https://<host>/api/<projectId>/security/?sentry_key=<key>
 */
export function sentryCspReportUri(dsn: string | undefined, environment?: string): string | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\/+/, "").split("/").pop();
    if (!u.username || !projectId) return null;
    const params = new URLSearchParams({ sentry_key: u.username });
    if (environment) params.set("sentry_environment", environment);
    return `${u.protocol}//${u.host}/api/${projectId}/security/?${params.toString()}`;
  } catch {
    return null;
  }
}

export function buildCsp(env: Env = process.env): string {
  const apiOrigins = [
    ...originsFor(env.NEXT_PUBLIC_API_URL),
    ...originsFor(env.NEXT_PUBLIC_SOCKET_URL),
  ];
  const sentryOrigins = (() => {
    try {
      return env.NEXT_PUBLIC_SENTRY_DSN ? [new URL(env.NEXT_PUBLIC_SENTRY_DSN).origin] : [];
    } catch {
      return [];
    }
  })();

  // Clerk's frontend API runs through the /__clerk proxy of the PRODUCTION site. On a Vercel preview
  // (pk_live_ key) clerk-js resolves that proxy to the canonical origin, i.e. cross-origin from the
  // preview URL, so it must be listed explicitly ('self' only covers the production domain itself).
  const siteOrigin = (() => {
    try {
      return new URL(env.NEXT_PUBLIC_SITE_URL || "https://join-up-app.vercel.app").origin;
    } catch {
      return null;
    }
  })();
  const clerkProxyOrigin = (() => {
    try {
      const proxy = env.NEXT_PUBLIC_CLERK_PROXY_URL?.trim();
      return proxy && /^https:\/\//.test(proxy) ? new URL(proxy).origin : null;
    } catch {
      return null;
    }
  })();
  const clerk = [
    "https://*.clerk.accounts.dev",
    "https://clerk.join-up-app.vercel.app",
    "https://challenges.cloudflare.com",
    ...(siteOrigin ? [siteOrigin] : []),
    ...(clerkProxyOrigin ? [clerkProxyOrigin] : []),
  ];
  const google = [
    "https://maps.googleapis.com",
    "https://maps.gstatic.com",
    "https://*.googleapis.com",
    "https://*.gstatic.com",
    "https://www.googletagmanager.com",
  ];

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    // 'unsafe-eval' only for `next dev` (React Refresh); production bundles don't need it.
    "script-src": ["'self'", "'unsafe-inline'", ...(env.NODE_ENV === "development" ? ["'unsafe-eval'"] : []), ...clerk, ...google],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "connect-src": [
      "'self'",
      ...apiOrigins,
      ...sentryOrigins,
      ...clerk,
      "https://clerk-telemetry.com",
      ...google,
      "https://*.google-analytics.com",
      "https://*.analytics.google.com",
      // GA4 (via Firebase Analytics) also beacons to www.google.com/g/collect — seen in CSP reports.
      "https://www.google.com",
    ],
    "frame-src": ["'self'", ...clerk, "https://www.google.com"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
  };

  const reportUri = sentryCspReportUri(env.NEXT_PUBLIC_SENTRY_DSN, env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || env.NODE_ENV);
  if (reportUri) directives["report-uri"] = [reportUri];

  return Object.entries(directives)
    .map(([name, values]) => `${name} ${Array.from(new Set(values)).join(" ")}`)
    .join("; ");
}
