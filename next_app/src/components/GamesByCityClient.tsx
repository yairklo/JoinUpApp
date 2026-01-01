"use client";

import { useEffect, useState } from "react";
import { useUser, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

import GameHeaderCard from "@/components/GameHeaderCard";
import JoinGameButton from "@/components/JoinGameButton";
import LeaveGameButton from "@/components/LeaveGameButton";
import GamesHorizontalList from "@/components/GamesHorizontalList";

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
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

export default function GamesByCityClient({ city }: { city: string }) {
    const [games, setGames] = useState<Game[]>([]);
    const [loading, setLoading] = useState(true);
    const { user, isLoaded } = useUser();
    const { getToken } = useAuth();
    const userId = user?.id || "";

    useEffect(() => {
        let ignore = false;

        if (!city) {
            setLoading(false);
            return;
        }

        async function run() {
            setLoading(true);
            try {
                const token = await getToken({ template: undefined }).catch(() => "");

                const qs = new URLSearchParams();
                qs.set("city", city);

                const res = await fetch(`${API_BASE}/api/games/city?${qs.toString()}`, {
                    cache: "no-store",
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });

                if (!res.ok) throw new Error("Failed to fetch city games");
                const data: Game[] = await res.json();

                // Sort by date/time
                data.sort(
                    (a, b) =>
                        new Date(`${a.date}T${a.time}:00`).getTime() -
                        new Date(`${b.date}T${b.time}:00`).getTime()
                );

                if (!ignore) setGames(data);
            } catch (err) {
                console.error("Error loading city games:", err);
                if (!ignore) setGames([]);
            } finally {
                if (!ignore) setLoading(false);
            }
        }
        run();
        return () => {
            ignore = true;
        };
    }, [city, isLoaded, getToken]);

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" p={2}>
                <CircularProgress size={20} />
            </Box>
        );
    }

    if (games.length === 0) return null;

    return (
        <GamesHorizontalList title={`Games in ${city}`}>
            {games.map((g) => {
                const joined = !!userId && (g.participants || []).some((p) => p.id === userId);
                const title = `${g.fieldName} • ${g.fieldLocation}`;

                return (
                    <GameHeaderCard
                        key={g.id}
                        time={g.time}
                        durationHours={g.duration ?? 1}
                        title={title}
                        currentPlayers={g.currentPlayers}
                        maxPlayers={g.maxPlayers}
                    >
                        {joined ? (
                            <LeaveGameButton gameId={g.id} />
                        ) : (
                            <JoinGameButton gameId={g.id} />
                        )}

                        <Link href={`/games/${g.id}`} passHref legacyBehavior>
                            <Button
                                component="a"
                                variant="text"
                                color="primary"
                                size="small"
                                endIcon={<ArrowForwardIcon />}
                            >
                                Details
                            </Button>
                        </Link>
                    </GameHeaderCard>
                );
            })}
        </GamesHorizontalList>
    );
}
