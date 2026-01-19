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
interface GameDeletedEvent {
    gameIds: string[];
}

// Types
export interface SeriesPayload {
    id: string;
    name: string;
    fieldName: string;
    time: string;
    dayOfWeek?: number;
    subscriberCount: number;
    sport?: string;
    subscriberIds?: string[];
}

interface SeriesDeletedEvent {
    seriesId: string;
}

interface GameUpdateContextProps {
    notifyGameUpdate: (gameId: string, action: GameAction, userId: string) => void;
    subscribe: (callback: (event: GameUpdateEvent) => void) => () => void;
    subscribeToCreated: (callback: (event: GameCreatedEvent) => void) => () => void;
    subscribeToDeleted: (callback: (event: GameDeletedEvent) => void) => () => void;
    subscribeToSeriesCreated: (callback: (series: SeriesPayload) => void) => () => void;
    subscribeToSeriesDeleted: (callback: (event: SeriesDeletedEvent) => void) => () => void;
}

const GameUpdateContext = createContext<GameUpdateContextProps | undefined>(undefined);

export const GameUpdateProvider = ({ children }: { children: ReactNode }) => {
    const [listeners] = useState(() => new Set<(event: GameUpdateEvent) => void>());
    const [createdListeners] = useState(() => new Set<(event: GameCreatedEvent) => void>());
    const [deletedListeners] = useState(() => new Set<(event: GameDeletedEvent) => void>());
    const [seriesCreatedListeners] = useState(() => new Set<(series: SeriesPayload) => void>());
    const [seriesDeletedListeners] = useState(() => new Set<(event: SeriesDeletedEvent) => void>());

    const { getToken } = useAuth();
    const socketRef = useRef<Socket | null>(null);

    // Socket Connection
    useEffect(() => {
        let socket: Socket | null = null;

        const initSocket = async () => {
            const base = process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin;

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

                socket.on("connect_error", async (err: any) => {
                    if (err.message.includes("Authentication error") || err.message.includes("JWT") || err.message.includes("token")) {
                        try {
                            const newToken = await getToken();
                            if (newToken && socket) {
                                socket.auth = { token: newToken };
                                socket.connect();
                            }
                        } catch (e) {
                            console.error("Token refresh failed", e);
                        }
                    }
                });

                // Listen for game creation (Delta Update)
                socket.on("game:created", (game: Game) => {
                    const event: GameCreatedEvent = { game };
                    createdListeners.forEach(cb => cb(event));
                });

                // Listen for game deletion
                socket.on("game:deleted", (payload: { gameIds: string[] }) => {
                    deletedListeners.forEach(cb => cb(payload));
                });

                // Listen for series events
                socket.on("series:created", (series: SeriesPayload) => {
                    seriesCreatedListeners.forEach(cb => cb(series));
                });
                socket.on("series:deleted", (payload: SeriesDeletedEvent) => {
                    seriesDeletedListeners.forEach(cb => cb(payload));
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
    }, [getToken, createdListeners, deletedListeners, seriesCreatedListeners, seriesDeletedListeners]);

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

    const subscribeToDeleted = useCallback((callback: (event: GameDeletedEvent) => void) => {
        deletedListeners.add(callback);
        return () => {
            deletedListeners.delete(callback);
        };
    }, [deletedListeners]);

    const subscribeToSeriesCreated = useCallback((callback: (series: SeriesPayload) => void) => {
        seriesCreatedListeners.add(callback);
        return () => {
            seriesCreatedListeners.delete(callback);
        };
    }, [seriesCreatedListeners]);

    const subscribeToSeriesDeleted = useCallback((callback: (event: SeriesDeletedEvent) => void) => {
        seriesDeletedListeners.add(callback);
        return () => {
            seriesDeletedListeners.delete(callback);
        };
    }, [seriesDeletedListeners]);

    return (
        <GameUpdateContext.Provider value={{
            notifyGameUpdate,
            subscribe,
            subscribeToCreated,
            subscribeToDeleted,
            subscribeToSeriesCreated,
            subscribeToSeriesDeleted
        }}>
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

// Helper hook for deletion events
export const useGameDeletedListener = (callback: (event: GameDeletedEvent) => void) => {
    const { subscribeToDeleted } = useGameUpdate();

    useEffect(() => {
        const unsubscribe = subscribeToDeleted(callback);
        return () => unsubscribe();
    }, [subscribeToDeleted, callback]);
};

// Helper hooks for Series
export const useSeriesCreatedListener = (callback: (series: SeriesPayload) => void) => {
    const { subscribeToSeriesCreated } = useGameUpdate();
    useEffect(() => {
        const unsubscribe = subscribeToSeriesCreated(callback);
        return () => unsubscribe();
    }, [subscribeToSeriesCreated, callback]);
};

export const useSeriesDeletedListener = (callback: (event: SeriesDeletedEvent) => void) => {
    const { subscribeToSeriesDeleted } = useGameUpdate();
    useEffect(() => {
        const unsubscribe = subscribeToSeriesDeleted(callback);
        return () => unsubscribe();
    }, [subscribeToSeriesDeleted, callback]);
};
