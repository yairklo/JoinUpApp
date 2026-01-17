"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useChat } from "@/context/ChatContext";
import React, { useState, useEffect } from "react";
import {
    Box,
    List,
    ListItem,
    ListItemButton,
    ListItemAvatar,
    ListItemText,
    Avatar,
    Typography,
    IconButton,
    useMediaQuery,
    useTheme,
    Badge,
    CircularProgress,
    Tabs,
    Tab
} from "@mui/material";
import ChatIcon from "@mui/icons-material/Chat";
import PersonIcon from "@mui/icons-material/Person";
import SportsSoccerIcon from "@mui/icons-material/SportsSoccer";
import { formatDistanceToNow } from "date-fns";
import { io } from "socket.io-client";

interface ChatPreview {
    id: string;
    type: 'group' | 'private';
    name: string;
    image: string | null;
    unreadCount: number;
    lastMessage: {
        text: string;
        createdAt: string;
        senderId: string;
        status: string;
    } | null;
    otherUserId?: string;
}

interface ChatListProps {
    userId: string;
    onChatSelect: (chatId: string) => void;
    isWidget?: boolean;
}

export default function ChatList({ userId, onChatSelect, isWidget = false }: ChatListProps) {
    const [chats, setChats] = useState<ChatPreview[]>([]);
    const [typingStatus, setTypingStatus] = useState<Record<string, string>>({}); // Mapping: chatId -> "John is typing..."
    const [loading, setLoading] = useState(false);
    const [tabValue, setTabValue] = useState(0);

    const { getToken } = useAuth();
    const router = useRouter();
    const { openChat, isWidgetOpen, closeChat, goBackToList, openWidget } = useChat();

    // State for total unread badge
    const [totalUnread, setTotalUnread] = useState(0);
    const [socketInstance, setSocketInstance] = useState<any>(null);

    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

    // Initial Fetch
    const fetchChats = async () => {
        if (!userId) return;
        try {
            setLoading(true);
            const token = await getToken();
            const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";
            const res = await fetch(`${API_URL}/api/users/${userId}/chats`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.ok) {
                const data = await res.json();
                setChats(data);

                // Calculate total unread
                const total = data.reduce((acc: number, chat: ChatPreview) => acc + (chat.unreadCount || 0), 0);
                setTotalUnread(total);

                // Join rooms if socket is ready
                if (socketInstance) {
                    const chatIds = data.map((c: ChatPreview) => c.id);
                    socketInstance.emit('joinChats', chatIds);
                }
            }
        } catch (error) {
            console.error("Failed to load chats", error);
        } finally {
            setLoading(false);
        }
    };

    // Socket Initialization
    useEffect(() => {
        if (!userId) return;

        let socket: any = null;

        const initSocket = async () => {
            try {
                const token = await getToken();
                const API_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "";

                socket = io(API_URL, {
                    path: "/api/socket",
                    transports: ["websocket"],
                    withCredentials: true,
                    auth: { token }
                });

                socket.on("connect", () => {
                    socket.emit("setup", { id: userId });
                    // If chats are already loaded, join them
                    setSocketInstance(socket);
                });

                socket.on("notification", (payload: any) => {
                    if (payload.type === 'message') {
                        // Fallback/Legacy or external notification
                        // We might rely on message:received for list updates, 
                        // but this handles notifications from chats we aren't listening to yet?
                        // fetchChats(); // Optimization: Rely on message:received
                    }
                });

                // --- Real-time Updates ---

                const handleTyping = ({ chatId, userName }: { chatId: string, userName: string }) => {
                    if (!chatId || !userName) return;
                    setTypingStatus(prev => ({ ...prev, [chatId]: `${userName} is typing...` }));

                    // Safety clear
                    setTimeout(() => {
                        setTypingStatus(prev => {
                            const newState = { ...prev };
                            delete newState[chatId];
                            return newState;
                        });
                    }, 3000);
                };

                const handleStopTyping = ({ chatId }: { chatId: string }) => {
                    setTypingStatus(prev => {
                        const newState = { ...prev };
                        delete newState[chatId];
                        return newState;
                    });
                };

                const handleNewMessage = (newMessage: any) => {
                    setChats(prevChats => {
                        const chatIndex = prevChats.findIndex(c => c.id === newMessage.chatId);

                        if (chatIndex === -1) {
                            // New chat we don't know about? Fetch all safe choice
                            fetchChats();
                            return prevChats;
                        }

                        const updatedChat = {
                            ...prevChats[chatIndex],
                            lastMessage: {
                                text: newMessage.content || newMessage.text,
                                createdAt: newMessage.ts || new Date().toISOString(),
                                senderId: newMessage.senderId,
                                status: newMessage.status
                            },
                            unreadCount: (newMessage.senderId !== userId)
                                ? (prevChats[chatIndex].unreadCount || 0) + 1
                                : prevChats[chatIndex].unreadCount
                        };

                        // Update total unread if needed
                        if (newMessage.senderId !== userId) {
                            setTotalUnread(prev => prev + 1);
                        }

                        // Reorder
                        const otherChats = prevChats.filter(c => c.id !== newMessage.chatId);
                        return [updatedChat, ...otherChats];
                    });
                };

                socket.on("typing:start", handleTyping);
                socket.on("typing:stop", handleStopTyping);
                socket.on("message:received", handleNewMessage);

            } catch (e) {
                console.error("Socket init failed", e);
            }
        };

        initSocket();

        return () => {
            if (socket) socket.disconnect();
        };
    }, [userId, getToken]);

    // Join rooms when socket AND chats are ready
    useEffect(() => {
        if (socketInstance && chats.length > 0) {
            const chatIds = chats.map(c => c.id);
            socketInstance.emit('joinChats', chatIds);
        }
    }, [socketInstance, chats.length]); // Intentionally minimal deps

    // Load chats on mount
    useEffect(() => {
        fetchChats();
    }, [userId]);

    const handleNavbarClick = () => {
        if (isMobile) {
            router.push('/chats');
        } else {
            if (isWidgetOpen) {
                closeChat();
            } else {
                openWidget();
            }
        }
    };

    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setTabValue(newValue);
    };

    const handleSelect = (chat: ChatPreview) => {
        // Optimistic update
        if (chat.unreadCount > 0) {
            setTotalUnread(prev => Math.max(0, prev - chat.unreadCount));
            setChats(prev => prev.map(c => c.id === chat.id ? { ...c, unreadCount: 0 } : c));
        }

        if (chat.type === 'group' || isMobile) {
            const route = chat.type === 'group' ? `/games/${chat.id}` : `/chat/${chat.id}`;
            router.push(route);
        } else {
            openChat(chat.id, { name: chat.name, image: chat.image });
        }
    };

    const filteredChats = chats.filter(chat =>
        tabValue === 0 ? chat.type === 'private' : chat.type === 'group'
    );

    const listContent = (
        <Box sx={{ width: '100%', bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs value={tabValue} onChange={handleTabChange} variant="fullWidth" aria-label="chat tabs">
                    <Tab icon={<PersonIcon />} iconPosition="start" label="שחקנים" />
                    <Tab icon={<SportsSoccerIcon />} iconPosition="start" label="משחקים" />
                </Tabs>
            </Box>

            <List sx={{ p: 0, overflowY: 'auto', flex: 1 }}>
                {loading && chats.length === 0 ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                        <CircularProgress />
                    </Box>
                ) : filteredChats.length === 0 ? (
                    <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary', mt: 4 }}>
                        <Typography>
                            {tabValue === 0 ? "אין צ'אטים פעילים עם שחקנים" : "לא נרשמת לאף משחק"}
                        </Typography>
                    </Box>
                ) : (
                    filteredChats.map((chat) => {
                        const timeDisplay = chat.lastMessage
                            ? formatDistanceToNow(new Date(chat.lastMessage.createdAt), { addSuffix: true })
                            : "";

                        const isTyping = typingStatus[chat.id];

                        return (
                            <ListItem key={chat.id} disablePadding divider>
                                <ListItemButton onClick={() => handleSelect(chat)} alignItems="flex-start">
                                    <ListItemAvatar>
                                        <Badge badgeContent={chat.unreadCount} color="error" overlap="circular">
                                            <Avatar src={chat.image || undefined} alt={chat.name}>
                                                {chat.name.charAt(0)}
                                            </Avatar>
                                        </Badge>
                                    </ListItemAvatar>
                                    <ListItemText
                                        primary={
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Typography
                                                    variant="subtitle2"
                                                    fontWeight={chat.unreadCount > 0 ? "bold" : "normal"}
                                                    noWrap
                                                    sx={{ maxWidth: '70%' }}
                                                >
                                                    {chat.name}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', ml: 1 }}>
                                                    {timeDisplay}
                                                </Typography>
                                            </Box>
                                        }
                                        secondary={
                                            <Typography
                                                variant="body2"
                                                color={isTyping ? "primary" : (chat.unreadCount > 0 ? "text.primary" : "text.secondary")}
                                                fontWeight={chat.unreadCount > 0 ? "bold" : "normal"}
                                                fontStyle={isTyping ? "italic" : "normal"}
                                                noWrap
                                                sx={{ display: 'block', maxWidth: '90%' }}
                                            >
                                                {isTyping ? isTyping : (chat.lastMessage ? chat.lastMessage.text : "התחל שיחה חדשה")}
                                            </Typography>
                                        }
                                    />
                                </ListItemButton>
                            </ListItem>
                        );
                    })
                )}
            </List>
        </Box>
    );

    if (isWidget) return listContent;

    return (
        <IconButton color="inherit" onClick={handleNavbarClick}>
            <Badge badgeContent={totalUnread} color="error">
                <ChatIcon />
            </Badge>
        </IconButton>
    );
}