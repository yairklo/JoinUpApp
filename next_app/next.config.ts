import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

export default nextConfig;
