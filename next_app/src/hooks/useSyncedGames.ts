"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useGameUpdateListener } from "@/context/GameUpdateContext";
import { Game } from "@/types/game";

export function useSyncedGames(initialGames: Game[] = []) {
    const [games, setGames] = useState<Game[]>(initialGames);
    const { user } = useUser();
    const myId = user?.id;

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
