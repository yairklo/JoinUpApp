"use client";

import type { ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import MinorsCard from "./MinorsCard";
import { normalizeJoinCode } from "./teamModel";

export interface JoinPanelProps {
    tournamentTitle: string;
    /** Pre-formatted date line. */
    dateLabel?: string;
    sportLabel?: string;
    /** Current code (from the URL, or typed when `editableCode`). */
    code: string;
    /** Manual entry for codes shared verbally (spec 5.2). */
    editableCode?: boolean;
    onCodeChange?: (code: string) => void;
    joining?: boolean;
    /** Plain-language error (INVALID_CODE etc.). */
    error?: string | null;
    /** MINORS_NOT_ALLOWED: replaces the actions with the minors card. */
    minors?: boolean;
    /** The user already has a team here: shows "לקבוצה שלי". */
    hasTeam?: boolean;
    signedIn: boolean;
    /** Rendered instead of the primary button when signed out (wraps SignInButton). */
    signInSlot?: ReactNode;
    onJoin: () => void;
    onDismiss: () => void;
    onOpenMyTeam?: () => void;
}

export default function JoinPanel(p: JoinPanelProps) {
    return (
        <Paper variant="outlined" data-testid="join-sheet" sx={{ p: 3, borderRadius: 3 }}>
            <Stack spacing={2}>
                <Stack spacing={0.5}>
                    <Typography variant="h6" component="h1" fontWeight={800}>{p.tournamentTitle}</Typography>
                    <Typography variant="body2" color="text.secondary">{[p.sportLabel, p.dateLabel].filter(Boolean).join(" · ")}</Typography>
                </Stack>
                <Typography>הוזמנת להצטרף לקבוצה בטורניר הזה</Typography>

                {p.editableCode && (
                    <TextField
                        label="קוד הצטרפות"
                        value={p.code}
                        onChange={(e) => p.onCodeChange?.(normalizeJoinCode(e.target.value))}
                        slotProps={{
                            htmlInput: { maxLength: 6, autoCapitalize: "characters", dir: "ltr", "data-testid": "join-code-input", style: { fontFamily: "monospace", letterSpacing: "0.1em", textTransform: "uppercase" } },
                        }}
                        fullWidth
                    />
                )}

                {p.minors ? (
                    <MinorsCard />
                ) : p.hasTeam ? (
                    <>
                        <Alert severity="info">כבר יש לך קבוצה בטורניר הזה</Alert>
                        <Button variant="contained" onClick={p.onOpenMyTeam} sx={{ minHeight: 48 }}>לקבוצה שלי</Button>
                    </>
                ) : (
                    <>
                        {p.error && <Alert severity="error" data-testid="join-error">{p.error}</Alert>}
                        <Stack direction="row" spacing={1}>
                            {p.signedIn ? (
                                <Button
                                    variant="contained"
                                    data-testid="join-submit"
                                    disabled={p.joining || p.code.length < 1}
                                    onClick={p.onJoin}
                                    startIcon={p.joining ? <CircularProgress size={16} color="inherit" /> : undefined}
                                    sx={{ minHeight: 48, flex: 1 }}
                                >
                                    הצטרפות לקבוצה
                                </Button>
                            ) : (
                                p.signInSlot
                            )}
                            <Button onClick={p.onDismiss} disabled={p.joining} sx={{ minHeight: 48 }}>לא עכשיו</Button>
                        </Stack>
                    </>
                )}
            </Stack>
        </Paper>
    );
}
