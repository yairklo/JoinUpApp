import { useState, useRef, useEffect, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import { useGameUpdateListener, useGameCreatedListener } from "@/context/GameUpdateContext";
import { Game } from "@/types/game";

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
        const predicate = predicateRef.current;
        // If predicate exists, must match. If no predicate, accept all (default allowed)
        if (predicate && !predicate(game)) return;

        setGames((prev) => {
            // Deduplication
            if (prev.some((g) => g.id === game.id)) return prev;

            const newGames = [...prev, game];
            // Sort by Date/Time
            newGames.sort((a, b) => {
                const dateA = new Date(`${a.date}T${a.time}`);
                const dateB = new Date(`${b.date}T${b.time}`);
                return dateA.getTime() - dateB.getTime();
            });
            return newGames;
        });
    }, []);

    useGameCreatedListener(handleGameCreated);

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
