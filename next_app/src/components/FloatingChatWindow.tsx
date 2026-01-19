"use client";

import React, { useEffect, useState } from "react";
import { Paper, Box, Typography, IconButton, Collapse, useTheme, useMediaQuery, Avatar } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import RemoveIcon from "@mui/icons-material/Remove";
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import Chat from "./Chat";
import ChatList from "./ChatList";
import { useChat } from "@/context/ChatContext";
import { useAuth, useUser } from "@clerk/nextjs";

export default function FloatingChatWindow() {
    const { activeChatId, isWidgetOpen, isMinimized, headerInfo, closeChat, minimizeChat, maximizeChat, goBackToList } = useChat();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
    const { user } = useUser();
    const { getToken } = useAuth();
    const isRTL = true; // Hardcoded for widget or derive from context if available

    // Socket & State for Status
    const [socketInstance, setSocketInstance] = useState<any>(null);
    const [otherUserId, setOtherUserId] = useState<string | null>(null);
    const [isOtherUserOnline, setIsOtherUserOnline] = useState(false);
    const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
    const typingTimeoutsRef = React.useRef<Record<string, NodeJS.Timeout>>({});
    const API_BASE = process.env.NEXT_PUBLIC_API_URL;

    // Determine other user ID by fetching chat details if standard headerInfo lacks it
    useEffect(() => {
        if (!activeChatId || activeChatId === 'global') {
            setOtherUserId(null);
            return;
        }

        const fetchChatDetails = async () => {
            // If we already have the ID via headerInfo (if we updated the type later), use it. 
            // But for now, fetch to be safe and type-compliant.
            try {
                const token = await getToken();
                const res = await fetch(`${API_BASE}/api/chats/${activeChatId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.type === 'PRIVATE') {
                        const other = data.participants?.find((p: any) => p.userId !== user?.id);
                        if (other) setOtherUserId(other.userId);
                    } else {
                        setOtherUserId(null); // Group chat: no single "online" status in header usually
                    }
                }
            } catch (e) {
                console.error("Failed to fetch chat details for widget header", e);
            }
        };

        fetchChatDetails();
    }, [activeChatId, user?.id, getToken, API_BASE]);


    // Socket Initialization for Header Logic
    useEffect(() => {
        if (!isWidgetOpen || !user || !activeChatId) return;

        let socket: any = null;

        const initSocket = async () => {
            try {
                const token = await getToken();
                // We reuse the existing socket infrastructure by creating a connection specific for this widget's header
                // Note: This creates a second socket connection if Chat also connects. 
                // Ideally, ChatContext should hold the socket, but per instructions we implement here.
                const { io } = require("socket.io-client");
                socket = io(API_BASE, {
                    path: "/api/socket",
                    transports: ["websocket"],
                    withCredentials: true,
                    auth: { token }
                });
                setSocketInstance(socket);

                socket.on("connect", () => {
                    if (activeChatId) {
                        socket.emit("joinRoom", activeChatId);
                    }
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

                // Presence
                socket.on('presence:update', ({ userId: uid, isOnline }: { userId: string, isOnline: boolean }) => {
                    if (uid === otherUserId) {
                        setIsOtherUserOnline(isOnline);
                    }
                });

                // Typing
                socket.on('typing:start', ({ chatId, userName, senderId }: { chatId: string, userName: string, senderId: string }) => {
                    if (chatId === activeChatId && senderId !== user.id) {
                        const name = userName || "Someone";
                        if (typingTimeoutsRef.current[senderId]) clearTimeout(typingTimeoutsRef.current[senderId]);

                        setTypingUsers(prev => {
                            const next = new Set(prev);
                            next.add(name);
                            return next;
                        });

                        typingTimeoutsRef.current[senderId] = setTimeout(() => {
                            setTypingUsers(prev => {
                                const next = new Set(prev);
                                next.delete(name);
                                return next;
                            });
                        }, 3000);
                    }
                });

                socket.on('typing:stop', ({ chatId, userName, senderId }: { chatId: string, userName: string, senderId: string }) => {
                    if (chatId === activeChatId && senderId !== user.id) {
                        const name = userName || "Someone";
                        if (typingTimeoutsRef.current[senderId]) clearTimeout(typingTimeoutsRef.current[senderId]);
                        setTypingUsers(prev => {
                            const next = new Set(prev);
                            next.delete(name);
                            return next;
                        });
                    }
                });

                // Subscribe Presence
                if (otherUserId) {
                    socket.emit('subscribePresence', otherUserId);
                }

            } catch (e) {
                console.error("Widget Socket Init Error", e);
            }
        };

        initSocket();

        return () => {
            if (socket) socket.disconnect();
        };
    }, [isWidgetOpen, user, activeChatId, getToken, API_BASE, otherUserId]);

    // Update presence subscription if otherUserId changes while socket is active
    useEffect(() => {
        if (socketInstance && otherUserId) {
            socketInstance.emit('subscribePresence', otherUserId);
        }
    }, [socketInstance, otherUserId]);

    if (isMobile) return null; // Disable widget on mobile
    if (!isWidgetOpen || !user) return null;

    return (
        <Paper
            elevation={6}
            sx={{
                position: "fixed",
                bottom: 0,
                zIndex: 2000,
                width: isMobile ? "100%" : 340,
                left: isMobile ? 0 : 20,
                borderTopLeftRadius: 8,
                borderTopRightRadius: 8,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                bgcolor: "background.paper"
            }}
        >
            {/* Header */}
            <Box
                sx={{
                    p: 1.5,
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer"
                }}
                onClick={isMinimized ? maximizeChat : minimizeChat}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, overflow: 'hidden' }}>
                    {activeChatId && (
                        <IconButton onClick={(e) => { e.stopPropagation(); goBackToList(); }} size="small" sx={{ color: 'inherit' }}>
                            <ArrowForwardIcon fontSize="small" />
                        </IconButton>
                    )}
                    {activeChatId && headerInfo?.image && (
                        <Avatar src={headerInfo.image} sx={{ width: 24, height: 24 }} />
                    )}

                    <Box sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <Typography variant="subtitle2" fontWeight="bold" noWrap>
                            {activeChatId ? (headerInfo?.name || "Chat") : "הודעות"}
                        </Typography>

                        {/* Status Bar Container (Same Logic as Chat.tsx) */}
                        {activeChatId && (
                            <Box sx={{ display: 'flex', alignItems: 'center', minHeight: '16px' }}>
                                {/* STATE 1: TYPING */}
                                {typingUsers.size > 0 ? (
                                    <Typography variant="caption" sx={{
                                        fontSize: '0.7rem',
                                        color: 'secondary.light',
                                        fontWeight: 'bold',
                                        fontStyle: 'italic',
                                        animation: 'pulse 1.5s infinite',
                                        '@keyframes pulse': { '0%': { opacity: 0.7 }, '50%': { opacity: 1 }, '100%': { opacity: 0.7 } }
                                    }}>
                                        {isRTL ? "מקליד/ה..." : "Typing..."}
                                    </Typography>
                                ) : (
                                    /* STATE 2: PRESENCE */
                                    (otherUserId) ? (
                                        isOtherUserOnline ? (
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                <Box sx={{ width: 6, height: 6, bgcolor: '#4caf50', borderRadius: '50%' }} />
                                                <Typography variant="caption" sx={{ fontSize: '0.7rem', color: '#81c784' }}>
                                                    {isRTL ? "מחובר/ת" : "Online"}
                                                </Typography>
                                            </Box>
                                        ) : (
                                            <Typography variant="caption" sx={{ fontSize: '0.7rem', opacity: 0.7 }}>
                                                {isRTL ? "לא מחובר/ת" : "Offline"}
                                            </Typography>
                                        )
                                    ) : null
                                )}
                            </Box>
                        )}
                    </Box>
                </Box>

                <Box onClick={(e) => e.stopPropagation()}>
                    {isMinimized ? (
                        <IconButton size="small" sx={{ color: "inherit" }} onClick={maximizeChat}>
                            <OpenInFullIcon fontSize="small" />
                        </IconButton>
                    ) : (
                        <IconButton size="small" sx={{ color: "inherit" }} onClick={minimizeChat}>
                            <RemoveIcon fontSize="small" />
                        </IconButton>
                    )}
                    <IconButton size="small" sx={{ color: "inherit" }} onClick={closeChat}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </Box>
            </Box>

            {/* Content */}
            <Collapse in={!isMinimized}>
                <Box sx={{ height: 450, width: "100%" }}>
                    {activeChatId ? (
                        <Chat roomId={activeChatId} isWidget={true} />
                    ) : (
                        <ChatList userId={user.id} onChatSelect={() => { }} isWidget={true} />
                    )}
                </Box>
            </Collapse>
        </Paper>
    );
}
