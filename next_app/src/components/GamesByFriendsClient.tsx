"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
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
import EmptyState from "@/components/ui/EmptyState";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";

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
        // Signed-out visitors already get one consolidated sign-in card in "המשחקים שלי";
        // repeating a sign-in prompt per rail just stacks dead ends down the feed.
        if (!user) return null;
        return (
            <GamesHorizontalList title="משחקים עם חברים" staticContent>
                <Box width="100%">
                    <EmptyState
                        compact
                        accent="#6366f1"
                        icon={<GroupsRoundedIcon />}
                        title={
                            sportFilter !== "ALL"
                                ? `אין כרגע משחקי ${sportLabel(sportFilter)} עם חברים`
                                : "החברים שלך עוד לא קבעו משחק"
                        }
                        description="הזמינו חברים ל-JoinUp או פתחו משחק ושתפו אותו."
                        actions={
                            <Button component={Link} href="/games/new" size="small" variant="outlined">פתח משחק</Button>
                        }
                    />
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
                coverImage={g.fieldImage}
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
                isRefreshing={loading}
            >
                {filteredGames.map(renderGameCard)}
            </GamesHorizontalList>
        </>
    );
}
