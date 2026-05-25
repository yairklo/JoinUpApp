"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

import { useGamesByFriends } from "@/hooks/useGamesByFriends";
import { useGameUpdate } from "@/context/GameUpdateContext";
import { SportFilter } from "@/utils/sports";

import GameHeaderCard from "@/components/GameHeaderCard";
import JoinGameButton from "@/components/JoinGameButton";
import LeaveGameButton from "@/components/LeaveGameButton";
import GamesHorizontalList from "@/components/GamesHorizontalList";
import FullPageList from "@/components/FullPageList";

export default function GamesByFriendsClient({ sportFilter = "ALL" }: { sportFilter?: SportFilter }) {
    const { games, loading } = useGamesByFriends();
    const { user } = useUser();
    const router = useRouter();
    const userId = user?.id || "";
    const { notifyGameUpdate } = useGameUpdate();

    const [isSeeAllOpen, setIsSeeAllOpen] = useState(false);

    const filteredGames = games.filter((g) => {
        if (sportFilter === "ALL") return true;
        return g.sport === sportFilter;
    });

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" p={2}>
                <CircularProgress size={20} />
            </Box>
        );
    }

    if (filteredGames.length === 0) return null;

    const renderGameCard = (g: any) => {
        const joined = !!userId && (g.participants || []).some((p: any) => p.id === userId);
        const mainTitle = g.title || g.fieldName;
        const subtitle = g.title ? `${g.fieldName} • ${g.fieldLocation}` : g.fieldLocation;

        return (
            <GameHeaderCard
                key={g.id}
                time={g.time}
                date={g.date}
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
                        currentPlayers={g.currentPlayers}
                        onLeft={() => {
                            notifyGameUpdate(g.id, 'leave', userId);
                            router.refresh();
                        }}
                    />
                ) : (
                    <JoinGameButton
                        gameId={g.id}
                        registrationOpensAt={g.registrationOpensAt}
                        onJoined={() => {
                            notifyGameUpdate(g.id, 'join', userId);
                            router.refresh();
                        }}
                    />
                )}

                <Link href={`/games/${g.id}`} passHref legacyBehavior>
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
    };

    return (
        <>
            <GamesHorizontalList
                title="משחקים עם חברים"
                onSeeAll={() => setIsSeeAllOpen(true)}
            >
                {filteredGames.map(renderGameCard)}
            </GamesHorizontalList>

            <FullPageList
                open={isSeeAllOpen}
                onClose={() => setIsSeeAllOpen(false)}
                title="משחקים עם חברים"
                items={filteredGames}
                renderItem={renderGameCard}
            />
        </>
    );
}
