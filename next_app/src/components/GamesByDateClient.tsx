```typescript
"use client";

import { useEffect, useMemo, useState } from "react";
import { useUser, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";

import { useGameUpdate, useGameUpdateListener } from "@/context/GameUpdateContext";

import GamesDateNav from "@/components/GamesDateNav";
import GameHeaderCard from "@/components/GameHeaderCard";
import JoinGameButton from "@/components/JoinGameButton";
import LeaveGameButton from "@/components/LeaveGameButton";
import GamesHorizontalList from "@/components/GamesHorizontalList";
import FullPageList from "@/components/FullPageList";

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
  participants?: Array<{ id: string; name?: string | null }>;
  sport?: string;
  registrationOpensAt?: string | null;
  title?: string | null;
  teamSize?: number | null;
  price?: number | null;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

import { SportFilter } from "@/utils/sports";

export default function GamesByDateClient({
  initialDate,
  fieldId,
  sportFilter = "ALL",
}: {
  initialDate: string;
  fieldId?: string;
  sportFilter?: SportFilter;
}) {
  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [games, setGames] = useState<Game[]>([]);
  const [isSeeAllOpen, setIsSeeAllOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user, isLoaded } = useUser(); // Added isLoaded to wait for auth check
  const { getToken } = useAuth();
  const router = useRouter();
  const userId = user?.id || "";

  const { notifyGameUpdate } = useGameUpdate();

  // Listen for external updates
  useGameUpdateListener(({ gameId, action, userId: updateUserId }) => {
      setGames(prev => prev.map(game => {
          if (game.id !== gameId) return game;
          
          if (action === 'join') {
              if (game.participants?.some(p => p.id === updateUserId)) return game;
              return {
                  ...game,
                  currentPlayers: game.currentPlayers + 1,
                  participants: [...(game.participants || []), { id: updateUserId, name: "User" }] 
              };
          } else { // LEAVE
              if (!game.participants?.some(p => p.id === updateUserId)) return game;
               return {
                  ...game,
                  currentPlayers: Math.max(0, game.currentPlayers - 1),
                  participants: (game.participants || []).filter(p => p.id !== updateUserId)
              };
          }
      }));
  });

  const groups = useMemo(() => {
    return games.reduce<Record<string, Game[]>>((acc, g) => {
      (acc[g.date] ||= []).push(g);
      return acc;
    }, {});
  }, [games]);

  useEffect(() => {
    let ignore = false;

    // Wait until Clerk determines if user is logged in or not
    if (!isLoaded) return;

    async function run() {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        qs.set("date", selectedDate);
        if (fieldId) qs.set("fieldId", fieldId);

        // Try to get token
        const token = await getToken({ template: undefined }).catch(() => "");

        // Critical Logic Fix:
        // If we have a token, use /search (personalized).
        // If NO token, use /public (guaranteed access for guests).
        const endpoint = token ? "/api/games/search" : "/api/games/public";
        const url = `${ API_BASE }${ endpoint }?${ qs.toString() } `;

        const res = await fetch(url, {
          cache: "no-store",
          headers: token ? { Authorization: `Bearer ${ token } ` } : {},
        });

        if (!res.ok) throw new Error("Failed to fetch games");
        const data: Game[] = await res.json();

        const now = new Date();
        const filtered = data.filter((g) => {
          const start = new Date(`${ g.date }T${ g.time }:00`);
          const end = new Date(start.getTime() + (g.duration ?? 1) * 3600000);
          return end >= now;
        });

        filtered.sort(
          (a, b) =>
            new Date(`${ a.date }T${ a.time }:00`).getTime() -
            new Date(`${ b.date }T${ b.time }:00`).getTime()
        );

        if (!ignore) setGames(filtered);
      } catch (err) {
        console.error("Error loading games:", err);
        if (!ignore) setGames([]);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    run();
    return () => {
      ignore = true;
    };
  }, [selectedDate, fieldId, isLoaded, getToken]); // Added dependencies

  const currentDayGames = (groups[selectedDate] || []).filter((g) => {
    if (sportFilter === "ALL") return true;
    return g.sport === sportFilter;
  });

  // Calculate filtered games for see all view
  const allFilteredGames = games.filter((g) => {
    if (sportFilter === "ALL") return true;
    return g.sport === sportFilter;
  });

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1} mb={0.5} px={1}>
        <CalendarTodayIcon sx={{ fontSize: 18, color: "text.secondary" }} />
        <Typography variant="subtitle2" color="text.secondary" fontWeight="600" textTransform="uppercase" letterSpacing={1}>
          חפש לפי תאריך
        </Typography>
      </Box>

      <Box mb={2}>
        <GamesDateNav
          selectedDate={selectedDate}
          fieldId={fieldId}
          onSelectDate={(d) => setSelectedDate(d)}
        />
      </Box>

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress size={30} />
        </Box>
      ) : currentDayGames.length === 0 ? (
        <Box
          sx={{
            bgcolor: "action.hover",
            borderRadius: 2,
            p: 4,
            textAlign: "center",
          }}
        >
          <Typography variant="body1" color="text.secondary">
            לא נמצאו משחקים בתאריך {selectedDate}.
          </Typography>
          <Button
            size="small"
            sx={{ mt: 1 }}
            onClick={() => setSelectedDate(new Date().toISOString().split("T")[0])}
          >
            חזור להיום
          </Button>
        </Box>
      ) : (
        <GamesHorizontalList
          title={`משחקים בתאריך ${ selectedDate } `}
          onSeeAll={() => setIsSeeAllOpen(true)}
        >
          {currentDayGames.map((g) => {
            const joined = !!userId && (g.participants || []).some((p) => p.id === userId);
            const mainTitle = g.title || g.fieldName;
            const subtitle = g.title ? `${ g.fieldName } • ${ g.fieldLocation } ` : g.fieldLocation;

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
                isJoined={joined}
              >
                {joined ? (
                  <LeaveGameButton
                    gameId={g.id}
                    onLeft={() => {
                      setGames(prev => prev.map(game => {
                        if (game.id !== g.id) return game;
                        return {
                          ...game,
                          currentPlayers: Math.max(0, game.currentPlayers - 1),
                          participants: (game.participants || []).filter(p => p.id !== userId)
                        };
                      }));
                      router.refresh();
                    }}
                  />
                ) : (
                  <JoinGameButton
                    gameId={g.id}
                    registrationOpensAt={g.registrationOpensAt}
                    onJoined={() => {
                      setGames(prev => prev.map(game => {
                        if (game.id !== g.id) return game;
                        // Optimistically add user. real data comes on re-fetch or refresh but this updates UI instantly
                        return {
                          ...game,
                          currentPlayers: game.currentPlayers + 1,
                          participants: [...(game.participants || []), { id: userId, name: user?.fullName || "Me" }]
                        };
                      }));
                      router.refresh();
                    }}
                  />
                )}

                <Link href={`/ games / ${ g.id } `} passHref legacyBehavior>
                  <Button
                    component="a"
                    variant="text"
                    color="primary"
                    size="small"
                    endIcon={<ArrowForwardIcon />}
                  >
                    פרטים
                  </Button>
                </Link>
              </GameHeaderCard>
            );
          })}
        </GamesHorizontalList>
      )}

      {/* Full Screen Overlay for See All */}
      <FullPageList
        open={isSeeAllOpen}
        onClose={() => setIsSeeAllOpen(false)}
        title={`משחקים בתאריך ${ selectedDate } `}
        items={allFilteredGames}
        renderItem={(g) => {
          const joined = !!userId && (g.participants || []).some((p) => p.id === userId);
          const mainTitle = g.title || g.fieldName;
          const subtitle = g.title ? `${ g.fieldName } • ${ g.fieldLocation } ` : g.fieldLocation;
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
            >
              {joined ? (
                <LeaveGameButton
                  gameId={g.id}
                  onLeft={() => {
                        notifyGameUpdate(g.id, 'leave', userId);
                        setGames(prev => prev.map(game => {
                            if (game.id !== g.id) return game;
                            return {
                                ...game,
                                currentPlayers: Math.max(0, game.currentPlayers - 1),
                                participants: (game.participants || []).filter(p => p.id !== userId)
                            };
                        }));
                        router.refresh();
                    }}
                  />
                ) : (
                  <JoinGameButton
                    gameId={g.id}
                    registrationOpensAt={g.registrationOpensAt}
                    onJoined={() => {
                        notifyGameUpdate(g.id, 'join', userId);
                        setGames(prev => prev.map(game => {
                            if (game.id !== g.id) return game;
                            return {
                                ...game,
                                currentPlayers: game.currentPlayers + 1,
                                participants: [...(game.participants || []), { id: userId, name: user?.fullName || "Me" }]
                            };
                        }));
                        router.refresh();
                    }}
                  />
              )}

              <Button
                component={Link}
                href={`/ games / ${ g.id } `}
                variant="text"
                color="primary"
                size="small"
                endIcon={<ArrowForwardIcon />}
              >
                פרטים
              </Button>
            </GameHeaderCard>
          );
        }}
      />
    </Box>
  );
}