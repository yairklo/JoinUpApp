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
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

export default function GamesByFriendsClient() {
    const [games, setGames] = useState<Game[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSeeAllOpen, setIsSeeAllOpen] = useState(false);
    const { user, isLoaded } = useUser();
    const { getToken } = useAuth();
    const userId = user?.id || "";

    useEffect(() => {
        let ignore = false;

        // If not loaded yet, or not logged in, we can't really fetch friends but we should wait for auth
        if (!isLoaded) return;
        if (!user) {
            setLoading(false);
            return;
        }

        async function run() {
            setLoading(true);
            try {
                const token = await getToken({ template: undefined }).catch(() => "");
                if (!token) {
                    if (!ignore) setLoading(false);
                    return;
                }

                const res = await fetch(`${API_BASE}/api/games/friends`, {
                    cache: "no-store",
                    headers: { Authorization: `Bearer ${token}` },
                });

                if (!res.ok) throw new Error("Failed to fetch friends games");
                const data: Game[] = await res.json();

                // Sort by date/time
                data.sort(
                    (a, b) =>
                        new Date(`${a.date}T${a.time}:00`).getTime() -
                        new Date(`${b.date}T${b.time}:00`).getTime()
                );

                if (!ignore) setGames(data);
            } catch (err) {
                console.error("Error loading friends games:", err);
                if (!ignore) setGames([]);
            } finally {
                if (!ignore) setLoading(false);
            }
        }
        run();
        return () => {
            ignore = true;
        };
    }, [isLoaded, user, getToken]);

    // If loading, show spinner. If no games, render nothing.
    if (loading) {
        return (
            <Box display="flex" justifyContent="center" p={2}>
                <CircularProgress size={20} />
            </Box>
        );
    }

    if (games.length === 0) return null;

    return (
        <>
            <GamesHorizontalList
                title="משחקים עם חברים"
                onSeeAll={() => setIsSeeAllOpen(true)}
            >
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

                            <Link href={`/games/${g.id}`} style={{ textDecoration: 'none' }}>
                                <Button
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

            <FullPageList
                open={isSeeAllOpen}
                onClose={() => setIsSeeAllOpen(false)}
                title="משחקים עם חברים"
                items={games}
                renderItem={(g) => {
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

                            <Link href={`/games/${g.id}`} style={{ textDecoration: 'none' }}>
                                <Button
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
                }}
            />
        </>
    );
}
