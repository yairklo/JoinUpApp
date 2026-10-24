"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SignInButton, useAuth } from "@clerk/nextjs";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Container from "@mui/material/Container";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import MailOutlineRounded from "@mui/icons-material/MailOutlineRounded";
import { toTournamentError, tournamentErrorMessage, tournamentsApi } from "@/services/api/tournaments";
import { useMyInvites } from "@/hooks/tournaments";
import { getActionErrorMessage } from "@/utils/apiError";
import type { MyInvite } from "@/types/tournament";
import InvitesList from "./InvitesList";
import { teamErrorView } from "./teamModel";

/** `/tournaments/invites`: my pending team invites. */
export default function InvitesContainer() {
    const router = useRouter();
    const { userId, getToken, isLoaded, isSignedIn } = useAuth();
    const { invites, loading, error, reload } = useMyInvites();
    const [pending, setPending] = useState<string | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [accepted, setAccepted] = useState<Set<string>>(new Set());
    const [declined, setDeclined] = useState<Set<string>>(new Set());
    const [confirm, setConfirm] = useState<{ invite: MyInvite; siblings: MyInvite[] } | null>(null);

    const respond = async (invite: MyInvite, accept: boolean) => {
        if (!userId) return;
        setPending(invite.teamId);
        setErrors(({ [invite.teamId]: _drop, ...rest }) => rest);
        try {
            const token = await getToken();
            if (!token) throw new Error("Not signed in");
            await tournamentsApi.respondToInvite(invite.tournamentId, invite.teamId, userId, accept, token);
            if (accept) setAccepted((s) => new Set(s).add(invite.teamId));
            else setDeclined((s) => new Set(s).add(invite.teamId));
        } catch (e) {
            const err = toTournamentError(e);
            const v = teamErrorView(err.code, { self: true });
            const text = v?.kind === "message" ? v.text : v?.kind === "minors" ? "הטורניר פתוח לבני 18 ומעלה בלבד" : tournamentErrorMessage(err) ?? getActionErrorMessage(err);
            setErrors((m) => ({ ...m, [invite.teamId]: text }));
        } finally {
            setPending(null);
        }
    };

    if (!isLoaded || (loading && !invites.length)) {
        return <Container maxWidth="sm" sx={{ py: 6, textAlign: "center" }} dir="rtl"><CircularProgress aria-label="טוען" /></Container>;
    }
    if (!isSignedIn) {
        return (
            <Container maxWidth="sm" sx={{ py: 6 }} dir="rtl">
                <Box
                    sx={(theme) => ({
                        p: 4,
                        textAlign: "center",
                        borderRadius: 2.5,
                        border: "1px solid",
                        borderColor: "divider",
                        bgcolor: "background.paper",
                        boxShadow: theme.shadows[1],
                    })}
                >
                    <Typography sx={{ mb: 2, fontWeight: 600 }}>יש להתחבר כדי לראות הזמנות</Typography>
                    <SignInButton mode="modal"><Button variant="contained" sx={{ minHeight: 48, px: 3 }}>התחברות</Button></SignInButton>
                </Box>
            </Container>
        );
    }

    // Declined cards leave the list at once; siblings of an accepted invite fade out.
    const acceptedTournaments = new Set(invites.filter((i) => accepted.has(i.teamId)).map((i) => i.tournamentId));
    const shown = invites.filter((i) => !declined.has(i.teamId) && (accepted.has(i.teamId) || !acceptedTournaments.has(i.tournamentId)));

    return (
        <Container maxWidth="sm" sx={{ pt: { xs: 2.5, md: 4 }, pb: { xs: 12, md: 6 } }} dir="rtl">
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 3 }}>
                <Box
                    sx={(theme) => ({
                        width: 40,
                        height: 40,
                        borderRadius: 2,
                        display: "grid",
                        placeItems: "center",
                        bgcolor: alpha(theme.palette.primary.main, 0.12),
                        color: "primary.main",
                        flexShrink: 0,
                    })}
                >
                    <MailOutlineRounded fontSize="small" />
                </Box>
                <Typography variant="h4" component="h1" fontWeight={800} sx={{ letterSpacing: "-0.02em", fontSize: { xs: "1.5rem", md: "1.85rem" } }}>
                    ההזמנות שלי
                </Typography>
            </Stack>
            {error && (
                <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2 }} action={<Button color="inherit" size="small" onClick={() => void reload()}>ניסיון חוזר</Button>}>
                    {getActionErrorMessage(error)}
                </Alert>
            )}
            <InvitesList
                invites={shown}
                pendingTeamId={pending}
                acceptedTeamIds={accepted}
                errors={errors}
                onAccept={(invite, siblings) => (siblings.length ? setConfirm({ invite, siblings }) : void respond(invite, true))}
                onDecline={(invite) => void respond(invite, false)}
                onOpenTeam={(i) => router.push(`/tournaments/${i.tournamentId}/team/${i.teamId}`)}
            />
            <Dialog open={!!confirm} onClose={() => setConfirm(null)} maxWidth="xs" fullWidth dir="rtl">
                <DialogTitle>{`להצטרף ל${confirm?.invite.teamName ?? ""}?`}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {`ההזמנות מ-${confirm?.siblings.map((s) => s.teamName).join(", ")} יבוטלו.`}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirm(null)}>ביטול</Button>
                    <Button variant="contained" onClick={() => { const c = confirm; setConfirm(null); if (c) void respond(c.invite, true); }}>הצטרפות</Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}
