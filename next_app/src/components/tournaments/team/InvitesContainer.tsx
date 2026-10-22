"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SignInButton, useAuth } from "@clerk/nextjs";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Container from "@mui/material/Container";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
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
        return <Container maxWidth="sm" sx={{ py: 6, textAlign: "center" }}><CircularProgress aria-label="טוען" /></Container>;
    }
    if (!isSignedIn) {
        return (
            <Container maxWidth="sm" sx={{ py: 4 }}>
                <Typography sx={{ mb: 2 }}>יש להתחבר כדי לראות הזמנות</Typography>
                <SignInButton mode="modal"><Button variant="contained" sx={{ minHeight: 48 }}>התחברות</Button></SignInButton>
            </Container>
        );
    }

    // Declined cards leave the list at once; siblings of an accepted invite fade out.
    const acceptedTournaments = new Set(invites.filter((i) => accepted.has(i.teamId)).map((i) => i.tournamentId));
    const shown = invites.filter((i) => !declined.has(i.teamId) && (accepted.has(i.teamId) || !acceptedTournaments.has(i.tournamentId)));

    return (
        <Container maxWidth="sm" sx={{ py: { xs: 2, md: 4 } }}>
            <Typography variant="h5" component="h1" fontWeight={800} sx={{ mb: 2 }}>ההזמנות שלי</Typography>
            {error && (
                <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={() => void reload()}>ניסיון חוזר</Button>}>
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
            <Dialog open={!!confirm} onClose={() => setConfirm(null)} maxWidth="xs" fullWidth>
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
