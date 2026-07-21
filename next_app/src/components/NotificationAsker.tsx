"use client";

import React, { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import useNotification from "@/hooks/useNotification";

import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Fab from "@mui/material/Fab";
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
        // Notifications enabled – surface incoming foreground messages
        return (
            <Snackbar
                open={showToast}
                autoHideDuration={5000}
                onClose={() => setShowToast(false)}
                anchorOrigin={{ vertical: "top", horizontal: "left" }}
            >
                <Alert
                    onClose={() => setShowToast(false)}
                    severity="info"
                    variant="filled"
                    icon={<NotificationsActiveOutlinedIcon fontSize="small" />}
                    sx={{ borderRadius: 3, boxShadow: 4 }}
                >
                    <AlertTitle sx={{ fontWeight: 700, mb: 0.25 }}>{notification?.title}</AlertTitle>
                    {notification?.body}
                </Alert>
            </Snackbar>
        );
    }

    if (!user) return null;

    return (
        <Fab
            variant="extended"
            color="primary"
            size="medium"
            onClick={() => requestPermission()}
            sx={{
                position: "fixed",
                bottom: { xs: "calc(76px + env(safe-area-inset-bottom))", md: 24 },
                insetInlineStart: 20,
                zIndex: 1200,
                textTransform: "none",
                fontWeight: 700,
                gap: 1,
                boxShadow: "0 8px 20px rgba(5,150,105,0.4)",
            }}
        >
            <NotificationsActiveOutlinedIcon fontSize="small" />
            הפעל התראות
        </Fab>
    );
}
