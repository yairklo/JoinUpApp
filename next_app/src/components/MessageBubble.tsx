"use client";

import { useState } from "react";
import {
    Box,
    Paper,
    Typography,
    Avatar,
    IconButton,
    Menu,
    MenuItem,
    Stack,
    ListItemIcon,
    ListItemText
} from "@mui/material";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import ReplyIcon from "@mui/icons-material/Reply";
import AddReactionIcon from "@mui/icons-material/AddReaction";
import DoneIcon from "@mui/icons-material/Done";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import BlockIcon from "@mui/icons-material/Block";

import { ChatMessage } from "./types";

interface MessageBubbleProps {
    message: ChatMessage;
    isMine: boolean;
    isRTL: boolean;
    onReply: (message: ChatMessage) => void;
    onReact: (messageId: string | number, emoji: string) => void;
    onEdit: (message: ChatMessage) => void;
    onDelete: (messageId: string | number) => void;
    avatarUrl?: string | null;
    displayName: string;
    timeStr: string;
    showAvatar: boolean;
    showName: boolean;
    isFirstInGroup: boolean;
    isLastInGroup: boolean;
    currentUserId?: string | null;
}

const COMMON_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export default function MessageBubble({
    message, isMine, isRTL, onReply, onReact, onEdit, onDelete, avatarUrl, displayName, timeStr,
    showAvatar, showName, isFirstInGroup, isLastInGroup, currentUserId
}: MessageBubbleProps) {

    const [hover, setHover] = useState(false);
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);

    const handleReactionClick = (event: React.MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget);
    const handleClose = () => setAnchorEl(null);
    const handleSelectEmoji = (emoji: string) => { onReact(message.id, emoji); handleClose(); };

    const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => setMenuAnchorEl(event.currentTarget);
    const handleMenuClose = () => setMenuAnchorEl(null);

    const handleEdit = () => {
        onEdit(message);
        handleMenuClose();
    };

    const handleDelete = () => {
        if (confirm("Are you sure you want to delete this message?")) {
            onDelete(message.id);
        }
        handleMenuClose();
    };

    const quoteBorderSide = isRTL ? "borderRight" : "borderLeft";
    const radiusTop = isFirstInGroup ? 2 : 0.5;
    const sharpCorner = isLastInGroup ? 0 : 0.5;

    const renderStatusIcon = () => {
        if (!isMine || message.isDeleted) return null;
        const status = message.status || "sent";
        const iconSize = { fontSize: 14 };
        if (status === "read") return <DoneAllIcon sx={{ ...iconSize, color: "#4fc3f7" }} />;
        if (status === "delivered") return <DoneAllIcon sx={{ ...iconSize, color: "text.secondary" }} />;
        return <DoneIcon sx={{ ...iconSize, color: "text.secondary" }} />;
    };

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
                mb: isLastInGroup ? 2 : 0.5
            }}
        >
            <Box sx={{ width: 32, display: "flex", alignItems: "flex-end" }}>
                {showAvatar && (
                    <Avatar
                        src={avatarUrl || undefined}
                        alt={displayName}
                        sx={{ width: 32, height: 32, bgcolor: isMine ? "primary.dark" : "secondary.main" }}
                    >
                        {!avatarUrl && <SmartToyIcon fontSize="small" />}
                    </Avatar>
                )}
            </Box>

            <Box sx={{ display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start", maxWidth: "70%" }}>
                {showName && (
                    <Typography variant="caption" sx={{ ml: 1, mr: 1, color: "text.secondary", fontSize: "0.7rem", mb: 0.2 }}>
                        {displayName} • {timeStr}
                    </Typography>
                )}

                <Paper
                    elevation={isLastInGroup ? 1 : 0}
                    variant={isLastInGroup ? "elevation" : "outlined"}
                    sx={{
                        p: 1.5,
                        bgcolor: message.isDeleted
                            ? (isMine ? "primary.light" : "action.hover")
                            : (isMine ? "primary.main" : "background.paper"),
                        color: message.isDeleted
                            ? "text.disabled"
                            : (isMine ? "primary.contrastText" : "text.primary"),
                        position: "relative",
                        minWidth: "120px",
                        borderRadius: 2,
                        borderTopRightRadius: isMine ? radiusTop : 2,
                        borderTopLeftRadius: isMine ? 2 : radiusTop,
                        borderBottomRightRadius: isMine ? (isRTL ? 2 : sharpCorner) : (isRTL ? sharpCorner : 2),
                        borderBottomLeftRadius: isMine ? (isRTL ? sharpCorner : 2) : (isRTL ? 2 : sharpCorner),
                        fontStyle: message.isDeleted ? "italic" : "normal"
                    }}
                >
                    {message.isDeleted ? (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <BlockIcon fontSize="small" sx={{ fontSize: 16 }} />
                            <Typography variant="body2">{isRTL ? "הודעה זו נמחקה" : "This message was deleted"}</Typography>
                        </Box>
                    ) : (
                        <>
                            {message.replyTo && (
                                <Box
                                    sx={{
                                        bgcolor: isMine ? "rgba(0, 0, 0, 0.2)" : "action.hover",
                                        p: 1, mb: 1, borderRadius: 1, [quoteBorderSide]: "4px solid",
                                        borderColor: isMine ? "rgba(255,255,255,0.7)" : "primary.main",
                                        fontSize: "0.85rem"
                                    }}
                                >
                                    <Typography variant="caption" fontWeight="bold" display="block" sx={{ color: isMine ? "inherit" : "primary.main" }}>
                                        {message.replyTo.senderName}
                                    </Typography>
                                    <Typography variant="caption" noWrap sx={{ display: "block", maxWidth: 150, opacity: 0.9 }}>
                                        {message.replyTo.text}
                                    </Typography>
                                </Box>
                            )}

                            <Typography variant="body2" dir="auto" sx={{ textAlign: isRTL ? "right" : "left", lineHeight: 1.4 }}>
                                {message.text}
                            </Typography>

                            {message.isEdited && (
                                <Typography component="span" variant="caption" sx={{ fontSize: "0.65rem", opacity: 0.7, ml: 1 }}>
                                    {isRTL ? "(נערך)" : "(edited)"}
                                </Typography>
                            )}
                        </>
                    )}

                    {!message.isDeleted && (
                        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", mt: 0.5, gap: 0.5, opacity: 0.8 }}>
                            {renderStatusIcon()}
                        </Box>
                    )}

                    {!message.isDeleted && message.reactions && Object.keys(message.reactions).length > 0 && (
                        <Box sx={{
                            position: "absolute", bottom: -12,
                            [isMine ? (isRTL ? "left" : "right") : (isRTL ? "right" : "left")]: 0,
                            display: "flex", gap: 0.5, bgcolor: "background.paper", boxShadow: 1, borderRadius: 10, px: 0.5, py: 0.2, zIndex: 10
                        }}>
                            {Object.values(message.reactions).map((r, idx) => {
                                const iReacted = currentUserId ? r.userIds.includes(currentUserId) : false;
                                return (
                                    <Box key={idx} onClick={(e) => { e.stopPropagation(); onReact(message.id, r.emoji); }}
                                        sx={{ cursor: "pointer", fontSize: "0.85rem", color: "text.primary", px: 0.5, borderRadius: 4, bgcolor: iReacted ? "action.selected" : "transparent", "&:hover": { bgcolor: "action.hover" } }}
                                    >
                                        {r.emoji} {r.count > 1 ? <span style={{ fontSize: '0.7em', fontWeight: 'bold' }}>{r.count}</span> : ""}
                                    </Box>
                                );
                            })}
                        </Box>
                    )}
                </Paper>
            </Box>

            {!message.isDeleted && (
                <Stack direction={isRTL ? "row-reverse" : "row"} spacing={0} sx={{ opacity: hover || menuAnchorEl ? 1 : 0, transition: "opacity 0.2s", alignSelf: "center" }}>
                    <IconButton size="small" onClick={() => onReply(message)}><ReplyIcon fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={handleReactionClick}><AddReactionIcon fontSize="small" /></IconButton>
                    {isMine && (
                        <IconButton size="small" onClick={handleMenuOpen}><MoreVertIcon fontSize="small" /></IconButton>
                    )}
                </Stack>
            )}

            <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose} anchorOrigin={{ vertical: 'top', horizontal: 'center' }} transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
                <Box sx={{ p: 1, display: "flex", gap: 1 }}>
                    {COMMON_REACTIONS.map(emoji => (
                        <IconButton key={emoji} onClick={() => handleSelectEmoji(emoji)} size="small">{emoji}</IconButton>
                    ))}
                </Box>
            </Menu>

            <Menu
                anchorEl={menuAnchorEl}
                open={Boolean(menuAnchorEl)}
                onClose={handleMenuClose}
                sx={{ zIndex: 2101 }} // Ensure it's above FloatingChat (2000)
            >
                <MenuItem onClick={handleEdit}>
                    <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>{isRTL ? "ערוך" : "Edit"}</ListItemText>
                </MenuItem>
                <MenuItem onClick={handleDelete}>
                    <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
                    <ListItemText sx={{ color: "error.main" }}>{isRTL ? "מחק" : "Delete"}</ListItemText>
                </MenuItem>
            </Menu>
        </Box>
    );
}