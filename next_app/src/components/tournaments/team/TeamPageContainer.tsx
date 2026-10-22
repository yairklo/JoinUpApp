"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Container from "@mui/material/Container";
import Snackbar from "@mui/material/Snackbar";
import { searchApi } from "@/services/api/search";
import { toTournamentError, tournamentErrorMessage, tournamentsApi } from "@/services/api/tournaments";
import { usersApi } from "@/services/api/users";
import { useRosterMutations, useTeamMutations, useTournament, useTournamentTeams } from "@/hooks/tournaments";
import { getActionErrorMessage } from "@/utils/apiError";
import type { TournamentApiError } from "@/services/api/tournaments";
import type { InviteCandidate } from "./InvitePlayers";
import TeamPage from "./TeamPage";
import MinorsCard from "./MinorsCard";
import { joinPath, teamErrorView } from "./teamModel";

const SPORT_LABEL = { SOCCER: "כדורגל", BASKETBALL: "כדורסל", TENNIS: "טניס" } as const;

function errorText(e: TournamentApiError | null, max?: number): string | null {
    if (!e) return null;
    const v = teamErrorView(e.code, { max });
    if (v?.kind === "message") return v.text;
    if (v?.kind === "minors") return "הטורניר פתוח לבני 18 ומעלה בלבד";
    return tournamentErrorMessage(e) ?? getActionErrorMessage(e);
}

