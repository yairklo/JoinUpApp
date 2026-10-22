"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignInButton, useAuth } from "@clerk/nextjs";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Container from "@mui/material/Container";
import Snackbar from "@mui/material/Snackbar";
import Typography from "@mui/material/Typography";
import { tournamentErrorMessage } from "@/services/api/tournaments";
import { useTeamMutations, useTournament } from "@/hooks/tournaments";
import { getActionErrorMessage } from "@/utils/apiError";
import TeamCreateForm from "./TeamCreateForm";
import { createResultMessage, teamErrorView } from "./teamModel";

/** `/tournaments/[id]/team/new`. */
export default function TeamCreateContainer({ tournamentId }: { tournamentId: string }) {
    const router = useRouter();
    const { isLoaded, isSignedIn } = useAuth();
    const t = useTournament(tournamentId, { live: false });
    const mut = useTeamMutations(tournamentId);
    const [snack, setSnack] = useState<string | null>(null);

    if (!isLoaded || (t.loading && !t.tournament)) {
        return <Container maxWidth="sm" sx={{ py: 6, textAlign: "center" }}><CircularProgress aria-label="טוען" /></Container>;
    }
    const d = t.tournament;
    if (!d) return <Container maxWidth="sm" sx={{ py: 4 }}><Alert severity="error">הטורניר לא נמצא</Alert></Container>;

    if (!isSignedIn) {
        return (
            <Container maxWidth="sm" sx={{ py: 4 }}>
                <Typography sx={{ mb: 2 }}>יש להתחבר כדי לרשום קבוצה</Typography>
                <SignInButton mode="modal"><Button variant="contained" sx={{ minHeight: 48 }}>התחברות להרשמה</Button></SignInButton>
            </Container>
        );
    }
    if (d.myTeam) {
        return (
            <Container maxWidth="sm" sx={{ py: 4 }}>
                <Alert severity="info" action={<Button component={Link} href={`/tournaments/${d.id}/team/${d.myTeam.id}`} color="inherit" size="small">לקבוצה שלי</Button>}>
                    כבר יש לך קבוצה בטורניר הזה
                </Alert>
            </Container>
        );
    }

    const view = teamErrorView(mut.errorCode, { max: d.maxPlayersPerTeam, self: true });
    const nameTaken = mut.errorCode === "NAME_TAKEN";
    const minors = view?.kind === "minors";
    const message = !mut.error || nameTaken || minors ? null : view?.kind === "message" ? view.text : tournamentErrorMessage(mut.error) ?? getActionErrorMessage(mut.error);
    const closed = !d.capabilities.canRegisterTeam && !mut.error;

    return (
        <Container maxWidth="sm" sx={{ py: { xs: 2, md: 4 } }}>
            <Typography variant="h5" component="h1" fontWeight={800} sx={{ mb: 0.5 }}>רישום קבוצה</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>{d.title}</Typography>
            {closed && <Alert severity="warning" sx={{ mb: 2 }} data-testid="team-create-closed">ההרשמה לטורניר נסגרה</Alert>}
            <TeamCreateForm
                submitting={mut.pending}
                minors={minors}
                nameError={nameTaken && view?.kind === "message" ? view.text : null}
                error={message}
                onCancel={() => router.back()}
                onSubmit={async (data) => {
                    const res = await mut.create(data);
                    if (res) {
                        setSnack(createResultMessage(res.team, res.waitlisted));
                        router.replace(`/tournaments/${tournamentId}/team/${res.team.id}`);
                    }
                }}
            />
            <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack(null)} message={snack} />
        </Container>
    );
}
