import type { NextConfig } from "next";
import withPWAInit from "next-pwa";
import { withSentryConfig } from "@sentry/nextjs/config";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  transpilePackages: ['@joinup/shared'],
  eslint: {
    // Allow production builds to successfully complete even if
    // there are ESLint errors. We still see them in logs.
    ignoreDuringBuilds: true,
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
    return [
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
