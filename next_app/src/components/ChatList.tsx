"use client";

import React, { useState, forwardRef } from "react";
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

// Type definitions based on your API response
interface ChatPreview {
    id: string;
    type: 'group' | 'private';
    name: string;
    image: string | null;
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

// Transition animation for mobile full-screen dialog
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

    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
    const open = Boolean(anchorEl);

    const fetchChats = async () => {
        if (!userId) return;
        try {
            setLoading(true);
            const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";
            const res = await fetch(`${API_URL}/api/users/${userId}/chats`);

            if (res.ok) {
                const data = await res.json();
                setChats(data);
            }
        } catch (error) {
            console.error("Failed to load chats", error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
        setAnchorEl(event.currentTarget);
        fetchChats(); // Refresh list on open to get latest messages
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const handleSelect = (chatId: string) => {
        onChatSelect(chatId);
        handleClose();
    };

    // Shared content list for both Mobile and Desktop views
    const listContent = (
        <List sx={{ width: '100%', bgcolor: 'background.paper', p: 0 }}>
            {loading ? (
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
                                    <Avatar src={chat.image || undefined} alt={chat.name}>
                                        {chat.name.charAt(0)}
                                    </Avatar>
                                </ListItemAvatar>
                                <ListItemText
                                    primary={
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <Typography variant="subtitle2" fontWeight="bold" noWrap sx={{ maxWidth: '70%' }}>
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
                                            color="text.secondary"
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
            {/* Toggle Button */}
            <IconButton color="inherit" onClick={handleOpen}>
                <Badge badgeContent={0} color="error">
                    <ChatIcon />
                </Badge>
            </IconButton>

            {isMobile ? (
                // Mobile View: Full Screen Dialog
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
                // Desktop View: Popover
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