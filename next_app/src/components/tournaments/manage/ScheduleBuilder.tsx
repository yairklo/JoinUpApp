"use client";

import { useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Skeleton from "@mui/material/Skeleton";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import { useScheduleMutations, useTournamentSchedule, useTournamentTeams } from "@/hooks/tournaments";
import { ScheduleConflictError, tournamentErrorMessage } from "@/services/api/tournaments";
import { describeSlot } from "@/utils/tournament";
import { courtLabelForMove, dedupeCourts, itemDays, type GridItem } from "@/utils/scheduleGrid";
import {
    buildGenerateInput,
    groupConflicts,
    israelToIso,
    isoToIsraelParts,
    validateScheduleParams,
    type ConflictContext,
    type ScheduleParams,
} from "@/utils/tournamentManage";
import type {
    ScheduleConflict,
    SchedulePreviewResponse,
    TournamentDetail,
    TournamentMatch,
} from "@/types/tournament";
import ConflictsPanel from "./ConflictsPanel";
import MatchEditDialog, { EMPTY_MATCH_VALUES, type MatchEditValues } from "./MatchEditDialog";
import ScheduleParamsForm from "./ScheduleParamsForm";
import ScheduleViews from "./ScheduleViews";
import ScoreEntrySheet from "../ScoreEntrySheet";

function defaultParams(t: TournamentDetail): ScheduleParams {
    const start = isoToIsraelParts(t.startsAt)?.date ?? "";
    return {
        days: [{ date: start, from: "16:00", to: "22:00" }],
        courtCount: 2,
        namedCourts: false,
        courtNames: [],
        matchMinutes: t.rules?.matchMinutes ?? 60,
        breakMinutes: t.rules?.breakMinutes ?? 10,
        minRestMinutes: t.rules?.minRestMinutes ?? 30,
        seed: Math.floor(Math.random() * 1e9),
    };
}

function errorText(code: string | null, error: unknown): string {
    switch (code) {
        case "SCHEDULE_HAS_RESULTS":
            return "כבר הוזנו תוצאות, אי אפשר לבנות מחדש. אפשר לערוך משחקים ידנית.";
        case "MATCH_REFERENCED":
            return "משחק אחר תלוי בתוצאה של המשחק הזה, אי אפשר למחוק.";
        case "MATCH_FINISHED":
            return "אי אפשר למחוק משחק שהסתיים.";
        case "TOO_FEW_TEAMS":
            return "אין מספיק קבוצות מאושרות כדי לבנות לוח משחקים.";
        default:
            return tournamentErrorMessage(error) ?? "הפעולה נכשלה. נסו שוב.";
    }
}

interface EditState {
    mode: "add" | "edit";
    matchId?: string;
    number?: number;
    values: MatchEditValues;
    originalStatus?: MatchEditValues["status"];
    conflicts: ScheduleConflict[];
    error: string | null;
}

export interface ScheduleBuilderProps {
    tournament: TournamentDetail;
}

/** Manage section (b): parameters, preview, commit and manual editing of the schedule (spec 11.2). */
export default function ScheduleBuilder({ tournament: t }: ScheduleBuilderProps) {
    const sched = useTournamentSchedule(t.id);
    const { teams } = useTournamentTeams(t.id);
    const mut = useScheduleMutations(t.id);
    const [params, setParams] = useState<ScheduleParams>(() => defaultParams(t));
    const [showErrors, setShowErrors] = useState(false);
    const [preview, setPreview] = useState<SchedulePreviewResponse | null>(null);
    const [rebuilding, setRebuilding] = useState(false);
    const [confirmCommit, setConfirmCommit] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [focusKey, setFocusKey] = useState<string | null>(null);
    const [edit, setEdit] = useState<EditState | null>(null);
    const [scoreMatch, setScoreMatch] = useState<TournamentMatch | null>(null);
    const [moveConflict, setMoveConflict] = useState<{ key: string; iso: string; court: string; conflicts: ScheduleConflict[] } | null>(null);

    const approved = useMemo(() => teams.filter((x) => x.status === "APPROVED"), [teams]);
    const nameById = useMemo(() => new Map(teams.map((x) => [x.id, x.name])), [teams]);
    const hasSchedule = sched.matches.length > 0;
    const editing = hasSchedule && !rebuilding;
    const errs = validateScheduleParams(params);

    const changeParams = (next: ScheduleParams) => {
        setParams(next);
        setPreview(null);
    };

    // ---- items for the views ----
    const previewNumbers = useMemo(() => new Map((preview?.matches ?? []).map((m) => [m.key, m.number])), [preview]);
    const slotLabel = (slot: { teamId: string | null; source: unknown }, numbers: ReadonlyMap<string, number>) => {
        if (slot.teamId && nameById.get(slot.teamId)) return nameById.get(slot.teamId) as string;
        const view = describeSlot({ team: null, source: slot.source }, { matchNumberById: numbers, groupNameById: sched.groupNameById });
        return view.kind === "placeholder" ? view.text : "";
    };
    const previewItems: GridItem[] = useMemo(
        () =>
            (preview?.matches ?? []).map((m) => ({
                key: m.key,
                number: m.number,
                scheduledAt: m.scheduledAt,
                court: m.courtLabel,
                home: slotLabel(m.home, previewNumbers),
                away: slotLabel(m.away, previewNumbers),
            })),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- slotLabel closes over nameById / sched
        [preview, previewNumbers, nameById, sched.groupNameById]
    );
    const committedItems: GridItem[] = useMemo(
        () =>
            sched.matches.map((m) => ({
                key: m.id,
                number: m.number,
                scheduledAt: m.scheduledAt,
                court: m.courtLabel,
                home: m.home.team?.name || slotLabel({ teamId: m.home.teamId, source: m.home.source }, sched.matchNumberById),
                away: m.away.team?.name || slotLabel({ teamId: m.away.teamId, source: m.away.source }, sched.matchNumberById),
            })),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- slotLabel closes over nameById
        [sched.matches, sched.matchNumberById, nameById, sched.groupNameById]
    );

    const conflictCtx = (numbers: ReadonlyMap<string, number>): ConflictContext => ({ numberById: numbers, teamNameById: nameById, minRestMinutes: params.minRestMinutes });
    const previewGroups = useMemo(
        () => groupConflicts(preview?.conflicts ?? [], conflictCtx(previewNumbers)),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- ctx derived from the deps below
        [preview, previewNumbers, nameById, params.minRestMinutes]
    );
    const courtNames = useMemo(() => {
        const set = new Set<string>(params.namedCourts ? params.courtNames : []);
        if (!params.namedCourts) for (let i = 1; i <= params.courtCount; i++) set.add(`מגרש ${i}`);
        for (const it of committedItems) if (it.court) set.add(it.court);
        return dedupeCourts(set);
    }, [params, committedItems]);

    // ---- actions ----
    const runPreview = async () => {
        setShowErrors(true);
        setError(null);
        if (errs.length) return;
        const res = await mut.preview(buildGenerateInput(params));
        if (res) setPreview(res);
        else setError(errorText(mut.errorCode, mut.error));
    };

    const commit = async () => {
        if (!preview) return;
        setConfirmCommit(false);
        setError(null);
        const res = await mut.generate(buildGenerateInput(params, { allowConflicts: preview.conflicts.length > 0 }));
        if (res) {
            setToast("לוח המשחקים נשמר. השחקנים יקבלו עדכון.");
            setPreview(null);
            setRebuilding(false);
            void sched.reload();
        } else {
            setError(errorText(mut.errorCode, mut.error));
        }
    };

    const startCommit = () => {
        if (!preview) return;
        if (preview.conflicts.length > 0 || hasSchedule) setConfirmCommit(true);
        else void commit();
    };

    const toValues = (m: TournamentMatch): MatchEditValues => {
        const p = m.scheduledAt ? isoToIsraelParts(m.scheduledAt) : null;
        return {
            ...EMPTY_MATCH_VALUES,
            homeTeamId: m.home.teamId ?? "",
            awayTeamId: m.away.teamId ?? "",
            date: p?.date ?? "",
            time: p?.time ?? "",
            court: m.courtLabel ?? "",
            status: m.status === "POSTPONED" || m.status === "CANCELLED" ? m.status : "SCHEDULED",
        };
    };

    const openEdit = (key: string) => {
        const m = sched.matches.find((x) => x.id === key);
        if (!m) return;
        const values = toValues(m);
        setEdit({ mode: "edit", matchId: m.id, number: m.number, values, originalStatus: values.status, conflicts: [], error: null });
    };

    const move = async (key: string, iso: string, court: string, force = false) => {
        const current = sched.matches.find((x) => x.id === key)?.courtLabel;
        const res = await mut.updateMatch(key, { scheduledAt: iso, courtLabel: courtLabelForMove(current, court), ...(force ? { force: true } : {}) });
        if (res) {
            setMoveConflict(null);
            setToast(res.conflicts.length ? "נשמר עם התנגשויות" : "המשחק הועבר");
            void sched.reload();
        } else if (mut.error instanceof ScheduleConflictError) {
            setMoveConflict({ key, iso, court, conflicts: mut.error.conflicts as ScheduleConflict[] });
        } else {
            setError(errorText(mut.errorCode, mut.error));
        }
    };

    const saveEdit = async (force: boolean) => {
        if (!edit) return;
        const v = edit.values;
        const iso = v.date && v.time ? israelToIso(v.date, v.time) : null;
        if ((v.date || v.time) && !iso) {
            setEdit({ ...edit, error: "תאריך ושעה צריכים להיות מלאים." });
            return;
        }
        const f = force ? { force: true } : {};
        const res =
            edit.mode === "add"
                ? await mut.createMatch({
                      ...(v.stageId ? { stageId: v.stageId } : {}),
                      ...(v.groupId ? { groupId: v.groupId } : {}),
                      ...(v.round ? { round: Number(v.round) } : {}),
                      ...(v.homeTeamId ? { homeTeamId: v.homeTeamId } : {}),
                      ...(v.awayTeamId ? { awayTeamId: v.awayTeamId } : {}),
                      ...(iso ? { scheduledAt: iso } : {}),
                      ...(v.court ? { courtLabel: v.court } : {}),
                      ...f,
                  })
                : await mut.updateMatch(edit.matchId as string, {
                      homeTeamId: v.homeTeamId || null,
                      awayTeamId: v.awayTeamId || null,
                      scheduledAt: iso,
                      courtLabel: v.court || null,
                      ...(v.status !== edit.originalStatus ? { status: v.status } : {}),
                      ...f,
                  });
        if (res) {
            setEdit(null);
            setToast(res.conflicts.length ? "נשמר עם התנגשויות" : "המשחק נשמר");
            void sched.reload();
        } else if (mut.error instanceof ScheduleConflictError) {
            setEdit({ ...edit, conflicts: mut.error.conflicts as ScheduleConflict[], error: null });
        } else {
            setEdit({ ...edit, error: errorText(mut.errorCode, mut.error) });
        }
    };

    const deleteMatch = async () => {
        if (!edit?.matchId) return;
        const res = await mut.deleteMatch(edit.matchId);
        if (res) {
            setEdit(null);
            setToast("המשחק נמחק");
            void sched.reload();
        } else {
            setEdit({ ...edit, error: errorText(mut.errorCode, mut.error) });
        }
    };

    const describedEdit = groupConflicts(edit?.conflicts ?? [], conflictCtx(sched.matchNumberById)).items;
    const describedMove = groupConflicts(moveConflict?.conflicts ?? [], conflictCtx(sched.matchNumberById)).items;
    const canDeleteMatch = (id?: string) => {
        const m = sched.matches.find((x) => x.id === id);
        return !!m && m.status !== "FINISHED" && m.status !== "FORFEIT";
    };

    if (sched.loading && sched.matches.length === 0) {
        return (
            <Box data-testid="manage-section-schedule">
                <Skeleton variant="rounded" height={160} />
            </Box>
        );
    }

    const days = itemDays(previewItems).length;
    const courtCount = params.namedCourts ? params.courtNames.length : params.courtCount;

    return (
        <Box data-testid="manage-section-schedule">
            {error && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError(null)} data-testid="schedule-error">{error}</Alert>}

            {editing ? (
                <>
                    <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
                        <Button variant="outlined" startIcon={<AddRoundedIcon />} onClick={() => setEdit({ mode: "add", values: EMPTY_MATCH_VALUES, conflicts: [], error: null })} data-testid="match-add">
                            הוספת משחק
                        </Button>
                        <Button onClick={() => setRebuilding(true)} data-testid="schedule-rebuild">בניית לוח מחדש</Button>
                    </Stack>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                        אפשר לגרור משחק למגרש או לשעה אחרים. לעריכה מדויקת לחצו על העיפרון.
                    </Typography>
                    <ScheduleViews
                        items={committedItems}
                        durationMinutes={t.rules?.matchMinutes ?? params.matchMinutes}
                        stepMinutes={params.stepMinutes ?? 30}
                        courts={courtNames}
                        editable
                        onMove={(k, iso, court) => void move(k, iso, court)}
                        onEdit={openEdit}
                        onScore={t.status === "IN_PROGRESS" ? (key) => {
                            const match = sched.matches.find((m) => m.id === key);
                            if (match && match.home.teamId && match.away.teamId) setScoreMatch(match);
                        } : undefined}
                    />
                </>
            ) : (
                <Stack direction={{ xs: "column", md: "row" }} spacing={3} alignItems="flex-start">
                    <Box sx={{ width: { xs: "100%", md: 380 }, flexShrink: 0 }}>
                        <ScheduleParamsForm params={params} onChange={changeParams} errors={errs} showErrors={showErrors} loading={mut.pending && !preview} onPreview={() => void runPreview()} />
                        {preview && <Box sx={{ mt: 2 }}><ConflictsPanel groups={previewGroups} onSelectMatch={setFocusKey} /></Box>}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0, width: "100%" }}>
                        {!preview ? (
                            <Typography color="text.secondary" data-testid="schedule-preview-empty">
                                הגדירו ימים, שעות ומגרשים ולחצו על ״תצוגה מקדימה״. שום דבר לא נשמר עד האישור.
                            </Typography>
                        ) : (
                            <>
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap data-testid="schedule-preview-summary">
                                    <Typography variant="subtitle2" fontWeight={800}>
                                        {`${preview.matches.length} משחקים · ${days} ימים · ${courtCount} מגרשים · ${preview.conflicts.length} התנגשויות`}
                                    </Typography>
                                    {preview.conflicts.length === 0 && <Chip size="small" color="success" label="✓ בלי התנגשויות" />}
                                </Stack>
                                <ScheduleViews
                                    items={previewItems}
                                    conflictedKeys={previewGroups.conflictedIds}
                                    durationMinutes={params.matchMinutes}
                                    stepMinutes={params.stepMinutes ?? 30}
                                    focusKey={focusKey}
                                />
                                <Box sx={{ position: "sticky", bottom: 0, bgcolor: "background.paper", py: 1.5, mt: 1 }}>
                                    <Stack direction="row" spacing={1}>
                                        {hasSchedule && <Button onClick={() => setRebuilding(false)}>ביטול</Button>}
                                        <Button onClick={() => setPreview(null)}>חזרה לעריכה</Button>
                                        <Button
                                            variant="contained"
                                            color={preview.conflicts.length ? "warning" : "primary"}
                                            onClick={startCommit}
                                            disabled={mut.pending}
                                            startIcon={mut.pending ? <CircularProgress size={16} color="inherit" /> : undefined}
                                            data-testid="schedule-commit"
                                            sx={{ flex: 1, minHeight: 48 }}
                                        >
                                            {preview.conflicts.length ? "שמירה עם התנגשויות" : "שמירת לוח המשחקים"}
                                        </Button>
                                    </Stack>
                                </Box>
                            </>
                        )}
                    </Box>
                </Stack>
            )}

            <Dialog open={confirmCommit} onClose={() => setConfirmCommit(false)} dir="rtl" maxWidth="xs" fullWidth>
                <DialogTitle>{preview?.conflicts.length ? `לשמור לוח עם ${preview.conflicts.length} התנגשויות?` : "להחליף את לוח המשחקים?"}</DialogTitle>
                <DialogContent>
                    {preview?.conflicts.length ? <Typography variant="body2">אפשר לתקן ידנית אחר כך.</Typography> : null}
                    {hasSchedule && <Typography variant="body2">לוח המשחקים הקיים יוחלף. משחקים שכבר הסתיימו לא ישתנו.</Typography>}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmCommit(false)}>ביטול</Button>
                    <Button variant="contained" color="warning" onClick={() => void commit()} data-testid="schedule-commit-confirm">שמירה</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={!!moveConflict} onClose={() => setMoveConflict(null)} dir="rtl" maxWidth="xs" fullWidth data-testid="move-conflict-dialog">
                <DialogTitle>המיקום החדש יוצר התנגשות</DialogTitle>
                <DialogContent>
                    {describedMove.map((c, i) => (
                        <Box key={i} sx={{ mb: 1 }}>
                            <Typography variant="body2" fontWeight={700}>{c.title}</Typography>
                            <Typography variant="body2" color="text.secondary">{c.body}</Typography>
                        </Box>
                    ))}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setMoveConflict(null)}>ביטול</Button>
                    <Button variant="contained" color="warning" onClick={() => moveConflict && void move(moveConflict.key, moveConflict.iso, moveConflict.court, true)} data-testid="move-conflict-force">
                        שמירה בכל זאת
                    </Button>
                </DialogActions>
            </Dialog>

            {edit && (
                <MatchEditDialog
                    open
                    mode={edit.mode}
                    number={edit.number}
                    values={edit.values}
                    onChange={(values) => setEdit({ ...edit, values, conflicts: [] })}
                    teams={approved.map((x) => ({ id: x.id, name: x.name }))}
                    stages={sched.stages}
                    courts={courtNames}
                    saving={mut.pending}
                    conflicts={describedEdit}
                    errorText={edit.error}
                    canDelete={canDeleteMatch(edit.matchId)}
                    onSave={(force) => void saveEdit(force)}
                    onDelete={() => void deleteMatch()}
                    onClose={() => setEdit(null)}
                />
            )}
            <Snackbar open={toast !== null} autoHideDuration={4000} onClose={() => setToast(null)} message={toast ?? ""} />
            {t.status === "IN_PROGRESS" && (
                <ScoreEntrySheet
                    open={!!scoreMatch}
                    tournament={t}
                    match={scoreMatch}
                    onClose={() => setScoreMatch(null)}
                    onSaved={() => { setScoreMatch(null); void sched.reload(); }}
                />
            )}
        </Box>
    );
}
