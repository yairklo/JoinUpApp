// Local stand-in for @types/next-pwa. That package depends on next@13, which
// npm audit reports alongside this app's Next 15. next.config.ts only uses
// the options below.
declare module "next-pwa" {
  import type { NextConfig } from "next";

  interface NextPwaConfig {
    dest: string;
    disable?: boolean;
    register?: boolean;
    skipWaiting?: boolean;
    buildExcludes?: Array<RegExp | string>;
  }

  type WithPWA = (nextConfig: NextConfig) => NextConfig;

  function nextPWA(config: NextPwaConfig): WithPWA;

  export default nextPWA;
}
