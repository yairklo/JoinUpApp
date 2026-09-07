"use client";

import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Skeleton from "@mui/material/Skeleton";
import BouncingBall from "@/components/motion/BouncingBall";

/**
 * Next.js route-segment loading UI: shown automatically while GameDetails'
 * server-side fetch is in flight (instant nav, no blank-screen flash), then
 * swapped out for the real page. Mirrors the page's own layout so the swap
 * doesn't jump around.
 */
export default function GameDetailsLoading() {
  return (
    <main>
      <Container maxWidth="lg" sx={{ py: { xs: 2.5, md: 4 }, px: { xs: 2, sm: 3 } }}>
        <Card
          elevation={0}
          sx={{
            position: "relative",
            height: { xs: 200, sm: 240, md: 280 },
            borderRadius: 5,
            overflow: "hidden",
            mb: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: (t) =>
              t.palette.mode === "dark" ? "rgba(148,163,184,0.06)" : "rgba(15,23,42,0.035)",
          }}
        >
          <BouncingBall label="טוען את המשחק…" />
        </Card>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 3 }}>
          <Skeleton variant="rounded" width={132} height={34} sx={{ borderRadius: 999 }} />
          <Skeleton variant="rounded" width={96} height={34} sx={{ borderRadius: 999 }} />
          <Skeleton variant="rounded" width={96} height={34} sx={{ borderRadius: 999 }} />
        </Stack>

        <Grid container spacing={{ xs: 3, md: 4 }}>
          <Grid size={{ xs: 12, md: 7 }}>
            <Card elevation={0} sx={{ p: { xs: 2.5, md: 3 } }}>
              <Skeleton variant="text" width="45%" height={34} sx={{ mb: 2 }} />
              <Stack spacing={1.75}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <Stack key={i} direction="row" spacing={1.5} alignItems="center">
                    <Skeleton variant="circular" width={40} height={40} />
                    <Skeleton variant="text" width={`${58 - i * 5}%`} height={22} />
                  </Stack>
                ))}
              </Stack>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 5 }}>
            <Card elevation={0} sx={{ p: { xs: 2.5, md: 3 }, height: "100%", minHeight: 400 }}>
              <Skeleton variant="text" width="55%" height={32} />
              <Skeleton variant="text" width="75%" height={20} sx={{ mb: 3 }} />
              <Stack spacing={1.5}>
                {[62, 48, 70, 40].map((w, i) => (
                  <Box key={i} sx={{ display: "flex", justifyContent: i % 2 ? "flex-end" : "flex-start" }}>
                    <Skeleton variant="rounded" width={`${w}%`} height={44} sx={{ borderRadius: 3 }} />
                  </Box>
                ))}
              </Stack>
            </Card>
          </Grid>
        </Grid>
      </Container>
    </main>
  );
}
