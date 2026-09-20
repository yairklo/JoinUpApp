"use client";

import { useEffect } from "react";
import Link from "next/link";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import { SignedOut, SignInButton } from "@clerk/nextjs";

// Game-page-specific fallback: same retry/home actions as app/error.tsx, plus the sign-in CTA
// for guests so a rendering failure never leaves a logged-out visitor with no way to join.
export default function GameRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[RouteError] Game page failed to render:", error);
  }, [error]);

  return (
    <Box
      dir="rtl"
      sx={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, p: 3, textAlign: "center" }}
    >
      <Typography variant="h5" fontWeight={800}>לא הצלחנו לטעון את המשחק</Typography>
      <Typography color="text.secondary" sx={{ maxWidth: 420 }}>
        נסו שוב, או חזרו לחיפוש משחקים.
      </Typography>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "center" }}>
        <Button variant="contained" onClick={() => reset()}>נסה שוב</Button>
        <Button component={Link} href="/search" variant="outlined">חזרה לחיפוש</Button>
      </Box>
      <SignedOut>
        <SignInButton mode="modal">
          <Button variant="text">התחבר כדי להצטרף</Button>
        </SignInButton>
      </SignedOut>
    </Box>
  );
}
