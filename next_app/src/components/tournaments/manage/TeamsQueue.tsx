"use client";

import { useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Skeleton from "@mui/material/Skeleton";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import PanToolAltRoundedIcon from "@mui/icons-material/PanToolAltRounded";
import { useStandings, useTeamDecision, useTeamMutations, useTournamentTeams } from "@/hooks/tournaments";
import {
    acceptedCount,
    decisionErrorText,
    groupTeamsBySegment,
    rosterValidity,
    rosterValidityLabel,
    seedPatches,
    shuffled,
    type QueueSegment,
} from "@/utils/tournamentManage";
import { tournamentErrorMessage } from "@/services/api/tournaments";
import type { StandingsTableData, TeamDecision, TournamentDetail, TournamentTeam } from "@/types/tournament";
import TeamBadge from "../TeamBadge";
import ManualRankDialog from "./ManualRankDialog";
import ReorderList from "./ReorderList";

const SEGMENTS: Array<{ key: QueueSegment; label: string }> = [
    { key: "PENDING", label: "ממתינות" },
    { key: "APPROVED", label: "מאושרות" },
    { key: "WAITLISTED", label: "רשימת המתנה" },
    { key: "OTHER", label: "נדחו/יצאו" },
];

export interface TeamQueueRowProps {
    team: TournamentTeam;
    minPlayers: number;
    maxPlayers: number;
    segment: QueueSegment;
    busy: boolean;
    onDecide: (decision: TeamDecision) => void;
}

/** One team in the queue: badge, captain, roster meter, validity badge and decision buttons (spec 11.1). */
export function TeamQueueRow({ team, minPlayers, maxPlayers, segment, busy, onDecide }: TeamQueueRowProps) {
    const n = acceptedCount(team);
    const validity = rosterValidity(n, minPlayers, maxPlayers);
    const captain = team.members.find((m) => m.role === "CAPTAIN")?.name;
    const approveBlocked = validity.state === "missing";
    const pct = Math.min(100, (n / Math.max(1, maxPlayers)) * 100);
    return (
        <Stack
            direction={{ xs: "column", md: "row" }}
            alignItems={{ md: "center" }}
            spacing={1.5}
            data-testid={`queue-team-${team.id}`}
            sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: 3, mb: 1 }}
        >
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <TeamBadge team={team} size={32} lines={2} />
                {captain && (
                    <Typography variant="caption" color="text.secondary" display="block">{`קפטן: ${captain}`}</Typography>
                )}
            </Box>
            <Box sx={{ width: { md: 180 } }}>
                <Box
                    role="meter"
                    aria-valuemin={0}
                    aria-valuemax={maxPlayers}
                    aria-valuenow={n}
                    aria-valuetext={`${n} שחקנים, נדרשים ${minPlayers} עד ${maxPlayers}`}
                    sx={{ height: 6, borderRadius: 3, bgcolor: "action.hover", overflow: "hidden" }}
                >
                    <Box sx={{ width: `${pct}%`, height: "100%", bgcolor: validity.state === "ok" ? "success.main" : "warning.main" }} />
                </Box>
                <Typography variant="caption" color="text.secondary">{`${n} מתוך ${minPlayers}–${maxPlayers}`}</Typography>
            </Box>
            <Chip
                size="small"
                label={rosterValidityLabel(validity)}
                color={validity.state === "ok" ? "success" : validity.state === "missing" ? "warning" : "error"}
                variant="outlined"
                data-testid={`queue-validity-${team.id}`}
            />
            {(segment === "PENDING" || segment === "WAITLISTED" || segment === "OTHER") && (
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Tooltip title={approveBlocked ? `אי אפשר לאשר קבוצה עם פחות מ-${minPlayers} שחקנים` : ""}>
                        <span>
                            <Button size="small" variant="contained" disabled={busy || approveBlocked} onClick={() => onDecide("APPROVE")} data-testid={`queue-approve-${team.id}`} sx={{ minHeight: 40 }}>
                                אישור
                            </Button>
                        </span>
                    </Tooltip>
                    {segment !== "WAITLISTED" && (
                        <Button size="small" variant="outlined" disabled={busy} onClick={() => onDecide("WAITLIST")} data-testid={`queue-waitlist-${team.id}`} sx={{ minHeight: 40 }}>
                            רשימת המתנה
                        </Button>
                    )}
                    {segment !== "OTHER" && (
                        <Button size="small" color="error" disabled={busy} onClick={() => onDecide("REJECT")} data-testid={`queue-reject-${team.id}`} sx={{ minHeight: 40 }}>
                            דחייה
                        </Button>
                    )}
                </Stack>
            )}
            {segment === "APPROVED" && (
                <Button size="small" color="error" disabled={busy} onClick={() => onDecide("REJECT")} data-testid={`queue-reject-${team.id}`} sx={{ minHeight: 40 }}>
                    דחייה
                </Button>
            )}
        </Stack>
    );
}

