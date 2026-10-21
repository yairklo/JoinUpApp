"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "@clerk/nextjs";

interface SocketContextProps {
    socket: Socket | null;
    isConnected: boolean;
}

const SocketContext = createContext<SocketContextProps>({ socket: null, isConnected: false });

// Manual reconnect schedule used when socket.io gives up on its own (server-initiated disconnect,
// or an auth rejection that the built-in reconnection does not retry).
const MANUAL_RECONNECT_MIN_MS = 1000;
const MANUAL_RECONNECT_MAX_MS = 30000;

export const SocketProvider = ({ children }: { children: ReactNode }) => {
    const { getToken, isLoaded, isSignedIn, userId } = useAuth();
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    // Always call the latest getToken from inside socket callbacks (it is not referentially stable).
    const getTokenRef = useRef(getToken);
    getTokenRef.current = getToken;

    useEffect(() => {
        // Only attempt connection if clerk is fully loaded and user is signed in
        if (!isLoaded || !isSignedIn) {
            setSocket(null);
            setIsConnected(false);
            return;
        }

        const API_URL = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || "";
        let disposed = false;
        let manualTimer: ReturnType<typeof setTimeout> | null = null;
        let manualDelay = MANUAL_RECONNECT_MIN_MS;

        const currentSocket: Socket = io(API_URL, {
            path: "/api/socket",
            // WebSocket first: long-polling through the reverse proxy intermittently 504s (and then
            // fails CORS because the proxy's error page carries no CORS headers). tryAllTransports
            // falls back to polling when the WebSocket handshake itself is blocked.
            transports: ["websocket", "polling"],
            tryAllTransports: true,
            withCredentials: true,
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 10000,
            randomizationFactor: 0.5,
            // A function is re-evaluated on EVERY (re)connect attempt, so a Clerk token that
            // expired during a long session or an offline period is never reused.
            auth: (cb) => {
                getTokenRef.current()
                    .then((token) => cb({ token }))
                    .catch(() => cb({ token: null }));
            },
        });

        const scheduleManualReconnect = () => {
            if (disposed || manualTimer) return;
            manualTimer = setTimeout(() => {
                manualTimer = null;
                if (disposed || currentSocket.connected) return;
                currentSocket.connect();
            }, manualDelay);
            manualDelay = Math.min(manualDelay * 2, MANUAL_RECONNECT_MAX_MS);
        };

        currentSocket.on("connect", () => {
            console.log("[Global Socket] Connected:", currentSocket.id);
            manualDelay = MANUAL_RECONNECT_MIN_MS;
            setIsConnected(true);
        });

        currentSocket.on("disconnect", (reason) => {
            console.log("[Global Socket] Disconnected:", reason);
            setIsConnected(false);
            // "io server disconnect": socket.io will NOT reconnect by itself.
            if (reason === "io server disconnect") {
                scheduleManualReconnect();
            }
        });

        currentSocket.on("connect_error", (err: Error) => {
            console.warn("[Global Socket] Connection error:", err.message);
            // The auth callback fetches a fresh token on each attempt. If the server rejected the
            // handshake the built-in reconnection stops, so keep trying with backoff.
            if (!currentSocket.active) scheduleManualReconnect();
        });

        // Coming back online / to the foreground: don't wait for the next backoff tick.
        const kick = () => {
            if (disposed || currentSocket.connected) return;
            manualDelay = MANUAL_RECONNECT_MIN_MS;
            currentSocket.connect();
        };
        const onVisible = () => { if (document.visibilityState === "visible") kick(); };
        window.addEventListener("online", kick);
        document.addEventListener("visibilitychange", onVisible);

        setSocket(currentSocket);

        return () => {
            disposed = true;
            if (manualTimer) clearTimeout(manualTimer);
            window.removeEventListener("online", kick);
            document.removeEventListener("visibilitychange", onVisible);
            console.log("[Global Socket] Disconnecting and cleaning up...");
            currentSocket.disconnect();
            setSocket(null);
            setIsConnected(false);
        };
    }, [isLoaded, isSignedIn, userId]);

    return (
        <SocketContext.Provider value={{ socket, isConnected }}>
            {children}
        </SocketContext.Provider>
    );
};

export const useSocket = () => {
    return useContext(SocketContext);
};
