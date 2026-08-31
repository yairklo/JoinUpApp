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
};

export default withSentryConfig(withPWA(nextConfig as any), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  // No auth token in most envs yet -> source map upload is skipped, not fatal.
  widenClientFileUpload: false,
});
