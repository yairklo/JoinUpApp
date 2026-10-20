import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteUrl";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

// Regenerated at most once a day; fields change rarely.
export const revalidate = 86400;

const PAGE_SIZE = 100; // GET /api/fields caps `take` at 100
const MAX_FIELDS = 5000;

type FieldRow = { id: string };

/** All field ids via the public, paginated fields endpoint. Empty on any API failure. */
async function fetchFieldIds(): Promise<string[]> {
  const ids: string[] = [];
  try {
    for (let skip = 0; skip < MAX_FIELDS; skip += PAGE_SIZE) {
      const res = await fetch(`${API_BASE}/api/fields?take=${PAGE_SIZE}&skip=${skip}`, { next: { revalidate } });
      if (!res.ok) break;
      const body: { items?: FieldRow[]; hasMore?: boolean } = await res.json();
      for (const f of body.items || []) if (f?.id) ids.push(f.id);
      if (!body.hasMore) break;
    }
  } catch {
    // A sitemap without field pages beats a failed build or a 500 on /sitemap.xml.
  }
  return ids;
}

// Public pages only. Game pages are short-lived and list participants, and user profiles belong to
// real people (minors included), so neither is listed — see robots.ts.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/games`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/fields`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/search`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/sign-up`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${SITE_URL}/legal/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/legal/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ].map((p) => ({ ...p, lastModified: now }) as MetadataRoute.Sitemap[number]);

  const fieldPages: MetadataRoute.Sitemap = (await fetchFieldIds()).map((id) => ({
    url: `${SITE_URL}/fields/${id}`,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticPages, ...fieldPages];
}