export interface TeamsQueueProps {
    tournament: TournamentDetail;
}

/** Manage section (a): approve / reject / waitlist, seeding and manual-rank tie breaks. */
export default function TeamsQueue({ tournament }: TeamsQueueProps) {
    const t = tournament;
    const { teams, loading, error, reload } = useTournamentTeams(t.id);
    const { tables, reload: reloadStandings } = useStandings(t.id);
    const decision = useTeamDecision(t.id);
    const mut = useTeamMutations(t.id);
    const groups = useMemo(() => groupTeamsBySegment(teams), [teams]);
    const [segment, setSegment] = useState<QueueSegment | null>(null);
    const active: QueueSegment = segment ?? (groups.PENDING.length ? "PENDING" : "APPROVED");
    const [reject, setReject] = useState<TournamentTeam | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [seedOrder, setSeedOrder] = useState<string[] | null>(null);
    const [rankTable, setRankTable] = useState<StandingsTableData | null>(null);

    const seedable = t.format === "KNOCKOUT" || t.rules?.seeding === "MANUAL";
    const needRank = tables.filter((x) => x.needsManualRank);
    const nameById = new Map(teams.map((x) => [x.id, x.name]));

    const decide = async (team: TournamentTeam, d: TeamDecision) => {
        setActionError(null);
        const res = await decision.decide(team.id, d);
        if (res) {
            const promoted = res.promotedTeamIds.map((id) => nameById.get(id)).filter(Boolean);
            if (promoted.length) setToast(`${promoted.join(", ")} עלתה מרשימת ההמתנה`);
            void reload();
        } else {
            setActionError(
                decisionErrorText(decision.errorCode, t.minPlayersPerTeam) ?? tournamentErrorMessage(decision.error) ?? "לא הצלחנו לעדכן את הקבוצה. נסו שוב."
            );
        }
    };

    const saveSeeds = async () => {
        if (!seedOrder) return;
        setActionError(null);
        for (const p of seedPatches(seedOrder, groups.APPROVED)) {
            const res = await mut.update(p.teamId, { seed: p.seed });
            if (!res) {
                setActionError("לא הצלחנו לשמור את סדר הזריעה. נסו שוב.");
                return;
            }
        }
        setSeedOrder(null);
        setToast("סדר הזריעה נשמר");
        void reload();
    };

    const saveRanks = async (patches: Array<{ teamId: string; manualRank: number }>) => {
        for (const p of patches) {
            const res = await mut.update(p.teamId, { manualRank: p.manualRank });
            if (!res) return;
        }
        setRankTable(null);
        setToast("הסדר נשמר");
        void reloadStandings();
    };

    if (loading && teams.length === 0) {
        return (
            <Box data-testid="manage-section-teams">
                {[0, 1, 2].map((k) => <Skeleton key={k} variant="rounded" height={72} sx={{ mb: 1 }} />)}
            </Box>
        );
    }
    if (error) {
        return (
            <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void reload()}>נסו שוב</Button>} data-testid="manage-section-teams">
                לא הצלחנו לטעון את הקבוצות.
            </Alert>
        );
    }

    const list = groups[active];
    const approvedFull = groups.APPROVED.length >= t.maxTeams;

    return (
        <Box data-testid="manage-section-teams">
            <Tabs value={active} onChange={(_, v) => { setSegment(v); setSeedOrder(null); }} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ mb: 1.5 }}>
                {SEGMENTS.map((s) => (
                    <Tab key={s.key} value={s.key} label={`${s.label} (${groups[s.key].length})`} data-testid={`queue-segment-${s.key}`} />
                ))}
            </Tabs>

            {approvedFull && active !== "APPROVED" && (
                <Alert severity="info" sx={{ mb: 1.5 }}>הטורניר מלא. אישור קבוצה נוספת דורש להגדיל את מספר הקבוצות המקסימלי.</Alert>
            )}
            {actionError && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setActionError(null)} data-testid="queue-error">{actionError}</Alert>}

            {active === "APPROVED" && seedable && list.length > 1 && (
                <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
                    {seedOrder ? (
                        <>
                            <Button variant="outlined" onClick={() => setSeedOrder(shuffled(seedOrder))} disabled={mut.pending}>הגרלה אקראית</Button>
                            <Button onClick={() => setSeedOrder(null)} disabled={mut.pending}>ביטול</Button>
                        </>
                    ) : (
                        <Button variant="outlined" onClick={() => setSeedOrder(list.map((x) => x.id))} data-testid="seeding-mode">סדר זריעה</Button>
                    )}
                </Stack>
            )}

            {list.length === 0 && (
                <Typography color="text.secondary" data-testid="queue-empty" sx={{ py: 3, textAlign: "center" }}>
                    {active === "PENDING" ? "אין קבוצות שממתינות לאישור." : "אין קבוצות כאן."}
                </Typography>
            )}

            {active === "APPROVED" && seedOrder ? (
                <>
                    <ReorderList
                        testId="seeding-list"
                        disabled={mut.pending}
                        onChange={setSeedOrder}
                        items={seedOrder.map((id) => {
                            const team = list.find((x) => x.id === id);
                            return { id, label: team?.name ?? "", content: team ? <TeamBadge team={team} size={32} /> : null };
                        })}
                    />
                    <Box sx={{ position: "sticky", bottom: 0, bgcolor: "background.paper", py: 1.5 }}>
                        <Button variant="contained" fullWidth onClick={() => void saveSeeds()} disabled={mut.pending} data-testid="seeding-save" sx={{ minHeight: 48 }}>
                            שמירת סדר
                        </Button>
                    </Box>
                </>
            ) : (
                list.map((team) => (
                    <TeamQueueRow
                        key={team.id}
                        team={team}
                        minPlayers={t.minPlayersPerTeam}
                        maxPlayers={t.maxPlayersPerTeam}
                        segment={active}
                        busy={decision.pending}
                        onDecide={(d) => (d === "REJECT" ? setReject(team) : void decide(team, d))}
                    />
                ))
            )}

            {needRank.length > 0 && (
                <Box sx={{ mt: 3 }} data-testid="manual-rank-section">
                    <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1 }}>שוויון שדורש הכרעה</Typography>
                    {needRank.map((tb) => (
                        <Stack key={`${tb.stageId}-${tb.groupId}`} direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                            <PanToolAltRoundedIcon fontSize="small" color="warning" />
                            <Typography variant="body2" sx={{ flex: 1 }}>{tb.groupName ?? tb.stageName}</Typography>
                            <Button size="small" variant="outlined" onClick={() => setRankTable(tb)}>קביעת סדר</Button>
                        </Stack>
                    ))}
                </Box>
            )}

            <Dialog open={!!reject} onClose={() => setReject(null)} dir="rtl" maxWidth="xs" fullWidth>
                <DialogTitle>{`לדחות את ${reject?.name ?? ""}?`}</DialogTitle>
                <DialogContent>
                    <Typography variant="body2">הקפטן יקבל הודעה.</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setReject(null)}>ביטול</Button>
                    <Button
                        color="error"
                        variant="contained"
                        data-testid="queue-reject-confirm"
                        onClick={() => {
                            const team = reject;
                            setReject(null);
                            if (team) void decide(team, "REJECT");
                        }}
                    >
                        דחייה
                    </Button>
                </DialogActions>
            </Dialog>

            <ManualRankDialog open={!!rankTable} table={rankTable} saving={mut.pending} error={mut.error ? "לא הצלחנו לשמור. נסו שוב." : null} onSave={(p) => void saveRanks(p)} onClose={() => setRankTable(null)} />
            <Snackbar open={toast !== null} autoHideDuration={4000} onClose={() => setToast(null)} message={toast ?? ""} />
        </Box>
    );
}
