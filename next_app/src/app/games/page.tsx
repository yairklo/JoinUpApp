import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";

import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";

import MyJoinedGames from "@/components/MyJoinedGames";
import GamesByDateClient from "@/components/GamesByDateClient";

type Game = {
  id: string;
  fieldId: string;
  fieldName: string;
  fieldLocation: string;
  date: string;
  time: string;
  duration?: number;
  maxPlayers: number;
  currentPlayers: number;
  description: string;
  isOpenToJoin: boolean;
  participants?: Array<{ id: string; name?: string | null }>;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

async function fetchGames(
  searchParams: Record<string, string | string[] | undefined>
): Promise<Game[]> {
  const base = `${API_BASE}/api/games`;
  const qs = new URLSearchParams();
  if (searchParams.fieldId && typeof searchParams.fieldId === "string") {
    qs.set("fieldId", searchParams.fieldId);
  }
  const url = qs.toString() ? `${base}/search?${qs}` : base;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const data: Game[] = await res.json();

    const now = new Date();
    const futureOrActive = data.filter((g) => {
      const start = new Date(`${g.date}T${g.time}:00`);
      const durationHours = g.duration ?? 1;
      const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
      return end >= now;
    });

    futureOrActive.sort(
      (a, b) =>
        new Date(`${a.date}T${a.time}:00`).getTime() -
        new Date(`${b.date}T${b.time}:00`).getTime()
    );
    return futureOrActive;
  } catch (e) {
    return [];
  }
}

export default async function GamesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const user = await currentUser();
  const userId = user?.id || "";

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const todayStr = `${yyyy}-${mm}-${dd}`;
  const initialDate =
    (typeof searchParams.date === "string" && searchParams.date) || todayStr;

  return (
    <main>
      <Box
        sx={{
          bgcolor: "primary.main",
          color: "primary.contrastText",
          pt: 6,
          pb: 8,
          mb: -4,
          borderRadius: { xs: 0, md: "0 0 32px 32px" },
          boxShadow: 3,
        }}
      >
        <Container maxWidth="md">
          <Typography variant="h3" component="h1" fontWeight="800" gutterBottom>
            Active Games
          </Typography>
          <Typography variant="subtitle1" sx={{ opacity: 0.9 }}>
            Find your next match or start a new one.
          </Typography>
        </Container>
      </Box>

      <Container maxWidth="md">
        <Stack spacing={4}>
          <Box sx={{ position: "relative", zIndex: 2 }}>
            <MyJoinedGames />
          </Box>

          <Box>
            <Link href="/games/new" passHref legacyBehavior>
              <Button
                component="a"
                variant="contained"
                size="large"
                fullWidth
                startIcon={<AddCircleOutlineIcon sx={{ fontSize: 32 }} />}
                sx={{
                  py: 2.5,
                  borderRadius: 4,
                  fontSize: "1.2rem",
                  fontWeight: "bold",
                  textTransform: "none",
                  boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
                  background: "linear-gradient(45deg, #2e7d32 30%, #66bb6a 90%)",
                  "&:hover": {
                    background: "linear-gradient(45deg, #1b5e20 30%, #43a047 90%)",
                    boxShadow: "0 12px 24px rgba(0,0,0,0.2)",
                    transform: "translateY(-2px)",
                  },
                  transition: "all 0.3s cubic-bezier(.25,.8,.25,1)",
                }}
              >
                Create New Game
              </Button>
            </Link>
          </Box>

          <Box>
            <GamesByDateClient
              initialDate={initialDate}
              fieldId={
                typeof searchParams.fieldId === "string" ? searchParams.fieldId : undefined
              }
            />
          </Box>
        </Stack>
      </Container>
    </main>
  );
}