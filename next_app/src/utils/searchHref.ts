import type { SportFilter } from "@/utils/sports";

/** Build `/search` with the filters a Home rail "הכל" click should pre-apply. */
export function buildSearchHref(opts: {
  sport?: SportFilter | string | null;
  date?: string | null;
  city?: string | null;
  network?: boolean;
}): string {
  const params = new URLSearchParams();
  const sport = opts.sport && opts.sport !== "ALL" ? String(opts.sport) : "";
  if (sport) params.set("sport", sport);
  if (opts.date) params.set("date", opts.date);
  if (opts.city) params.set("city", opts.city);
  if (opts.network) params.set("network", "1");
  const query = params.toString();
  return query ? `/search?${query}` : "/search";
}
