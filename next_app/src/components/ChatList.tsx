"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useChat, ChatPreview } from "@/context/ChatContext";
import React, { useState, useEffect, useRef } from "react";
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

interface ChatListProps {
    userId: string;
    onChatSelect: (chatId: string) => void;
    isWidget?: boolean;
}

export default function ChatList({ userId, onChatSelect, isWidget = false }: ChatListProps) {
    const [typingStatus, setTypingStatus] = useState<Record<string, string>>({}); // Mapping: chatId -> "John is typing..."
    const [tabValue, setTabValue] = useState(0);

    const { getToken } = useAuth();
    const router = useRouter();
    const {
        openChat, isWidgetOpen, closeChat, openWidget,
        chats, loadingChats, totalUnread, loadChats, updateChatList, markChatAsRead, loadMessages
    } = useChat();

    const [socketInstance, setSocketInstance] = useState<any>(null);

    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

    // To debounce prefetch
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Initial Fetch via Context
    useEffect(() => {
        loadChats();
    }, [loadChats]);

    // Socket Initialization for List Updates (Message Received -> Reorder)
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
                    setSocketInstance(socket);
                });

                // Socket Event Handlers
                const handleTyping = ({ chatId, userName }: { chatId: string, userName: string }) => {
                    if (!chatId || !userName) return;
                    setTypingStatus(prev => ({ ...prev, [chatId]: `${userName} is typing...` }));
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
                    // Delegate update to context
                    updateChatList(newMessage);
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
    }, [userId, getToken, updateChatList]);

    // Join rooms when socket AND chats are ready
    useEffect(() => {
        if (socketInstance && chats.length > 0) {
            const chatIds = chats.map(c => c.id);
            socketInstance.emit('joinChats', chatIds);
        }
    }, [socketInstance, chats.map(c => c.id).join(",")]); // Compare IDs

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
        markChatAsRead(chat.id);

        if (chat.type === 'group' || isMobile) {
            const route = chat.type === 'group' ? `/games/${chat.id}` : `/chat/${chat.id}`;
            router.push(route);
        } else {
            openChat(chat.id, { name: chat.name, image: chat.image });
        }
    };

    // Prefetch on Hover (> 200ms)
    const handleMouseEnter = (chatId: string) => {
        hoverTimeoutRef.current = setTimeout(() => {
            loadMessages(chatId);
        }, 200);
    };

    const handleMouseLeave = () => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
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
                {loadingChats && chats.length === 0 ? (
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
                                <ListItemButton
                                    onClick={() => handleSelect(chat)}
                                    onMouseEnter={() => handleMouseEnter(chat.id)}
                                    onMouseLeave={handleMouseLeave}
                                    alignItems="flex-start"
                                >
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