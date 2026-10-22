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
import { alpha } from "@mui/material/styles";
import PanToolAltRoundedIcon from "@mui/icons-material/PanToolAltRounded";
import { useStandings, useTeamDecision, useTeamMutations, useTournamentTeams } from "@/hooks/tournaments";
import { displayGroupName, displayStageName } from "@/utils/tournamentViews";
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
    const decisions = segment === "PENDING" || segment === "WAITLISTED" || segment === "OTHER";
    return (
        <Box
            data-testid={`queue-team-${team.id}`}
            sx={(theme) => ({
                p: { xs: 1.75, md: 2 },
                mb: 1.25,
                borderRadius: 3,
                border: 1,
                borderColor: "divider",
                bgcolor: "background.paper",
                boxShadow: theme.shadows[1],
                display: "grid",
                gap: { xs: 1.5, md: 2.5 },
                alignItems: "center",
                gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 200px auto" },
            })}
        >
            <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ minWidth: 0 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <TeamBadge team={team} size={32} lines={2} />
                    {captain && (
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }} noWrap>
                            {`קפטן: ${captain}`}
                        </Typography>
                    )}
                </Box>
                <Chip
                    size="small"
                    label={rosterValidityLabel(validity)}
                    color={validity.state === "ok" ? "success" : validity.state === "missing" ? "warning" : "error"}
                    variant="outlined"
                    data-testid={`queue-validity-${team.id}`}
                    sx={{ flexShrink: 0, fontWeight: 700 }}
                />
            </Stack>
            <Box>
                <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>
                        שחקנים
                    </Typography>
                    <Typography variant="caption" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums" }}>
                        <bdi>{`${n} מתוך ${minPlayers}–${maxPlayers}`}</bdi>
                    </Typography>
                </Stack>
                <Box
                    role="meter"
                    aria-valuemin={0}
                    aria-valuemax={maxPlayers}
                    aria-valuenow={n}
                    aria-valuetext={`${n === 1 ? "שחקן אחד" : `${n} שחקנים`}, נדרשים ${minPlayers} עד ${maxPlayers}`}
                    sx={{ height: 8, borderRadius: 4, bgcolor: "action.hover", overflow: "hidden" }}
                >
                    <Box sx={{ width: `${pct}%`, height: "100%", borderRadius: 4, bgcolor: validity.state === "ok" ? "success.main" : "warning.main" }} />
                </Box>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap justifyContent={{ xs: "flex-start", md: "flex-end" }}>
                {decisions && (
                    <Tooltip title={approveBlocked ? `אי אפשר לאשר קבוצה עם פחות מ-${minPlayers} שחקנים` : ""}>
                        <span>
                            <Button size="small" variant="contained" disabled={busy || approveBlocked} onClick={() => onDecide("APPROVE")} data-testid={`queue-approve-${team.id}`} sx={{ minHeight: 40, px: 2.5 }}>
                                אישור
                            </Button>
                        </span>
                    </Tooltip>
                )}
                {decisions && segment !== "WAITLISTED" && (
                    <Button size="small" variant="outlined" disabled={busy} onClick={() => onDecide("WAITLIST")} data-testid={`queue-waitlist-${team.id}`} sx={{ minHeight: 40 }}>
                        רשימת המתנה
                    </Button>
                )}
                {((decisions && segment !== "OTHER") || segment === "APPROVED") && (
                    <Button size="small" color="error" disabled={busy} onClick={() => onDecide("REJECT")} data-testid={`queue-reject-${team.id}`} sx={{ minHeight: 40, ms: { xs: "auto", md: 0 } }}>
                        דחייה
                    </Button>
                )}
            </Stack>
        </Box>
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
            <Tabs
                value={active}
                onChange={(_, v) => { setSegment(v); setSeedOrder(null); }}
                variant="scrollable"
                scrollButtons={false}
                sx={(theme) => ({
                    mb: 2,
                    minHeight: 0,
                    "& .MuiTabs-indicator": { display: "none" },
                    "& .MuiTabs-flexContainer": { gap: 1 },
                    "& .MuiTab-root": {
                        minHeight: 36,
                        py: 0.75,
                        px: 1.75,
                        borderRadius: 999,
                        border: 1,
                        borderColor: "divider",
                        fontWeight: 700,
                        fontSize: "0.85rem",
                        color: "text.secondary",
                        bgcolor: "background.paper",
                        transition: "background-color 150ms ease, color 150ms ease",
                    },
                    "& .MuiTab-root.Mui-selected": {
                        color: theme.palette.mode === "dark" ? theme.palette.primary.light : theme.palette.primary.dark,
                        bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.18 : 0.1),
                        borderColor: alpha(theme.palette.primary.main, 0.5),
                    },
                })}
            >
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
                            <Typography variant="body2" sx={{ flex: 1 }}>{tb.groupName ? displayGroupName(tb.groupName) : displayStageName(tb.stageName)}</Typography>
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
