"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from "react";

type GameAction = "join" | "leave";

interface GameUpdateEvent {
    gameId: string;
    action: GameAction;
    userId: string;
    // Optional: add other info if needed for generic updates
}

interface GameUpdateContextProps {
    notifyGameUpdate: (gameId: string, action: GameAction, userId: string) => void;
    // We expose a subscription mechanism
    subscribe: (callback: (event: GameUpdateEvent) => void) => () => void;
}

const GameUpdateContext = createContext<GameUpdateContextProps | undefined>(undefined);

export const GameUpdateProvider = ({ children }: { children: ReactNode }) => {
    const [listeners] = useState(() => new Set<(event: GameUpdateEvent) => void>());

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

    return (
        <GameUpdateContext.Provider value={{ notifyGameUpdate, subscribe }}>
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

// Helper hook for components to easily listen for specific game updates or all updates
export const useGameUpdateListener = (callback: (event: GameUpdateEvent) => void) => {
    const { subscribe } = useGameUpdate();

    useEffect(() => {
        const unsubscribe = subscribe(callback);
        return () => unsubscribe();
    }, [subscribe, callback]);
};
