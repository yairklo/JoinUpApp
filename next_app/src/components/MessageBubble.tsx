"use client";

import { useState } from "react";
import {
    Box,
    Paper,
    Typography,
    Avatar,
    IconButton,
    Menu,
    Stack
} from "@mui/material";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import ReplyIcon from "@mui/icons-material/Reply";
import AddReactionIcon from "@mui/icons-material/AddReaction";
import { ChatMessage } from "./types";

interface MessageBubbleProps {
    message: ChatMessage;
    isMine: boolean;
    isRTL: boolean;
    onReply: (message: ChatMessage) => void;
    onReact: (messageId: string | number, emoji: string) => void;
    avatarUrl?: string | null;
    displayName: string;
    timeStr: string;
}

const COMMON_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export default function MessageBubble({
    message,
    isMine,
    isRTL,
    onReply,
    onReact,
    avatarUrl,
    displayName,
    timeStr
}: MessageBubbleProps) {
    const [hover, setHover] = useState(false);
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

    const handleReactionClick = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const handleSelectEmoji = (emoji: string) => {
        onReact(message.id, emoji);
        handleClose();
    };

    const quoteBorderSide = isRTL ? "borderRight" : "borderLeft";

    return (
        <Box
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            sx={{
                display: "flex",
                flexDirection: isMine ? "row-reverse" : "row",
                alignItems: "flex-end",
                gap: 1,
                maxWidth: "100%",
                alignSelf: isMine ? "flex-end" : "flex-start",
                position: "relative",
                mb: 2
            }}
        >
            <Avatar
                src={avatarUrl || undefined}
                alt={displayName}
                sx={{ width: 32, height: 32, bgcolor: isMine ? "primary.dark" : "secondary.main" }}
            >
                {!avatarUrl && <SmartToyIcon fontSize="small" />}
            </Avatar>

            <Box sx={{ display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start", maxWidth: "70%" }}>
                <Typography variant="caption" sx={{ ml: 1, mr: 1, color: "text.secondary", fontSize: "0.7rem" }}>
                    {displayName} • {timeStr}
                </Typography>

                <Paper
                    elevation={1}
                    sx={{
                        p: 1.5,
                        borderRadius: 2,
                        borderBottomRightRadius: isMine ? (isRTL ? 2 : 0) : (isRTL ? 0 : 2),
                        borderBottomLeftRadius: isMine ? (isRTL ? 0 : 2) : (isRTL ? 2 : 0),
                        bgcolor: isMine ? "primary.main" : "background.paper",
                        color: isMine ? "primary.contrastText" : "text.primary",
                        position: "relative",
                        minWidth: "120px"
                    }}
                >
                    {message.replyTo && (
                        <Box
                            sx={{
                                bgcolor: "rgba(0,0,0,0.1)",
                                p: 0.5,
                                mb: 1,
                                borderRadius: 1,
                                [quoteBorderSide]: "4px solid",
                                borderColor: "secondary.main",
                                fontSize: "0.8rem"
                            }}
                        >
                            <Typography variant="caption" fontWeight="bold" display="block">
                                {message.replyTo.senderName}
                            </Typography>
                            <Typography variant="caption" noWrap sx={{ display: "block", maxWidth: 150 }}>
                                {message.replyTo.text}
                            </Typography>
                        </Box>
                    )}

                    <Typography variant="body2" dir="auto" sx={{ textAlign: isRTL ? "right" : "left" }}>
                        {message.text}
                    </Typography>

                    {message.reactions && Object.keys(message.reactions).length > 0 && (
                        <Box
                            sx={{
                                position: "absolute",
                                bottom: -15,
                                [isMine ? (isRTL ? "left" : "right") : (isRTL ? "right" : "left")]: 0,
                                display: "flex",
                                gap: 0.5,
                                bgcolor: "background.paper",
                                boxShadow: 1,
                                borderRadius: 10,
                                px: 0.5,
                                py: 0.2,
                                zIndex: 10
                            }}
                        >
                            {Object.values(message.reactions).map((r, idx) => (
                                <Typography key={idx} variant="caption" sx={{ fontSize: "0.8rem", color: "text.primary" }}>
                                    {r.emoji}{r.count > 1 ? r.count : ""}
                                </Typography>
                            ))}
                        </Box>
                    )}
                </Paper>
            </Box>

            <Stack
                direction={isRTL ? "row-reverse" : "row"}
                spacing={0}
                sx={{
                    opacity: hover ? 1 : 0,
                    transition: "opacity 0.2s",
                    alignSelf: "center"
                }}
            >
                <IconButton size="small" onClick={() => onReply(message)}>
                    <ReplyIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" onClick={handleReactionClick}>
                    <AddReactionIcon fontSize="small" />
                </IconButton>
            </Stack>

            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleClose}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
                transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Box sx={{ p: 1, display: "flex", gap: 1 }}>
                    {COMMON_REACTIONS.map(emoji => (
                        <IconButton key={emoji} onClick={() => handleSelectEmoji(emoji)} size="small">
                            {emoji}
                        </IconButton>
                    ))}
                </Box>
            </Menu>
        </Box>
    );
}