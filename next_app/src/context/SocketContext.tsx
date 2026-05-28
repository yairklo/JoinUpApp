"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "@clerk/nextjs";

interface SocketContextProps {
    socket: Socket | null;
    isConnected: boolean;
}

const SocketContext = createContext<SocketContextProps>({ socket: null, isConnected: false });

export const SocketProvider = ({ children }: { children: ReactNode }) => {
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        // Only attempt connection if clerk is fully loaded and user is signed in
        if (!isLoaded || !isSignedIn) {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
                setSocket(null);
                setIsConnected(false);
            }
            return;
        }

        let currentSocket: Socket | null = null;

        const initSocket = async () => {
            try {
                const token = await getToken();
                const API_URL = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || "";

                currentSocket = io(API_URL, {
                    path: "/api/socket",
                    transports: ["websocket"], // STRICT WEBSOCKETS ONLY
                    withCredentials: true,
                    auth: { token }
                });

                socketRef.current = currentSocket;

                currentSocket.on("connect", () => {
                    console.log("[Global Socket] Connected:", currentSocket?.id);
                    setIsConnected(true);
                });

                currentSocket.on("disconnect", () => {
                    console.log("[Global Socket] Disconnected");
                    setIsConnected(false);
                });

                currentSocket.on("connect_error", async (err: any) => {
                    console.error("[Global Socket] Connection error:", err.message);
                    if (err.message.includes("Authentication error") || err.message.includes("JWT") || err.message.includes("token")) {
                        try {
                            const newToken = await getToken();
                            if (newToken && currentSocket) {
                                currentSocket.auth = { token: newToken };
                                currentSocket.connect();
                            }
                        } catch (e) {
                            console.error("[Global Socket] Token refresh failed", e);
                        }
                    }
                });

                setSocket(currentSocket);
            } catch (e) {
                console.error("[Global Socket] Init failed", e);
            }
        };

        initSocket();

        // CLEANUP FUNCTION
        return () => {
            if (currentSocket) {
                console.log("[Global Socket] Disconnecting and cleaning up...");
                currentSocket.disconnect();
                socketRef.current = null;
                setSocket(null);
                setIsConnected(false);
            }
        };
    }, [isLoaded, isSignedIn, getToken]); // getToken is stable in Clerk, won't cause infinite loop

    return (
        <SocketContext.Provider value={{ socket, isConnected }}>
            {children}
        </SocketContext.Provider>
    );
};

export const useSocket = () => {
    return useContext(SocketContext);
};
