"use client";

import React, { useEffect, useState } from "react";
import { Paper, Box, Typography, IconButton, Collapse, useTheme, useMediaQuery } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import RemoveIcon from "@mui/icons-material/Remove";
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import Chat from "./Chat";
import { useChat } from "@/context/ChatContext";
import { useAuth } from "@clerk/nextjs";

export default function FloatingChatWindow() {
    const { activeChatId, isMinimized, closeChat, minimizeChat, maximizeChat } = useChat();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
    const { getToken } = useAuth();
    const [chatName, setChatName] = useState("Chat");

    // Fetch chat name if available (optional enhancement)
    useEffect(() => {
        if (!activeChatId) return;
        // We could fetch chat details here to set the title, 
        // but for now we'll just show the ID or a generic title.
        // If you want to show the name, you'd need an API call or context data.
        setChatName("Chat");
    }, [activeChatId]);

    if (!activeChatId) return null;

    return (
        <Paper
            elevation={6}
            sx={{
                position: "fixed",
                bottom: 0,
                zIndex: 1300,
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
                <Typography variant="subtitle2" fontWeight="bold">
                    {/* Future: Display actual Chat Name */}
                    {chatName}
                </Typography>
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
                    <Chat roomId={activeChatId} isWidget={true} />
                </Box>
            </Collapse>
        </Paper>
    );
}
