"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ContentCopyRounded from "@mui/icons-material/ContentCopyRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import ShareRounded from "@mui/icons-material/ShareRounded";

export interface JoinCodeBoxProps {
    code: string;
    /** Full link built by the container (origin + path). */
    link: string;
    /** Registration closed: show a note and hide the actions. */
    closed?: boolean;
    busy?: boolean;
    /** Container shows the "הקישור הועתק" Snackbar. */
    onCopy: () => void;
    onShare: () => void;
    onRotate: () => void;
}

export default function JoinCodeBox({ code, link, closed, busy, onCopy, onShare, onRotate }: JoinCodeBoxProps) {
    const [confirm, setConfirm] = useState(false);
    return (
        <Stack spacing={1} data-testid="team-join-code">
            <Typography variant="subtitle2" component="h3">קישור הצטרפות</Typography>
            {closed ? (
                <Typography variant="body2" color="text.secondary">ההרשמה נסגרה, הקישור לא פעיל</Typography>
            ) : (
                <>
                    <Box
                        dir="ltr"
                        sx={{ fontFamily: "monospace", fontSize: 20, fontWeight: 700, letterSpacing: "0.1em", p: 1.5, border: 1, borderColor: "divider", borderRadius: 2, textAlign: "center" }}
                    >
                        {code}
                    </Box>
                    <Typography variant="caption" color="text.secondary" dir="ltr" sx={{ wordBreak: "break-all", textAlign: "start" }}>{link}</Typography>
                    <Stack direction="row" spacing={1}>
                        <IconButton aria-label="העתקה" data-testid="team-join-code-copy" onClick={onCopy} sx={{ width: 44, height: 44, border: 1, borderColor: "divider" }}>
                            <ContentCopyRounded />
                        </IconButton>
                        <IconButton aria-label="שיתוף" data-testid="team-join-code-share" onClick={onShare} sx={{ width: 44, height: 44, border: 1, borderColor: "divider" }}>
                            <ShareRounded />
                        </IconButton>
                        <IconButton aria-label="קוד חדש" data-testid="team-join-code-rotate" disabled={busy} onClick={() => setConfirm(true)} sx={{ width: 44, height: 44, border: 1, borderColor: "divider" }}>
                            <RefreshRounded />
                        </IconButton>
                    </Stack>
                </>
            )}
            <Dialog open={confirm} onClose={() => setConfirm(false)} maxWidth="xs" fullWidth>
                <DialogTitle>ליצור קוד חדש?</DialogTitle>
                <DialogContent><DialogContentText>הקישור הקודם יפסיק לעבוד.</DialogContentText></DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirm(false)}>ביטול</Button>
                    <Button variant="contained" onClick={() => { setConfirm(false); onRotate(); }}>קוד חדש</Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
}
