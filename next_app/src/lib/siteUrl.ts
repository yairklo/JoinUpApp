/**
 * Canonical public origin of the web app, for robots.txt / sitemap.xml / metadataBase.
 * NEXT_PUBLIC_SITE_URL wins (set it when moving to a custom domain); otherwise the production
 * Vercel domain.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://join-up-app.vercel.app").replace(/\/+$/, "");

/**
 * Only the production deployment may be indexed. Vercel previews (and local builds) answer
 * robots.txt with "Disallow: /" so preview URLs never compete with the real site in search.
 * Off Vercel, opt in with ALLOW_INDEXING=true.
 */
export function isIndexable(env: Record<string, string | undefined> = process.env): boolean {
  if (env.ALLOW_INDEXING === "true") return true;
  return env.VERCEL_ENV === "production";
}
