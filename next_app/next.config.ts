import path from "path";
import type { NextConfig } from "next";
import withPWAInit, { type RuntimeCaching } from "next-pwa";
import defaultCache from "next-pwa/cache";
import { withSentryConfig } from "@sentry/nextjs/config";
import { buildCsp } from "./src/lib/csp";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

// Same base URL the web app's fetches use (src/**: NEXT_PUBLIC_API_URL || localhost:3005).
const apiOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005").origin;
  } catch {
    return "http://localhost:3005";
  }
})();

// Authenticated responses (/users/me, chats, notifications, Clerk sessions) must never land in
// Cache Storage: next-pwa's catch-all "cross-origin" rule (NetworkFirst) would serve them on a
// timeout/offline and keep them after sign-out on a shared device. Listed before defaultCache,
// so it wins (Workbox uses the first matching route). A RegExp, not a function: GenerateSW
// serializes urlPattern into sw.js, so a function could not read apiOrigin from this closure.
// Matches: every request to the API origin, any /api/* or /__clerk/* path (same-origin routes,
// the Clerk proxy), and Clerk hosts (*.clerk.com, *.clerk.accounts.dev, clerk.<domain>).
const apiNetworkOnly: RuntimeCaching = {
  urlPattern: new RegExp(
    [
      `^${escapeRegExp(apiOrigin)}(?:/|$)`,
      String.raw`^https?://[^/]+/(?:api|__clerk)(?:[/?#]|$)`,
      String.raw`^https://(?:[^/]+\.)?clerk\.(?:com|accounts\.dev)(?:[/:?#]|$)`,
      String.raw`^https://clerk\.[^/]+/`,
    ].join("|"),
  ),
  handler: "NetworkOnly",
};

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  runtimeCaching: [apiNetworkOnly, ...defaultCache],
  // Workbox aborts the whole service-worker install when any precache URL is
  // not 2xx, so the worker never reaches "activated". These compilation
  // assets are listed by GenerateSW and are not publicly served: source maps
  // are dropped from the deployment, and Next 15 does not expose
  // app-build-manifest.json or dynamic-css-manifest.json.
  buildExcludes: [
    /\.map$/,
    /app-build-manifest\.json$/,
    /dynamic-css-manifest\.json$/,
  ],
});

const pwaRegisterDisabled = process.env.NODE_ENV === "development";

/** next-pwa's register.js is an entry side effect; entries are string[] or `{ import }`. */
function prependRegister(entry: unknown, registerJs: string): boolean {
  if (Array.isArray(entry)) {
    if (!entry.includes(registerJs)) entry.unshift(registerJs);
    return true;
  }
  if (entry && typeof entry === "object" && "import" in entry) {
    const spec = (entry as { import?: unknown }).import;
    if (typeof spec === "string") {
      (entry as { import: string[] }).import = spec === registerJs ? [spec] : [registerJs, spec];
      return true;
    }
    if (Array.isArray(spec)) {
      if (!spec.includes(registerJs)) spec.unshift(registerJs);
      return true;
    }
  }
  return false;
}

const nextConfig: NextConfig = {
  transpilePackages: ['@joinup/shared'],
  webpack(config, options) {
    // next-pwa calls this webpack hook first, then prepends register.js only to
    // the Pages Router entry `main.js`. App Router pages load `main-app` and
    // never execute that chunk, so the register call is in the build output
    // and never runs. Prepend the same file to `main-app` here. Skipped when
    // PWA is disabled: register.js expects next-pwa's DefinePlugin globals.
    if (pwaRegisterDisabled || options.dev || options.isServer) return config;

    const registerJs = path.join(process.cwd(), "node_modules/next-pwa/register.js");
    const originalEntry = config.entry;
    config.entry = async () => {
      const entries = typeof originalEntry === "function" ? await originalEntry() : { ...originalEntry };
      const key = (["main-app", "main-app.js"] as const).find((name) => entries[name]);
      if (!key || !prependRegister(entries[key], registerJs)) {
        throw new Error(
          `next-pwa register.js was not injected into the App Router client entry (keys: ${Object.keys(entries).join(", ")})`,
        );
      }
      return entries;
    };
    return config;
  },
  eslint: {
    // ESLint errors fail the build (warnings don't). src/ had 0 errors when this was turned on.
    ignoreDuringBuilds: false,
  },
  typescript: {
    // If type errors appear in CI, you can temporarily allow builds to proceed.
    // Ideally fix types and set this back to false.
    ignoreBuildErrors: false,
  },
  async headers() {
    // Static brand/content images under /public default to `max-age=0,
    // must-revalidate` like everything else served from there, forcing a
    // revalidation round-trip on every single page load. They aren't
    // content-hashed (unlike _next/static/*), so avoid `immutable` — a
    // moderate max-age plus stale-while-revalidate still lets a swapped
    // file propagate within a day instead of caching it away for a year.
    // sw.js/workbox-*.js/manifest.json are deliberately left untouched:
    // the service worker must keep revalidating on every load to roll out.
    // Baseline security headers on every route. The CSP is Report-Only for now (see src/lib/csp.ts):
    // violations are reported to Sentry without blocking, until the allowlist is confirmed.
    const securityHeaders = [
      { key: "Content-Security-Policy-Report-Only", value: buildCsp() },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
    ];
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/images/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" },
        ],
      },
      {
        source: "/icons/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" },
        ],
      },
      {
        source: "/:file(hero_bg\\.jpg|favicon\\.svg|file\\.svg|globe\\.svg|next\\.svg|vercel\\.svg|window\\.svg)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" },
        ],
      },
    ];
  },
};

export default withSentryConfig(withPWA(nextConfig as any), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  // No auth token in most envs yet -> source map upload is skipped, not fatal.
  widenClientFileUpload: false,
});
