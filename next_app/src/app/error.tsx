"use client";

import { useEffect } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import RefreshIcon from "@mui/icons-material/Refresh";
import HomeIcon from "@mui/icons-material/Home";
import Link from "next/link";

export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[RouteError] Uncaught client-side exception:", error);
  }, [error]);

  return (
    <Box
      dir="rtl"
      sx={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: 2,
        p: 4,
      }}
    >
      <Typography variant="h5" fontWeight="bold">
        משהו השתבש
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 420 }}>
        קרתה תקלה בטעינת העמוד. זה יכול לקרות בגלל עומס זמני על השרת — נסו שוב או חזרו לדף הבית.
      </Typography>
      <Box sx={{ display: "flex", gap: 1.5, mt: 1 }}>
        <Button variant="contained" startIcon={<RefreshIcon />} onClick={() => reset()}>
          נסה שוב
        </Button>
        <Button variant="outlined" component={Link} href="/games" startIcon={<HomeIcon />}>
          חזרה לדף הבית
        </Button>
      </Box>
    </Box>
  );
}
