"use client";

import { useState, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { TournamentTeam } from "@/types/tournament";
import RosterMeter from "../RosterMeter";
import TeamBadge from "../TeamBadge";
import InvitePlayers, { type InvitePlayersProps } from "./InvitePlayers";
import JoinCodeBox, { type JoinCodeBoxProps } from "./JoinCodeBox";
import TeamRoster, { type TeamRosterProps } from "./TeamRoster";
import TeamStatusBanners from "./TeamStatusBanners";
import { isRosterLocked, rosterCounts } from "./teamModel";

export interface TeamPageProps {
    team: TournamentTeam;
    tournamentTitle: string;
    sportLabel?: string;
    limits: { min: number; max: number; starters: number };
    rosterLockAt?: string | null;
    /** Captain (or manager) view: invite, join code, roster menus, withdraw. */
    canManage: boolean;
    viewerId?: string | null;
    /** A schedule exists: changes the withdraw confirm copy. */
    hasSchedule?: boolean;
    registrationClosed?: boolean;
    roster: Pick<TeamRosterProps, "onSetJersey" | "onSetRole" | "onRemove" | "onCancelInvite" | "onLeave">;
    invite: InvitePlayersProps;
    joinCode?: Omit<JoinCodeBoxProps, "code" | "closed"> | null;
    onWithdraw: () => void;
    busy?: boolean;
    /** Plain-language error from the last roster / code action. */
    error?: string | null;
    /** Slot for the team's MatchCards (owned by the schedule agent). */
    matchesSlot?: ReactNode;
}

function Section({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
    return (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }} data-testid={testId}>
            <Typography variant="subtitle1" component="h2" fontWeight={700} sx={{ mb: 1 }}>{title}</Typography>
            {children}
        </Paper>
    );
}

export default function TeamPage(p: TeamPageProps) {
    const [withdrawOpen, setWithdrawOpen] = useState(false);
    const { team } = p;
    const counts = rosterCounts(team.members);
    const locked = isRosterLocked(p.rosterLockAt);
    const inactive = team.status === "WITHDRAWN" || team.status === "REJECTED";
    const canEdit = p.canManage && !inactive;

    return (
        <Stack spacing={2} data-testid="team-page">
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                <TeamBadge team={team} size={40} lines={2} testId="team-page-badge" />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {[p.tournamentTitle, p.sportLabel].filter(Boolean).join(" · ")}
                </Typography>
            </Paper>

            <TeamStatusBanners status={team.status} accepted={counts.accepted} min={p.limits.min} rosterLockAt={p.rosterLockAt} />
            {p.error && <Alert severity="error" data-testid="team-error">{p.error}</Alert>}

            <Section title={counts.accepted === 1 ? "סגל · שחקן אחד" : `סגל · ${counts.accepted} שחקנים`}>
                <Stack spacing={1.5}>
                    <RosterMeter accepted={counts.accepted} invited={counts.invited} min={p.limits.min} max={p.limits.max} starters={p.limits.starters} />
                    <TeamRoster
                        members={team.members}
                        viewerId={p.viewerId}
                        canManage={canEdit}
                        locked={locked || inactive}
                        busy={p.busy}
                        {...p.roster}
                    />
                </Stack>
            </Section>

            {canEdit && !locked && (
                <Section title="הזמנת שחקנים">
                    <InvitePlayers {...p.invite} disabled={p.invite.disabled || p.busy} />
                </Section>
            )}
            {canEdit && p.joinCode && team.joinCode && (
                <Section title="הצטרפות בקישור">
                    <JoinCodeBox {...p.joinCode} code={team.joinCode} closed={p.registrationClosed} busy={p.busy || p.joinCode.busy} />
                </Section>
            )}

            {p.matchesSlot && <Section title="המשחקים של הקבוצה">{p.matchesSlot}</Section>}

            {canEdit && (
                <Button color="error" onClick={() => setWithdrawOpen(true)} data-testid="team-withdraw" disabled={p.busy} sx={{ alignSelf: "flex-start", minHeight: 44 }}>
                    הוצאת הקבוצה מהטורניר
                </Button>
            )}

            <Dialog open={withdrawOpen} onClose={() => setWithdrawOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>{`להוציא את ${team.name} מהטורניר?`}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {p.hasSchedule
                            ? "המשחקים שלה שעוד לא שוחקו ייחשבו כהפסד טכני."
                            : "כל השחקנים יוסרו מהקבוצה."}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setWithdrawOpen(false)}>ביטול</Button>
                    <Button color="error" data-testid="team-withdraw-confirm" onClick={() => { setWithdrawOpen(false); p.onWithdraw(); }}>
                        הוצאה
                    </Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
}
