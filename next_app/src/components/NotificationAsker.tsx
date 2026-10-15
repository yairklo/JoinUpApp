"use client";

import React, { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import useNotification from "@/hooks/useNotification";

import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Fab from "@mui/material/Fab";
import Tooltip from "@mui/material/Tooltip";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import IosShareIcon from "@mui/icons-material/IosShare";

const IOS_HINT_DISMISSED_KEY = "joinup:iosPushHintDismissed";

export default function NotificationAsker() {
    const { user } = useUser();
    const { fcmToken, requestPermission, notification, pushSupport, iosInAppBrowser } = useNotification();
    const [showToast, setShowToast] = useState(false);
    const [iosHintOpen, setIosHintOpen] = useState(false);
    const [iosHintDismissed, setIosHintDismissed] = useState(false);

    useEffect(() => {
        try {
            setIosHintDismissed(localStorage.getItem(IOS_HINT_DISMISSED_KEY) === "1");
        } catch { /* storage unavailable - keep showing the hint */ }
    }, []);

    useEffect(() => {
        if (notification?.title) {
            setShowToast(true);
        }
    }, [notification]);

    // Rendered regardless of whether a token was fetched on this load: foreground
    // messages can arrive for an existing push subscription either way.
    const toast = (
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

    if (fcmToken || !user) return toast;
    // No button where push can't work (unsupported browser, permission denied, or still checking).
    if (pushSupport !== "supported" && pushSupport !== "ios-needs-install") return toast;
    if (pushSupport === "ios-needs-install" && iosHintDismissed) return toast;

    const isIosHint = pushSupport === "ios-needs-install";

    const dismissIosHint = () => {
        setIosHintOpen(false);
        setIosHintDismissed(true);
        try {
            localStorage.setItem(IOS_HINT_DISMISSED_KEY, "1");
        } catch { /* ignore */ }
    };

    return (
        <>
        {toast}
        <Tooltip title="הפעל התראות">
            <Fab
                color="primary"
                size="medium"
                onClick={() => (isIosHint ? setIosHintOpen(true) : requestPermission())}
                aria-label="הפעל התראות"
                sx={{
                    position: "fixed",
                    // Pushed up well clear of BottomNav (64px + safe-area) *and* of
                    // page content that tends to sit just above the fold on mobile
                    // (e.g. the "מחר" date chip row on the home feed, the
                    // "הגדרות קבוצה" button on a game details page) — both were
                    // getting covered by this floating button at the previous
                    // 80px offset. 112px keeps a solid ~48px buffer above the
                    // bottom nav while clearing that content band.
                    bottom: {
                        xs: "calc(112px + env(safe-area-inset-bottom))",
                        md: 24,
                    },
                    // Keep clear of the centered search map/list toggle on mobile
                    insetInlineStart: { xs: 16, md: 20 },
                    zIndex: 1200,
                    boxShadow: "0 8px 20px rgba(5,150,105,0.4)",
                    width: 48,
                    height: 48,
                    minWidth: 48,
                }}
            >
                <NotificationsActiveOutlinedIcon fontSize="small" />
            </Fab>
        </Tooltip>
        {isIosHint && (
            <Dialog open={iosHintOpen} onClose={() => setIosHintOpen(false)} dir="rtl">
                <DialogTitle sx={{ fontWeight: 700 }}>התראות באייפון</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 1.5 }}>
                        באייפון אפשר לקבל התראות רק מהאפליקציה שמותקנת במסך הבית (iOS 16.4 ומעלה):
                    </Typography>
                    <Typography component="ol" variant="body2" sx={{ m: 0, ps: 2.5 }}>
                        {iosInAppBrowser && (
                            <li>פתחו את הדף בספארי (בתפריט ⋯ של האפליקציה: &quot;פתיחה בספארי&quot;)</li>
                        )}
                        <li>
                            לחצו על כפתור השיתוף <IosShareIcon fontSize="inherit" sx={{ verticalAlign: "middle" }} /> בספארי
                        </li>
                        <li>בחרו &quot;הוספה למסך הבית&quot;</li>
                        <li>פתחו את joinUp ממסך הבית והפעילו שם התראות</li>
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={dismissIosHint} color="inherit">אל תציג שוב</Button>
                    <Button onClick={() => setIosHintOpen(false)} variant="contained">הבנתי</Button>
                </DialogActions>
            </Dialog>
        )}
        </>
    );
}
