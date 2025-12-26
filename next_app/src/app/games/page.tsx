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
import Section from "@/components/ui/Section";
import MySeriesSection from "@/components/MySeriesSection";
import FriendsActivitySection from "@/components/FriendsActivitySection";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

export default async function GamesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const user = await currentUser();

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const todayStr = `${yyyy}-${mm}-${dd}`;
  const initialDate =
    (typeof searchParams.date === "string" && searchParams.date) || todayStr;

  return (
    <main>
      {/* Hero Section - Just Title & Subtitle */}
      <Box
        sx={{
          bgcolor: "primary.main",
          color: "primary.contrastText",
          pt: 6,
          pb: 8,
          mb: 4, // Added margin bottom to separate from content
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
        <Stack spacing={6}>
          
          {/* My Games - Quick Access (Existing component) */}
          <Box>
            <MyJoinedGames />
          </Box>

          {/* Create Game Button */}
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

          {/* Section 2: My Series */}
          <MySeriesSection />

          {/* Section 3: Friends Activity */}
          <FriendsActivitySection />

          {/* Section 1: Upcoming Games List (Existing logic) */}
          <Section title="Upcoming Games">
            <GamesByDateClient
              initialDate={initialDate}
              fieldId={
                typeof searchParams.fieldId === "string" ? searchParams.fieldId : undefined
              }
            />
          </Section>
        </Stack>
      </Container>
    </main>
  );
}
