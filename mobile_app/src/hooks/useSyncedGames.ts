import { useState, useRef, useEffect, useCallback } from "react";
import { useUser } from "@clerk/clerk-expo";
import {
    useGameUpdateListener,
    useGameCreatedListener,
    useGameDeletedListener,
    useGameUpdatedListener,
} from "@/context/GameUpdateContext";
import { Game } from "@/types/game";

function sortByStart(games: Game[]) {
    return [...games].sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.time}`);
        const dateB = new Date(`${b.date}T${b.time}`);
        return dateA.getTime() - dateB.getTime();
    });
}

export function useSyncedGames(initialGames: Game[] = [], filterPredicate?: (game: Game) => boolean) {
    const [games, setGames] = useState<Game[]>(initialGames);
    const { user } = useUser();
    const myId = user?.id;

    const predicateRef = useRef(filterPredicate);
    useEffect(() => {
        predicateRef.current = filterPredicate;
    });

    const upsertGame = useCallback((game: Game) => {
        const predicate = predicateRef.current;
        setGames((prev) => {
            const exists = prev.some((g) => g.id === game.id);
            const matches = predicate ? predicate(game) : true;

            if (matches) {
                if (exists) {
                    return prev.map((g) => (g.id === game.id ? { ...g, ...game } : g));
                }
                return sortByStart([...prev, game]);
            }

            if (exists) {
                return prev.filter((g) => g.id !== game.id);
            }
            return prev;
        });
    }, []);

    // Full server snapshots (join / leave / waitlist confirm / approve) — personalized per viewer.
    useGameUpdatedListener(
        useCallback(
            ({ game }) => {
                if (game?.id) upsertGame(game);
            },
            [upsertGame]
        )
    );

    // Handle new game creation (delta updates)
    const handleGameCreated = useCallback(({ game }: { game: Game }) => {
        const predicate = predicateRef.current;
        if (predicate && !predicate(game)) return;

        setGames((prev) => {
            if (prev.some((g) => g.id === game.id)) return prev;
            return sortByStart([...prev, game]);
        });
    }, []);

    useGameCreatedListener(handleGameCreated);

    useGameDeletedListener(({ gameIds }) => {
        setGames((prev) => prev.filter((g) => !gameIds.includes(g.id)));
    });

    useGameUpdateListener(({ gameId, action, userId }) => {
        setGames((prev) => {
            const existing = prev.find((g) => g.id === gameId);

            if (action === "join") {
                // If the game isn't in this list yet (e.g. My Games after waitlist→confirmed),
                // local notify alone can't invent the full card — rely on game:updated / refetch.
                if (!existing) return prev;

                const participants = existing.participants || [];
                const userExists = participants.some((p) => p.id === userId);
                if (userExists) {
                    return prev.map((game) =>
                        game.id !== gameId
                            ? game
                            : {
                                  ...game,
                                  viewerParticipationStatus:
                                      userId === myId ? "CONFIRMED" : game.viewerParticipationStatus,
                                  waitlistOfferPending: userId === myId ? false : game.waitlistOfferPending,
                              }
                    );
                }

                const name = userId === myId ? user?.fullName || "אני" : "משתמש";

                return prev.map((game) => {
                    if (game.id !== gameId) return game;
                    return {
                        ...game,
                        currentPlayers: game.currentPlayers + 1,
                        participants: [...participants, { id: userId, name }],
                        viewerParticipationStatus:
                            userId === myId ? "CONFIRMED" : game.viewerParticipationStatus,
                        waitlistOfferPending: userId === myId ? false : game.waitlistOfferPending,
                    };
                });
            }

            if (action === "waitlist") {
                if (!existing) return prev;
                return prev.map((game) => {
                    if (game.id !== gameId) return game;
                    return {
                        ...game,
                        waitlistCount: (game.waitlistCount || 0) + 1,
                        viewerParticipationStatus:
                            userId === myId ? "WAITLISTED" : game.viewerParticipationStatus,
                    };
                });
            }

            // LEAVE
            if (!existing) return prev;
            const participants = existing.participants || [];
            const userExists = participants.some((p) => p.id === userId);

            if (!userExists) {
                if (
                    userId === myId &&
                    (existing.viewerParticipationStatus === "WAITLISTED" || existing.waitlistOfferPending)
                ) {
                    const next = {
                        ...existing,
                        waitlistCount: Math.max(0, (existing.waitlistCount || 1) - 1),
                        viewerParticipationStatus: null as Game["viewerParticipationStatus"],
                        waitlistOfferPending: false,
                    };
                    const predicate = predicateRef.current;
                    if (predicate && !predicate(next)) {
                        return prev.filter((g) => g.id !== gameId);
                    }
                    return prev.map((g) => (g.id === gameId ? next : g));
                }
                return prev;
            }

            const next = {
                ...existing,
                currentPlayers: Math.max(0, existing.currentPlayers - 1),
                participants: participants.filter((p) => p.id !== userId),
                viewerParticipationStatus:
                    userId === myId ? null : existing.viewerParticipationStatus,
                waitlistOfferPending: userId === myId ? false : existing.waitlistOfferPending,
            } as Game;

            const predicate = predicateRef.current;
            if (predicate && !predicate(next)) {
                return prev.filter((g) => g.id !== gameId);
            }
            return prev.map((g) => (g.id === gameId ? next : g));
        });
    });

    return {
        games,
        setGames,
    };
}
