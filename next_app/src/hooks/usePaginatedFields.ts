"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fieldsApi, FieldListItem } from "@/services/api/fields";

const PAGE_SIZE = 24;

export function usePaginatedFields({
  q = "",
  sport,
  includeUnavailable = false,
  token,
  enabled = true,
  initialItems,
  initialTotal,
  initialHasMore,
}: {
  q?: string;
  sport?: string;
  includeUnavailable?: boolean;
  token?: string | null;
  // Set false to hold off fetching — e.g. the admin list needs an auth token
  // before its first (includeUnavailable) request can succeed.
  enabled?: boolean;
  initialItems?: FieldListItem[];
  initialTotal?: number;
  initialHasMore?: boolean;
}) {
  const [fields, setFields] = useState<FieldListItem[]>(initialItems || []);
  const [total, setTotal] = useState(initialTotal ?? initialItems?.length ?? 0);
  const [hasMore, setHasMore] = useState(initialHasMore ?? true);
  const [loading, setLoading] = useState(!initialItems && enabled);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bumped on every new fetch-from-scratch so a slow, superseded request
  // can't clobber state after a newer search/filter already landed.
  const requestSeq = useRef(0);
  const skipInitialFetch = useRef(!!initialItems);

  const fetchPage = useCallback(
    async (skip: number, append: boolean) => {
      const seq = ++requestSeq.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const page = await fieldsApi.getPage({
          take: PAGE_SIZE,
          skip,
          q,
          sport,
          includeUnavailable,
          token: token || undefined,
        });
        if (seq !== requestSeq.current) return;
        setFields((prev) => (append ? [...prev, ...page.items] : page.items));
        setTotal(page.total);
        setHasMore(page.hasMore);
      } catch (e) {
        if (seq !== requestSeq.current) return;
        setError(e instanceof Error ? e.message : "טעינת המגרשים נכשלה");
      } finally {
        if (seq === requestSeq.current) {
          if (append) setLoadingMore(false);
          else setLoading(false);
        }
      }
    },
    [q, sport, includeUnavailable, token]
  );

  useEffect(() => {
    if (!enabled) return;
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }
    fetchPage(0, false);
  }, [fetchPage, enabled]);

  const loadMore = useCallback(() => {
    if (!enabled || loading || loadingMore || !hasMore) return;
    fetchPage(fields.length, true);
  }, [enabled, fetchPage, fields.length, hasMore, loading, loadingMore]);

  const reload = useCallback(() => fetchPage(0, false), [fetchPage]);

  return { fields, total, hasMore, loading, loadingMore, error, loadMore, reload };
}
