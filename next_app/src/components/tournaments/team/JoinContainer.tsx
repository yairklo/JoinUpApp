"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SignInButton, useAuth } from "@clerk/nextjs";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Container from "@mui/material/Container";
import { tournamentErrorMessage } from "@/services/api/tournaments";
import { useTeamMutations, useTournament } from "@/hooks/tournaments";
import { getActionErrorMessage } from "@/utils/apiError";
import JoinPanel from "./JoinPanel";
import { normalizeJoinCode, teamErrorView } from "./teamModel";

const SPORT_LABEL = { SOCCER: "כדורגל", BASKETBALL: "כדורסל", TENNIS: "טניס" } as const;

/** `/tournaments/[id]/join/[code]`: join a team by link. */
export default function JoinContainer({ tournamentId, code: initialCode }: { tournamentId: string; code: string }) {
    const router = useRouter();
    const { isLoaded, isSignedIn } = useAuth();
    const t = useTournament(tournamentId, { live: false });
    const mut = useTeamMutations(tournamentId);
    const [code] = useState(() => normalizeJoinCode(decodeURIComponent(initialCode)));

    if (!isLoaded || (t.loading && !t.tournament)) {
        return <Container maxWidth="sm" sx={{ py: 6, textAlign: "center" }}><CircularProgress aria-label="טוען" /></Container>;
    }
    const d = t.tournament;
    if (!d) return <Container maxWidth="sm" sx={{ py: 4 }}><Alert severity="error">הטורניר לא נמצא</Alert></Container>;

    const view = teamErrorView(mut.errorCode, { max: d.maxPlayersPerTeam, self: true });
    const error = !mut.error || view?.kind === "minors" ? null : view?.kind === "message" ? view.text : tournamentErrorMessage(mut.error) ?? getActionErrorMessage(mut.error);
    const back = () => router.replace(`/tournaments/${tournamentId}`);

    return (
        <Container maxWidth="sm" sx={{ py: { xs: 2, md: 4 } }}>
            <JoinPanel
                tournamentTitle={d.title}
                sportLabel={SPORT_LABEL[d.sport]}
                dateLabel={new Date(d.startsAt).toLocaleDateString("he-IL", { dateStyle: "medium" })}
                code={code}
                joining={mut.pending}
                error={error}
                minors={view?.kind === "minors"}
                hasTeam={!!d.myTeam}
                signedIn={!!isSignedIn}
                signInSlot={<SignInButton mode="modal"><Button variant="contained" sx={{ minHeight: 48, flex: 1 }}>התחברות להצטרפות</Button></SignInButton>}
                onOpenMyTeam={() => d.myTeam && router.push(`/tournaments/${tournamentId}/team/${d.myTeam.id}`)}
                onDismiss={back}
                onJoin={async () => {
                    const res = await mut.joinByCode(code);
                    if (res) router.replace(`/tournaments/${tournamentId}/team/${res.team.id}?joined=1`);
                }}
            />
        </Container>
    );
}