/** `/tournaments/[id]/team/[teamId]`: captain's team page (read-only for other roles). */
export default function TeamPageContainer({ tournamentId, teamId }: { tournamentId: string; teamId: string }) {
    const router = useRouter();
    const { userId, getToken, isLoaded, isSignedIn } = useAuth();
    const t = useTournament(tournamentId);
    const teams = useTournamentTeams(tournamentId);
    const roster = useRosterMutations(tournamentId, teamId);
    const teamMut = useTeamMutations(tournamentId);

    const [snack, setSnack] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [friends, setFriends] = useState<InviteCandidate[]>([]);
    const [results, setResults] = useState<InviteCandidate[]>([]);
    const [searching, setSearching] = useState(false);
    const [invited, setInvited] = useState<Set<string>>(new Set());
    const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({});
    const [pendingId, setPendingId] = useState<string | null>(null);

    useEffect(() => {
        if (new URLSearchParams(window.location.search).get("joined") === "1") setSnack("הצטרפת לקבוצה!");
    }, []);

    const team = teams.teams.find((x) => x.id === teamId) ?? null;
    const detail = t.tournament;
    const isCaptain = !!team && !!userId && team.captainId === userId;
    const canManage = isCaptain || !!detail?.capabilities.canManage;

    // Friends, once, for the empty-query list.
    useEffect(() => {
        if (!canManage || !userId) return;
        let live = true;
        (async () => {
            try {
                const token = await getToken();
                if (!token) return;
                const list = await usersApi.getFriends(userId, token);
                if (live) setFriends((list ?? []).filter((f) => f?.id).map((f) => ({ id: f.id, name: f.name ?? "", imageUrl: f.imageUrl ?? null })));
            } catch {
                /* friends are a convenience; search still works */
            }
        })();
        return () => {
            live = false;
        };
    }, [canManage, userId, getToken]);

    useEffect(() => {
        const q = query.trim();
        if (q.length < 2) {
            setResults([]);
            return;
        }
        let live = true;
        setSearching(true);
        const h = setTimeout(async () => {
            try {
                const res = await searchApi.global(q, (await getToken()) ?? undefined);
                if (live) setResults(res.users.map((u) => ({ id: u.id, name: u.name ?? "", imageUrl: u.imageUrl ?? null })));
            } catch {
                if (live) setResults([]);
            } finally {
                if (live) setSearching(false);
            }
        }, 300);
        return () => {
            live = false;
            clearTimeout(h);
        };
    }, [query, getToken]);

    const memberIds = useMemo(() => new Set((team?.members ?? []).filter((m) => m.status === "INVITED" || m.status === "ACCEPTED").map((m) => m.userId)), [team]);
    const invitedIds = useMemo(() => new Set([...memberIds, ...invited]), [memberIds, invited]);
    const candidates = (query.trim().length < 2 ? friends : results).filter((c) => c.id !== userId);

    const invite = async (uid: string) => {
        setPendingId(uid);
        setInviteErrors(({ [uid]: _drop, ...rest }) => rest);
        try {
            const token = await getToken();
            if (!token) throw new Error("Not signed in");
            await tournamentsApi.inviteMember(tournamentId, teamId, uid, token);
            setInvited((s0) => new Set(s0).add(uid));
            void teams.reload();
        } catch (e) {
            setInviteErrors((m) => ({ ...m, [uid]: errorText(toTournamentError(e), detail?.maxPlayersPerTeam) ?? "ההזמנה נכשלה" }));
        } finally {
            setPendingId(null);
        }
    };

    const act = async (fn: () => Promise<unknown>, done?: string) => {
        const res = await fn();
        if (res) {
            if (done) setSnack(done);
            await teams.reload();
        }
    };

    if (!isLoaded || ((t.loading || teams.loading) && !team)) {
        return <Container maxWidth="md" sx={{ py: 6, textAlign: "center" }}><CircularProgress aria-label="טוען" /></Container>;
    }
    if (!detail || !team) {
        return <Container maxWidth="md" sx={{ py: 4 }}><Alert severity="error">הקבוצה לא נמצאה</Alert></Container>;
    }
    if (!isSignedIn && !team) return null;

    const link = typeof window !== "undefined" && team.joinCode ? `${window.location.origin}${joinPath(tournamentId, team.joinCode)}` : "";
    const actionError = errorText(roster.error, detail.maxPlayersPerTeam) ?? errorText(teamMut.error, detail.maxPlayersPerTeam);
    const registrationClosed = detail.status !== "REGISTRATION_OPEN";

    return (
        <Container maxWidth="md" sx={{ py: { xs: 2, md: 4 } }}>
            {roster.errorCode === "MINORS_NOT_ALLOWED" && <MinorsCard />}
            <TeamPage
                team={team}
                tournamentTitle={detail.title}
                sportLabel={SPORT_LABEL[detail.sport]}
                limits={{ min: detail.minPlayersPerTeam, max: detail.maxPlayersPerTeam, starters: detail.startersPerTeam }}
                rosterLockAt={detail.rosterLockAt}
                canManage={canManage}
                viewerId={userId}
                hasSchedule={detail.counts.matchesTotal > 0}
                registrationClosed={registrationClosed}
                busy={roster.pending || teamMut.pending}
                error={actionError}
                roster={{
                    onSetJersey: (uid, n) => void act(() => roster.update(uid, { jerseyNumber: n })),
                    onSetRole: (uid, role) => void act(() => roster.update(uid, { role })),
                    onRemove: (uid) => void act(() => roster.remove(uid)),
                    onCancelInvite: (uid) => void act(() => roster.remove(uid)),
                    onLeave: (uid) =>
                        void (async () => {
                            const res = await roster.remove(uid);
                            if (res) router.push(`/tournaments/${tournamentId}`);
                        })(),
                }}
                invite={{
                    query,
                    onQueryChange: setQuery,
                    candidates,
                    loading: searching,
                    invitedIds,
                    errors: inviteErrors,
                    pendingId,
                    onInvite: (uid) => void invite(uid),
                }}
                joinCode={{
                    link,
                    onCopy: () => {
                        void navigator.clipboard?.writeText(link).then(() => setSnack("הקישור הועתק"), () => setSnack("לא ניתן להעתיק"));
                    },
                    onShare: () => {
                        const text = `בואו לשחק איתנו ב${detail.title}! להצטרפות לקבוצה ${team.name}: ${link}`;
                        if (navigator.share) void navigator.share({ text }).catch(() => undefined);
                        else void navigator.clipboard?.writeText(text).then(() => setSnack("הקישור הועתק"));
                    },
                    onRotate: () => void act(() => teamMut.rotateJoinCode(teamId), "נוצר קוד חדש"),
                }}
                onWithdraw={() =>
                    void (async () => {
                        const res = await teamMut.withdraw(teamId);
                        if (res) router.push(`/tournaments/${tournamentId}`);
                    })()
                }
            />
            <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack(null)} message={snack} />
        </Container>
    );
}
