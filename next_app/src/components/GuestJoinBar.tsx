"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { SignInButton } from "@clerk/nextjs";

/**
 * Fixed "sign in to join" bar for logged-out visitors on the game page.
 *
 * Must be a Client Component: its `sx` uses a theme callback (`zIndex: (t) => ...`), and a
 * function can't be passed from a Server Component to a client one -- doing that inline in
 * `app/games/[id]/page.tsx` crashed the whole page render for every guest.
 */
export default function GuestJoinBar() {
  return (
    <Box
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
      <SignInButton mode="modal">
        <Button variant="contained" size="small">התחבר</Button>
      </SignInButton>
    </Box>
  );
}
