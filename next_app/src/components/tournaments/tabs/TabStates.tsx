"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import type { TournamentApiError } from "@/services/api/tournaments";

/** Shared loading / error / empty blocks for the tournament tabs (F1 1.8 state matrix). */

export function TabSkeleton({ rows = 4, height = 72, testId = "tab-loading" }: { rows?: number; height?: number; testId?: string }) {
    return (
        <Stack spacing={1.5} data-testid={testId} aria-busy="true" aria-label="טוען">
            {Array.from({ length: rows }, (_, i) => (
                <Skeleton key={i} variant="rounded" height={height} />
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
            action={onRetry ? <Button color="inherit" size="small" onClick={onRetry}>ניסיון חוזר</Button> : undefined}
        >
            {offline ? "אין חיבור לאינטרנט. הנתונים יתעדכנו כשהחיבור יחזור." : error?.status === 404 ? "הטורניר לא נמצא." : "לא הצלחנו לטעון את הנתונים."}
        </Alert>
    );
}

export function TabEmpty({ children, action, testId = "tab-empty" }: { children: ReactNode; action?: ReactNode; testId?: string }) {
    return (
        <Stack alignItems="center" spacing={1.5} sx={{ py: 6, px: 2, textAlign: "center" }} data-testid={testId}>
            <Typography color="text.secondary">{children}</Typography>
            {action}
        </Stack>
    );
}
