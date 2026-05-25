"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

import GameHeaderCard from "@/components/GameHeaderCard";
import LeaveGameButton from "@/components/LeaveGameButton";
import GamesHorizontalList from "@/components/GamesHorizontalList";

import { useMyGames } from "@/hooks/useMyGames";
import { useGameUpdate } from "@/context/GameUpdateContext";
import { SportFilter } from "@/utils/sports";

export default function MyJoinedGames({ sportFilter = "ALL" }: { sportFilter?: SportFilter }) {
  const { games, loading, userId, isLoaded } = useMyGames();
  const router = useRouter();
  const { notifyGameUpdate } = useGameUpdate();

  // Derive the list: only show games where I am still a participant
  const joinedGames = games.filter((g) => {
    return g.participants?.some((p) => p.id === userId);
  });

  const filteredGames = joinedGames.filter((g) => {
    if (sportFilter === "ALL") return true;
    return g.sport === sportFilter;
  });

  if (!isLoaded || loading) {
    return (
      <Box display="flex" justifyContent="center" p={2}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (filteredGames.length === 0) {
    return null;
  }

  return (
    <Box>
      <GamesHorizontalList title="המשחקים שלי">
        {filteredGames.map((g) => {
          const mainTitle = g.title || g.fieldName;
          const subtitle = g.title ? `${g.fieldName} • ${g.fieldLocation}` : g.fieldLocation;

          return (
            <GameHeaderCard
              key={g.id}
              time={g.time}
              date={g.date && g.date.includes('-') ? g.date.split('-').reverse().join('/') : g.date}
              durationHours={g.duration ?? 1}
              title={mainTitle}
              subtitle={subtitle}
              currentPlayers={g.currentPlayers}
              maxPlayers={g.maxPlayers}
              sport={g.sport}
              teamSize={g.teamSize}
              price={g.price}
              isJoined={true}
            >
              <LeaveGameButton
                gameId={g.id}
                currentPlayers={g.currentPlayers}
                onLeft={() => {
                  notifyGameUpdate(g.id, 'leave', userId);
                  router.refresh(); // Refresh to update other lists
                }}
              />

              <Button
                component={Link}
                href={`/games/${g.id}`}
                variant="text" // Corrected variant
                color="primary"
                size="small"
                endIcon={<ArrowForwardIcon />}
              >
                פרטים
              </Button>
            </GameHeaderCard>
          );
        })}
      </GamesHorizontalList>
    </Box>
  );
}