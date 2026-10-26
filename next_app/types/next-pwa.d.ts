// Local stand-in for @types/next-pwa. That package depends on next@13, which
// npm audit reports alongside this app's Next 15. next.config.ts only uses
// the options below.
declare module "next-pwa" {
  import type { NextConfig } from "next";

  // Workbox RuntimeCaching entry (subset used here and by next-pwa/cache).
  interface RuntimeCaching {
    urlPattern: RegExp | string | ((ctx: { url: URL; request: Request; sameOrigin?: boolean }) => boolean);
    handler: "CacheFirst" | "CacheOnly" | "NetworkFirst" | "NetworkOnly" | "StaleWhileRevalidate";
    method?: string;
    options?: Record<string, unknown>;
  }

  interface NextPwaConfig {
    dest: string;
    disable?: boolean;
    register?: boolean;
    skipWaiting?: boolean;
    cacheStartUrl?: boolean;
    dynamicStartUrl?: boolean;
    buildExcludes?: Array<RegExp | string>;
    runtimeCaching?: RuntimeCaching[];
  }

  type WithPWA = (nextConfig: NextConfig) => NextConfig;

  function nextPWA(config: NextPwaConfig): WithPWA;

  export type { RuntimeCaching };
  export default nextPWA;
}

declare module "next-pwa/cache" {
  import type { RuntimeCaching } from "next-pwa";

  const defaultCache: RuntimeCaching[];
  export default defaultCache;
}
