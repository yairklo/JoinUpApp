"use client";

import { useRouter } from "next/navigation";
import { SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import GameCardSkeletonRow from "@/components/GameCardSkeletonRow";

import GameHeaderCard from "@/components/GameHeaderCard";
import LeaveGameButton from "@/components/LeaveGameButton";
import GamesHorizontalList from "@/components/GamesHorizontalList";
import InlineErrorRow from "@/components/InlineErrorRow";

import { useMyGames } from "@/hooks/useMyGames";
import { useGameUpdate } from "@/context/GameUpdateContext";
import { SportFilter } from "@/utils/sports";

export default function MyJoinedGames({ sportFilter = "ALL" }: { sportFilter?: SportFilter }) {
  const { games, loading, error, refetch, userId, isLoaded } = useMyGames();
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

  // Only show the full skeleton for a true initial load (no data on screen
  // yet) -- a background refetch (e.g. after leaving a game elsewhere)
  // keeps the already-rendered cards up instead of blanking them out.
  if (!isLoaded || (loading && filteredGames.length === 0)) {
    return (
      <GamesHorizontalList title="המשחקים שלי">
        <GameCardSkeletonRow />
      </GamesHorizontalList>
    );
  }

  if (error && filteredGames.length === 0) {
    return (
      <GamesHorizontalList title="המשחקים שלי">
        <Box p={2} width="100%">
          <InlineErrorRow message={error} onRetry={refetch} />
        </Box>
      </GamesHorizontalList>
    );
  }

  if (filteredGames.length === 0) {
    return (
      <GamesHorizontalList title="המשחקים שלי">
        <Box p={2} width="100%">
          <Typography variant="body2" color="text.secondary">
            {userId ? "עדיין אין לך משחקים פעילים — מצא משחק והצטרף" : "התחבר כדי לראות את המשחקים שלך"}
          </Typography>
          {userId ? (
            <Button component={Link} href="/search" size="small" variant="outlined" sx={{ mt: 1 }}>מצא משחק</Button>
          ) : (
            <SignInButton mode="modal">
              <Button size="small" variant="outlined" sx={{ mt: 1 }}>התחבר</Button>
            </SignInButton>
          )}
        </Box>
      </GamesHorizontalList>
    );
  }

  return (
    <Box>
      <GamesHorizontalList title="המשחקים שלי" isRefreshing={loading}>
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
              href={`/games/${g.id}`}
            >
              <LeaveGameButton
                gameId={g.id}
                currentPlayers={g.currentPlayers}
                onLeft={() => {
                  notifyGameUpdate(g.id, 'leave', userId);
                  router.refresh(); // Refresh to update other lists
                }}
              />
            </GameHeaderCard>
          );
        })}
      </GamesHorizontalList>
    </Box>
  );
}