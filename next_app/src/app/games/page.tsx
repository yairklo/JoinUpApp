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
import GamesByFriendsClient from "@/components/GamesByFriendsClient";
import GamesByCityClient from "@/components/GamesByCityClient";
import SeriesSectionClient from "@/components/SeriesSectionClient";
import HomeHero from "@/components/HomeHero";

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
      <HomeHero />

      <Container maxWidth="md">
        <Stack spacing={4} id="games-feed" sx={{ scrollMarginTop: "20px" }}>

          {/* My Games */}
          <Box>
            <MyJoinedGames />
          </Box>

          {/* Series List */}
          <Box>
            <SeriesSectionClient />
          </Box>

          {/* Games by City */}
          <Box>
            <GamesByCityClient />
          </Box>

          {/* Games with Friends */}
          <Box>
            <GamesByFriendsClient />
          </Box>

          {/* All Games List */}
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