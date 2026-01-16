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
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {activeChatId && (
                        <IconButton onClick={(e) => { e.stopPropagation(); goBackToList(); }} size="small" sx={{ color: 'inherit' }}>
                            <ArrowForwardIcon fontSize="small" />
                        </IconButton>
                    )}
                    {activeChatId && headerInfo?.image && (
                        <Avatar src={headerInfo.image} sx={{ width: 24, height: 24 }} />
                    )}
                    <Typography variant="subtitle2" fontWeight="bold">
                        {activeChatId ? (headerInfo?.name || "Chat") : "הודעות"}
                    </Typography>
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
