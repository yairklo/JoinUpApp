"use client";

import { useEffect, useRef } from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";

// Invisible marker that fires `onVisible` once it scrolls into view.
// Drop it at the bottom of a list to drive infinite-scroll pagination.
export default function InfiniteScrollSentinel({
  hasMore,
  loading,
  onVisible,
}: {
  hasMore: boolean;
  loading: boolean;
  onVisible: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasMore) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onVisible();
      },
      { rootMargin: "400px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, onVisible]);

  if (!hasMore) return null;

  return (
    <Box ref={ref} display="flex" justifyContent="center" py={3}>
      {loading && <CircularProgress size={24} />}
    </Box>
  );
}
