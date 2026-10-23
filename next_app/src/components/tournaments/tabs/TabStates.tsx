"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import EmojiEventsOutlined from "@mui/icons-material/EmojiEventsOutlined";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import type { ReactNode } from "react";
import type { TournamentApiError } from "@/services/api/tournaments";

/** Shared loading / error / empty blocks for the tournament tabs (F1 1.8 state matrix). */

export function TabSkeleton({ rows = 4, height = 72, testId = "tab-loading" }: { rows?: number; height?: number; testId?: string }) {
    return (
        <Stack spacing={1.5} data-testid={testId} aria-busy="true" aria-label="טוען">
            {Array.from({ length: rows }, (_, i) => (
                <Skeleton key={i} variant="rounded" height={height} sx={{ borderRadius: 2 }} />
            ))}
        </Stack>
    );
}

export function TabError({ error, onRetry, testId = "tab-error" }: { error: TournamentApiError | null; onRetry?: () => void; testId?: string }) {
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    return (
        <Alert
            severity={offline ? "warning" : "error"}
            data-testid={testId}
            sx={{ borderRadius: 2 }}
            action={onRetry ? <Button color="inherit" size="small" onClick={onRetry}>ניסיון חוזר</Button> : undefined}
        >
            {offline ? "אין חיבור לאינטרנט. הנתונים יתעדכנו כשהחיבור יחזור." : error?.status === 404 ? "הטורניר לא נמצא." : "לא הצלחנו לטעון את הנתונים."}
        </Alert>
    );
}

export function TabEmpty({ children, action, icon, testId = "tab-empty" }: { children: ReactNode; action?: ReactNode; icon?: ReactNode; testId?: string }) {
    return (
        <Stack
            alignItems="center"
            spacing={1.5}
            sx={(theme) => ({
                py: { xs: 5, md: 6 },
                px: 3,
                textAlign: "center",
                borderRadius: 3,
                border: "1px dashed",
                borderColor: "divider",
                bgcolor: alpha(theme.palette.background.paper, 0.6),
            })}
            data-testid={testId}
        >
            <Box
                aria-hidden
                sx={(theme) => ({
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    color: "primary.main",
                    bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.16 : 0.1),
                    "& svg": { fontSize: 28 },
                })}
            >
                {icon ?? <EmojiEventsOutlined />}
            </Box>
            <Typography color="text.secondary" fontWeight={500} sx={{ maxWidth: 360, lineHeight: 1.6 }}>
                {children}
            </Typography>
            {action}
        </Stack>
    );
}
