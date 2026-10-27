"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useMediaQuery, useTheme } from "@mui/material";
import ButtonBase from "@mui/material/ButtonBase";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import Typography from "@mui/material/Typography";
import PersonIcon from "@mui/icons-material/Person";
import ChatIcon from "@mui/icons-material/ChatBubbleOutline";
import Avatar from "@/components/Avatar";
import { chatsApi } from "@/services/api";
import { useChat } from "@/context/ChatContext";

/** One member in the group's members grid: opens a small menu with "open profile" and "send message". */
export default function SeriesMemberMenu({
    userId,
    name,
    avatar,
    isMe,
}: {
    userId: string;
    name: string | null;
    avatar: string | null;
    isMe: boolean;
}) {
    const { getToken } = useAuth();
    const router = useRouter();
    const { openChat } = useChat();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [error, setError] = useState<string | null>(null);
    const displayName = name || "משתמש";

    const onClick = (e: React.MouseEvent<HTMLElement>) => {
        // Own row: nothing to message, go straight to the profile.
        if (isMe) {
            router.push(`/users/${userId}`);
            return;
        }
        setAnchor(e.currentTarget);
    };

    const message = async () => {
        setAnchor(null);
        try {
            const token = await getToken();
            if (!token) return;
            const { chatId } = await chatsApi.createPrivate(userId, token);
            if (isMobile) {
                router.push(`/chat/${chatId}`);
            } else {
                openChat(chatId, { name: displayName, image: avatar });
            }
        } catch (e: any) {
            const status = e?.status || e?.response?.status;
            setError(status === 403 ? "משתמש זה מקבל הודעות מחברים בלבד" : "פתיחת הצ'אט נכשלה");
        }
    };

    return (
        <>
            <ButtonBase
                onClick={onClick}
                aria-haspopup={isMe ? undefined : "menu"}
                aria-expanded={anchor ? true : undefined}
                aria-label={isMe ? `פתח את הפרופיל שלי` : `פעולות עבור ${displayName}`}
                sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 1, width: "100%", justifyContent: "flex-start", textAlign: "start", borderRadius: 2, "&:hover": { bgcolor: "action.hover" } }}
            >
                <Avatar src={avatar} name={displayName} alt={displayName} size="md" />
                <Typography variant="body2" fontWeight={500} noWrap>
                    {displayName}
                </Typography>
            </ButtonBase>
            <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
                <MenuItem component="a" href={`/users/${userId}`} onClick={() => setAnchor(null)}>
                    <ListItemIcon><PersonIcon fontSize="small" /></ListItemIcon>
                    פתח פרופיל
                </MenuItem>
                <MenuItem onClick={message}>
                    <ListItemIcon><ChatIcon fontSize="small" /></ListItemIcon>
                    שלח הודעה
                </MenuItem>
            </Menu>
            <Snackbar open={!!error} autoHideDuration={4000} onClose={() => setError(null)}>
                <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
            </Snackbar>
        </>
    );
}
