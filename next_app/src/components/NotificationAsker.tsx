"use client";

import React, { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import useNotification from "@/hooks/useNotification";

import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Fab from "@mui/material/Fab";
import Tooltip from "@mui/material/Tooltip";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";

export default function NotificationAsker() {
    const { user } = useUser();
    const { fcmToken, requestPermission, notification } = useNotification();
    const [showToast, setShowToast] = useState(false);

    useEffect(() => {
        if (notification?.title) {
            setShowToast(true);
        }
    }, [notification]);

    if (fcmToken) {
        return (
            <Snackbar
                open={showToast}
                autoHideDuration={5000}
                onClose={() => setShowToast(false)}
                anchorOrigin={{ vertical: "top", horizontal: "center" }}
                sx={{ top: { xs: 64, sm: 24 } }}
            >
                <Alert
                    onClose={() => setShowToast(false)}
                    severity="info"
                    variant="filled"
                    icon={<NotificationsActiveOutlinedIcon fontSize="small" />}
                    sx={{ borderRadius: 3, boxShadow: 4, width: "100%" }}
                >
                    <AlertTitle sx={{ fontWeight: 700, mb: 0.25 }}>{notification?.title}</AlertTitle>
                    {notification?.body}
                </Alert>
            </Snackbar>
        );
    }

    if (!user) return null;

    return (
        <Tooltip title="הפעל התראות">
            <Fab
                color="primary"
                size="medium"
                onClick={() => requestPermission()}
                aria-label="הפעל התראות"
                sx={{
                    position: "fixed",
                    bottom: {
                        xs: "calc(80px + env(safe-area-inset-bottom))",
                        md: 24,
                    },
                    // Keep clear of the centered search map/list toggle on mobile
                    insetInlineStart: { xs: 16, md: 20 },
                    zIndex: 1200,
                    boxShadow: "0 8px 20px rgba(5,150,105,0.4)",
                    width: { xs: 48, md: "auto" },
                    height: { xs: 48, md: 48 },
                }}
            >
                <NotificationsActiveOutlinedIcon fontSize="small" />
            </Fab>
        </Tooltip>
    );
}
