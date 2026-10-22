"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { MyInvite } from "@/types/tournament";
import TeamBadge from "../TeamBadge";

export interface InvitesListProps {
    invites: MyInvite[];
    /** teamId of the invite currently being answered. */
    pendingTeamId?: string | null;
    /** teamId -> joined team name (success state until reload). */
    acceptedTeamIds?: ReadonlySet<string>;
    /** Per-team inline error. */
    errors?: Readonly<Record<string, string>>;
    onAccept: (invite: MyInvite, siblings: MyInvite[]) => void;
    onDecline: (invite: MyInvite) => void;
    onOpenTeam: (invite: MyInvite) => void;
}

const SPORT_EMOJI = { SOCCER: "⚽", BASKETBALL: "🏀", TENNIS: "🎾" } as const;

/** Group invites by tournament, preserving first-seen order. */
export function groupInvites(invites: MyInvite[]): MyInvite[][] {
    const map = new Map<string, MyInvite[]>();
    for (const i of invites) map.set(i.tournamentId, [...(map.get(i.tournamentId) ?? []), i]);
    return [...map.values()];
}

export function relativeTime(iso: string, now = Date.now()): string {
    const diff = now - new Date(iso).getTime();
    if (Number.isNaN(diff)) return "";
    const min = Math.floor(diff / 60000);
    if (min < 1) return "הרגע";
    if (min < 60) return `לפני ${min} דק׳`;
    const h = Math.floor(min / 60);
    if (h < 24) return `לפני ${h} שעות`;
    return `לפני ${Math.floor(h / 24)} ימים`;
}

export default function InvitesList({ invites, pendingTeamId, acceptedTeamIds, errors = {}, onAccept, onDecline, onOpenTeam }: InvitesListProps) {
    if (!invites.length) {
        return <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }} data-testid="invites-empty">אין הזמנות פתוחות</Typography>;
    }
    return (
        <Stack spacing={2} data-testid="invites-list">
            {groupInvites(invites).map((group) => {
                const first = group[0];
                const joined = group.find((i) => acceptedTeamIds?.has(i.teamId));
                const visible = joined ? [joined] : group;
                return (
                    <Stack key={first.tournamentId} spacing={1}>
                        <Typography variant="subtitle1" component="h2" fontWeight={700}>
                            {`${SPORT_EMOJI[first.sport] ?? ""} ${first.tournamentTitle}`}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {new Date(first.startsAt).toLocaleDateString("he-IL", { dateStyle: "medium" })}
                        </Typography>
                        {group.length > 1 && !joined && (
                            <Alert severity="info" data-testid="invites-one-team-note">
                                אפשר להצטרף לקבוצה אחת בלבד. הצטרפות תבטל את שאר ההזמנות לטורניר הזה.
                            </Alert>
                        )}
                        {visible.map((i) => {
                            const done = acceptedTeamIds?.has(i.teamId);
                            const busy = pendingTeamId === i.teamId;
                            return (
                                <Paper key={i.teamId} variant="outlined" sx={{ p: 2, borderRadius: 3 }} data-testid={`invite-card-${i.teamId}`}>
                                    <Stack spacing={1}>
                                        <TeamBadge team={{ name: i.teamName, color: i.teamColor }} size={32} lines={2} />
                                        {done ? (
                                            <Stack direction="row" alignItems="center" justifyContent="space-between">
                                                <Typography color="success.main" fontWeight={700}>{`הצטרפת ל${i.teamName}!`}</Typography>
                                                <Button variant="contained" onClick={() => onOpenTeam(i)} sx={{ minHeight: 44 }}>לעמוד הקבוצה</Button>
                                            </Stack>
                                        ) : (
                                            <>
                                                <Typography variant="body2" color="text.secondary">
                                                    {`הקפטן: ${i.captainName} · ${relativeTime(i.invitedAt)}`}
                                                </Typography>
                                                {errors[i.teamId] && <Alert severity="error">{errors[i.teamId]}</Alert>}
                                                <Stack direction="row" spacing={1}>
                                                    <Button variant="contained" disabled={busy} data-testid={`invite-accept-${i.teamId}`} onClick={() => onAccept(i, group.filter((x) => x.teamId !== i.teamId))} sx={{ minHeight: 44 }}>
                                                        הצטרפות
                                                    </Button>
                                                    <Button disabled={busy} data-testid={`invite-decline-${i.teamId}`} onClick={() => onDecline(i)} sx={{ minHeight: 44 }}>
                                                        דחייה
                                                    </Button>
                                                </Stack>
                                            </>
                                        )}
                                    </Stack>
                                </Paper>
                            );
                        })}
                    </Stack>
                );
            })}
        </Stack>
    );
}
