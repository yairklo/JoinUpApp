"use client";

import { useEffect, useRef } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";

/**
 * Fixed "sign in to join" bar for logged-out visitors on the game page.
 *
 * Must be a Client Component: its `sx` uses a theme callback (`zIndex: (t) => ...`), and a
 * function can't be passed from a Server Component to a client one -- doing that inline in
 * `app/games/[id]/page.tsx` crashed the whole page render for every guest.
 */
export default function GuestJoinBar({ gameId }: { gameId: string }) {
  const ref = useRef<HTMLDivElement>(null);

  // Publish the bar's real height as --guest-bar-height so the Footer (the last thing on the
  // page) can reserve room for it; otherwise this fixed bar sits on top of the footer's last row.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const sync = () => root.style.setProperty("--guest-bar-height", `${el.offsetHeight}px`);
    sync();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.style.removeProperty("--guest-bar-height");
    };
  }, []);

  return (
    <Box
      ref={ref}
      sx={{
        position: "fixed",
        bottom: { xs: "calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))", md: 0 },
        insetInline: 0,
        zIndex: (t) => t.zIndex.appBar - 1,
        py: 1.5,
        px: 2,
        bgcolor: "background.paper",
        borderTop: 1,
        borderColor: "divider",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
      }}
    >
      <Typography variant="body2" fontWeight={600}>התחבר כדי להצטרף למשחק</Typography>
      <Button
        component={NextLink}
        href={`/sign-in?redirect_url=/games/${gameId}`}
        variant="contained"
        size="small"
        data-testid="guest-sign-in"
      >
        התחבר
      </Button>
    </Box>
  );
}
