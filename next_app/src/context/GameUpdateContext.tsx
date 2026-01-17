"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "@clerk/nextjs";
import { Game } from "@/types/game";

type GameAction = "join" | "leave";

interface GameUpdateEvent {
    gameId: string;
    action: GameAction;
    userId: string;
}

interface GameCreatedEvent {
    game: Game;
}

interface GameUpdateContextProps {
    notifyGameUpdate: (gameId: string, action: GameAction, userId: string) => void;
    subscribe: (callback: (event: GameUpdateEvent) => void) => () => void;
    subscribeToCreated: (callback: (event: GameCreatedEvent) => void) => () => void;
}

const GameUpdateContext = createContext<GameUpdateContextProps | undefined>(undefined);

export const GameUpdateProvider = ({ children }: { children: ReactNode }) => {
    const [listeners] = useState(() => new Set<(event: GameUpdateEvent) => void>());
    const [createdListeners] = useState(() => new Set<(event: GameCreatedEvent) => void>());

    const { getToken } = useAuth();
    const socketRef = useRef<Socket | null>(null);

    // Socket Connection
    useEffect(() => {
        let socket: Socket | null = null;

        const initSocket = async () => {
            const base = process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin;
            // Basic health check to ensure backend is ready (optional but good practice)
            // fetch(`${base.replace(/\/$/, "")}/api/health`).catch(() => {});

            try {
                const token = await getToken();
                // We use the same path as Chat component
                socket = io(base, {
                    path: "/api/socket",
                    transports: ["websocket"],
                    withCredentials: true,
                    auth: { token }
                });
                socketRef.current = socket;

                socket.on("connect", () => {
                    // console.log("GameUpdateContext: Socket connected", socket?.id);
                });

                // Listen for game creation (Delta Update)
                socket.on("game:created", (game: Game) => {
                    // console.log("GameUpdateContext: game:created received", game.id);
                    const event: GameCreatedEvent = { game };
                    createdListeners.forEach(cb => cb(event));
                });

                socket.on("error", (err) => {
                    console.error("GameSocket error", err);
                });

            } catch (e) {
                console.error("GameSocket init failed", e);
            }
        };

        initSocket();

        return () => {
            if (socket) socket.disconnect();
        };
    }, [getToken, createdListeners]);

    const notifyGameUpdate = useCallback((gameId: string, action: GameAction, userId: string) => {
        const event: GameUpdateEvent = { gameId, action, userId };
        listeners.forEach((callback) => callback(event));
    }, [listeners]);

    const subscribe = useCallback((callback: (event: GameUpdateEvent) => void) => {
        listeners.add(callback);
        return () => {
            listeners.delete(callback);
        };
    }, [listeners]);

    const subscribeToCreated = useCallback((callback: (event: GameCreatedEvent) => void) => {
        createdListeners.add(callback);
        return () => {
            createdListeners.delete(callback);
        };
    }, [createdListeners]);

    return (
        <GameUpdateContext.Provider value={{ notifyGameUpdate, subscribe, subscribeToCreated }}>
            {children}
        </GameUpdateContext.Provider>
    );
};

export const useGameUpdate = () => {
    const context = useContext(GameUpdateContext);
    if (!context) {
        throw new Error("useGameUpdate must be used within a GameUpdateProvider");
    }
    return context;
};

// Helper hook for update events (join/leave)
export const useGameUpdateListener = (callback: (event: GameUpdateEvent) => void) => {
    const { subscribe } = useGameUpdate();

    useEffect(() => {
        const unsubscribe = subscribe(callback);
        return () => unsubscribe();
    }, [subscribe, callback]);
};

// Helper hook for creation events
export const useGameCreatedListener = (callback: (event: GameCreatedEvent) => void) => {
    const { subscribeToCreated } = useGameUpdate();

    useEffect(() => {
        const unsubscribe = subscribeToCreated(callback);
        return () => unsubscribe();
    }, [subscribeToCreated, callback]);
};
