"use client";

import { useAuth } from "@clerk/nextjs";

import React, { useState, useEffect, forwardRef } from "react";
import {
    Box,
    List,
    ListItem,
    ListItemButton,
    ListItemAvatar,
    ListItemText,
    Avatar,
    Typography,
    Popover,
    Dialog,
    AppBar,
    Toolbar,
    IconButton,
    Slide,
    useMediaQuery,
    useTheme,
    Badge,
    CircularProgress
} from "@mui/material";
import ChatIcon from "@mui/icons-material/Chat";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { TransitionProps } from "@mui/material/transitions";
import { formatDistanceToNow } from "date-fns";
import { io } from "socket.io-client"; // Import socket

// Updated Interface with unreadCount
interface ChatPreview {
    id: string;
    type: 'group' | 'private';
    name: string;
    image: string | null;
    unreadCount: number; // New field
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
}

const Transition = forwardRef(function Transition(
    props: TransitionProps & { children: React.ReactElement },
    ref: React.Ref<unknown>,
) {
    return <Slide direction="up" ref={ref} {...props} />;
});

export default function ChatList({ userId, onChatSelect }: ChatListProps) {
    const [chats, setChats] = useState<ChatPreview[]>([]);
    const [loading, setLoading] = useState(false);
    const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
    const { getToken } = useAuth();

    // State for total unread badge
    const [totalUnread, setTotalUnread] = useState(0);

    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
    const open = Boolean(anchorEl);

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

    // Socket Listener for Notifications
    useEffect(() => {
        if (!userId) return;

        const API_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "";
        const socket = io(API_URL, { path: "/api/socket", transports: ["websocket"], withCredentials: true });

        socket.on("connect", () => {
            // Register this user to their personal notification room
            socket.emit("setup", { id: userId });
        });

        socket.on("notification", (payload) => {
            // When a new message notification arrives
            if (payload.type === 'message') {
                setTotalUnread((prev) => prev + 1);

                // Optionally: You could also refetch the full chat list here 
                // to update the specific chat's last message text
                // fetchChats(); 
            }
        });

        return () => {
            socket.disconnect();
        };
    }, [userId]);

    // Load chats on mount to get initial badge count
    useEffect(() => {
        fetchChats();
    }, [userId]);

    const handleOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
        setAnchorEl(event.currentTarget);
        fetchChats();
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const handleSelect = (chatId: string) => {
        // Optimistic update: decrease unread count when opening a chat
        // (Actual server update happens inside the Chat component via markAsRead)
        const chat = chats.find(c => c.id === chatId);
        if (chat && chat.unreadCount > 0) {
            setTotalUnread(prev => Math.max(0, prev - chat.unreadCount));
        }

        onChatSelect(chatId);
        handleClose();
    };

    const listContent = (
        <List sx={{ width: '100%', bgcolor: 'background.paper', p: 0 }}>
            {loading && chats.length === 0 ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                    <CircularProgress />
                </Box>
            ) : chats.length === 0 ? (
                <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
                    <Typography>No active chats</Typography>
                </Box>
            ) : (
                chats.map((chat) => {
                    const timeDisplay = chat.lastMessage
                        ? formatDistanceToNow(new Date(chat.lastMessage.createdAt), { addSuffix: true })
                        : "";

                    return (
                        <ListItem key={chat.id} disablePadding divider>
                            <ListItemButton onClick={() => handleSelect(chat.id)} alignItems="flex-start">
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
                                            {chat.lastMessage ? chat.lastMessage.text : "Start a new conversation"}
                                        </Typography>
                                    }
                                />
                            </ListItemButton>
                        </ListItem>
                    );
                })
            )}
        </List>
    );

    return (
        <>
            <IconButton color="inherit" onClick={handleOpen}>
                <Badge badgeContent={totalUnread} color="error">
                    <ChatIcon />
                </Badge>
            </IconButton>

            {isMobile ? (
                <Dialog
                    fullScreen
                    open={open}
                    onClose={handleClose}
                    TransitionComponent={Transition}
                >
                    <AppBar sx={{ position: 'relative' }}>
                        <Toolbar>
                            <IconButton edge="start" color="inherit" onClick={handleClose} aria-label="close">
                                <ArrowBackIcon />
                            </IconButton>
                            <Typography sx={{ ml: 2, flex: 1 }} variant="h6" component="div">
                                My Chats
                            </Typography>
                        </Toolbar>
                    </AppBar>
                    {listContent}
                </Dialog>
            ) : (
                <Popover
                    open={open}
                    anchorEl={anchorEl}
                    onClose={handleClose}
                    anchorOrigin={{
                        vertical: 'bottom',
                        horizontal: 'center',
                    }}
                    transformOrigin={{
                        vertical: 'top',
                        horizontal: 'center',
                    }}
                    PaperProps={{
                        sx: { width: 360, maxHeight: 500, display: 'flex', flexDirection: 'column' }
                    }}
                >
                    <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', bgcolor: 'primary.main', color: 'primary.contrastText' }}>
                        <Typography variant="h6">My Chats</Typography>
                    </Box>
                    <Box sx={{ overflowY: 'auto', flex: 1 }}>
                        {listContent}
                    </Box>
                </Popover>
            )}
        </>
    );
}