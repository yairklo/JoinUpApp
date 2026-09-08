"use client";

import { useUser, SignInButton } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import GameCardSkeletonRow from "@/components/GameCardSkeletonRow";

import { useGamesByFriends } from "@/hooks/useGamesByFriends";
import { useGameUpdate } from "@/context/GameUpdateContext";
import { SportFilter, sportLabel } from "@/utils/sports";

import GameHeaderCard from "@/components/GameHeaderCard";
import JoinGameButton from "@/components/JoinGameButton";
import LeaveGameButton from "@/components/LeaveGameButton";
import GamesHorizontalList from "@/components/GamesHorizontalList";
import InlineErrorRow from "@/components/InlineErrorRow";
import { buildSearchHref } from "@/utils/searchHref";

export default function GamesByFriendsClient({ sportFilter = "ALL" }: { sportFilter?: SportFilter }) {
    const { games, loading, error, refetch } = useGamesByFriends();
    const { user } = useUser();
    const router = useRouter();
    const userId = user?.id || "";
    const { notifyGameUpdate } = useGameUpdate();

    const filteredGames = games.filter((g) => {
        if (sportFilter === "ALL") return true;
        return g.sport === sportFilter;
    });

    if (loading && games.length === 0) {
        return (
            <GamesHorizontalList title="משחקים עם חברים">
                <GameCardSkeletonRow />
            </GamesHorizontalList>
        );
    }

    if (error && filteredGames.length === 0) {
        return (
            <GamesHorizontalList title="משחקים עם חברים">
                <Box p={2} width="100%">
                    <InlineErrorRow message={error} onRetry={refetch} />
                </Box>
            </GamesHorizontalList>
        );
    }

    if (filteredGames.length === 0) {
        return (
            <GamesHorizontalList title="משחקים עם חברים">
                <Box p={2} width="100%">
                    <Typography variant="body2" color="text.secondary">
                        {user
                            ? (sportFilter !== "ALL"
                                ? `לא נמצאו משחקי ${sportLabel(sportFilter)} עם חברים`
                                : "עדיין אין משחקים עם חברים כרגע — הזמינו חברים או מצאו משחק חדש")
                            : "התחבר כדי לראות משחקים עם חברים"}
                    </Typography>
                    {!user && (
                        <SignInButton mode="modal">
                            <Button size="small" variant="outlined" sx={{ mt: 1 }}>התחבר</Button>
                        </SignInButton>
                    )}
                </Box>
            </GamesHorizontalList>
        );
    }

    const renderGameCard = (g: any) => {
        const joined = !!userId && (g.participants || []).some((p: any) => p.id === userId);
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
                isJoined={joined}
                isFriendsOnly={g.isFriendsOnly}
                href={`/games/${g.id}`}
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
                        joinPolicy={g.joinPolicy}
                        viewerParticipationStatus={g.viewerParticipationStatus}
                        onJoined={() => {
                            notifyGameUpdate(g.id, 'join', userId);
                            router.refresh();
                        }}
                    />
                )}
            </GameHeaderCard>
        );
    };

    return (
        <>
            <GamesHorizontalList
                title="משחקים עם חברים"
                seeAllHref={buildSearchHref({ sport: sportFilter, network: true })}
            >
                {filteredGames.map(renderGameCard)}
            </GamesHorizontalList>
        </>
    );
}
