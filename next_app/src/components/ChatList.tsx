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
    const [loading, setLoading] = useState(false);
    const [tabValue, setTabValue] = useState(0);

    const { getToken } = useAuth();
    const router = useRouter();
    const { openChat, isWidgetOpen, closeChat, goBackToList, openWidget } = useChat();

    // State for total unread badge
    const [totalUnread, setTotalUnread] = useState(0);

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
            }
        } catch (error) {
            console.error("Failed to load chats", error);
        } finally {
            setLoading(false);
        }
    };

    // Socket Listener
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
                });

                socket.on("notification", (payload: any) => {
                    if (payload.type === 'message') {
                        setTotalUnread((prev) => prev + 1);
                        fetchChats();
                    }
                });
            } catch (e) {
                console.error("Socket init failed", e);
            }
        };

        initSocket();

        return () => {
            if (socket) socket.disconnect();
        };
    }, [userId, getToken]);

    // Load chats on mount
    useEffect(() => {
        fetchChats();
    }, [userId]);

    const handleNavbarClick = () => {
        if (isMobile) {
            // Mobile: Go to dedicated page
            router.push('/chats');
        } else {
            // Desktop: Toggle floating widget
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
            // Update local state to remove badge immediately
            setChats(prev => prev.map(c => c.id === chat.id ? { ...c, unreadCount: 0 } : c));
        }

        // LOGIC CHANGE: Redirect based on type
        if (chat.type === 'group' || isMobile) {
            // If it's a game OR we are on mobile, use full page navigation
            const route = chat.type === 'group' ? `/games/${chat.id}` : `/chat/${chat.id}`;
            router.push(route);
        } else {
            // If it's a private chat on desktop, open chat window widget
            openChat(chat.id, { name: chat.name, image: chat.image });
        }
    };

    // Filter chats based on Tab
    const filteredChats = chats.filter(chat =>
        tabValue === 0 ? chat.type === 'private' : chat.type === 'group'
    );

    const listContent = (
        <Box sx={{ width: '100%', bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* TABS HEADER */}
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
                                                color={chat.unreadCount > 0 ? "text.primary" : "text.secondary"}
                                                fontWeight={chat.unreadCount > 0 ? "bold" : "normal"}
                                                noWrap
                                                sx={{ display: 'block', maxWidth: '90%' }}
                                            >
                                                {chat.lastMessage ? chat.lastMessage.text : "התחל שיחה חדשה"}
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