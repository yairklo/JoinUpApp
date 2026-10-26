import defaultCache from "next-pwa/cache";
import { buildRuntimeCaching, PWA_PRIVATE_CACHE_NAMES } from "./pwaRuntimeCaching";

const API = "https://api.example.com";
const rules = buildRuntimeCaching(API, defaultCache);

/** First matching rule wins in Workbox; mimic it (same-origin = https://app.example.com). */
function handlerFor(href: string): { handler: string; cacheName?: string } | undefined {
  const url = new URL(href);
  (globalThis as { self?: unknown }).self = { origin: "https://app.example.com" };
  for (const r of rules) {
    const p = r.urlPattern;
    const hit = p instanceof RegExp ? p.test(href) : typeof p === "function" ? p({ url, request: {} as Request }) : false;
    if (hit) return { handler: r.handler, cacheName: (r.options as { cacheName?: string } | undefined)?.cacheName };
  }
  return undefined;
}

describe("buildRuntimeCaching", () => {
  it.each([
    "https://app.example.com/profile",
    "https://app.example.com/games/abc?_rsc=1x2y",
    "https://app.example.com/?_rsc=abc",
    "https://app.example.com/series/1",
    "https://app.example.com/chat",
    "https://app.example.com/notifications",
    "https://app.example.com/settings/notifications",
    "https://app.example.com/admin",
    "https://app.example.com/tournaments/t1/manage",
    "https://app.example.com/some-other-page",
    "https://app.example.com/api/users/me",
    "https://api.example.com/users/me",
    "https://clerk.example.com/v1/client",
  ])("never caches %s", (href) => {
    expect(handlerFor(href)?.handler).toBe("NetworkOnly");
  });

  it.each([
    ["https://app.example.com/_next/static/chunks/main.js", "static-js-assets"],
    ["https://app.example.com/_next/static/css/a.css", "static-style-assets"],
    ["https://app.example.com/icons/icon-192.png", "static-image-assets"],
    ["https://app.example.com/_next/image?url=%2Fa.png&w=64&q=75", "next-image"],
    ["https://fonts.gstatic.com/s/x.woff2", "google-fonts-webfonts"],
  ])("still caches static asset %s", (href, cacheName) => {
    expect(handlerFor(href)).toEqual({ handler: expect.not.stringMatching(/NetworkOnly/), cacheName });
  });

  it("no rule writes to a private bucket", () => {
    const written = rules
      .filter((r) => r.handler !== "NetworkOnly")
      .map((r) => (r.options as { cacheName?: string } | undefined)?.cacheName);
    for (const name of ["others", "next-data", "apis", "pages", "pages-rsc", "pages-rsc-prefetch", "start-url"]) {
      expect(written).not.toContain(name);
    }
  });

  it("sign-out cleanup covers the buckets older workers filled", () => {
    expect(PWA_PRIVATE_CACHE_NAMES).toEqual(expect.arrayContaining(["others", "cross-origin", "apis", "next-data"]));
  });
});
