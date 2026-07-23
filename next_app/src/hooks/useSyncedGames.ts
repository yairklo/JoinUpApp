import { useState, useRef, useEffect, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import { useGameUpdateListener, useGameCreatedListener, useGameDeletedListener } from "@/context/GameUpdateContext";
import { Game } from "@/types/game";
import { normalizeIncomingGame } from "@/utils/timezone";

export function useSyncedGames(initialGames: Game[] = [], filterPredicate?: (game: Game) => boolean) {
    const [games, setGames] = useState<Game[]>(initialGames);
    const { user } = useUser();
    const myId = user?.id;

    const predicateRef = useRef(filterPredicate);
    useEffect(() => {
        predicateRef.current = filterPredicate;
    });

    // Handle new game creation (delta updates)
    const handleGameCreated = useCallback(({ game }: { game: Game }) => {
        // The socket payload only carries the raw `start` ISO string (no `date`/`time`) — normalize
        // it the same way the initial REST fetch does before it touches the predicate (which parses
        // `game.date`, e.g. useGamesByDate's `new Date(game.date).toISOString()`) or list state,
        // otherwise both blow up on missing/undefined date-time strings.
        const normalizedGame = normalizeIncomingGame(game);

        const predicate = predicateRef.current;
        // If predicate exists, must match. If no predicate, accept all (default allowed)
        if (predicate && !predicate(normalizedGame)) return;

        setGames((prev) => {
            // Deduplication
            if (prev.some((g) => g.id === normalizedGame.id)) return prev;

            const newGames = [...prev, normalizedGame];
            // Sort by Date/Time
            return newGames.sort((a, b) => {
                const timeA = (a.date && a.time) ? new Date(`${a.date}T${a.time}`).getTime() : 0;
                const timeB = (b.date && b.time) ? new Date(`${b.date}T${b.time}`).getTime() : 0;
                return timeA - timeB;
            });
        });
    }, []);

    useGameCreatedListener(handleGameCreated);

    useGameDeletedListener(({ gameIds }) => {
        setGames((prev) => prev.filter(g => !gameIds.includes(g.id)));
    });

    useGameUpdateListener(({ gameId, action, userId }) => {
        setGames((prev) =>
            prev.map((game) => {
                if (game.id !== gameId) return game;

                const participants = game.participants || [];
                const userExists = participants.some((p) => p.id === userId);

                if (action === "join") {
                    // If user is already in participants, do nothing (idempotent)
                    if (userExists) return game;

                    // If it's the current user, try to get their name
                    // Otherwise use "User" placeholder
                    const name = userId === myId ? user?.fullName || "Me" : "User";

                    return {
                        ...game,
                        currentPlayers: game.currentPlayers + 1,
                        participants: [...participants, { id: userId, name }],
                    };
                } else {
                    // LEAVE
                    if (!userExists) return game;

                    return {
                        ...game,
                        currentPlayers: Math.max(0, game.currentPlayers - 1),
                        participants: participants.filter((p) => p.id !== userId),
                    };
                }
            })
        );
    });

    return {
        games,
        setGames,
    };
}
