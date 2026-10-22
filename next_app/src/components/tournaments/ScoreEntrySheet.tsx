"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Drawer from "@mui/material/Drawer";
import Snackbar from "@mui/material/Snackbar";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { useMatchResult, useTournamentSchedule } from "@/hooks/tournaments";
import { describeSlot, matchNumberMap } from "@/utils/tournament";
import {
    bestOfFor,
    buildResultInput,
    initScoreForm,
    isKnockoutMatch,
    needsPenalties,
    scoreErrorText,
    scoreFormDirty,
    validateScoreForm,
    type ScoreForm,
    type ScoreFormCtx,
} from "@/utils/tournamentManage";
import type { TournamentDetail, TournamentMatch } from "@/types/tournament";
import ScoreEntryView, { type ScoreSideInfo } from "./score/ScoreEntryView";
import ScoreStatsSection from "./score/ScoreStatsSection";

export interface ScoreEntrySheetProps {
    open: boolean;
    tournament: TournamentDetail;
    match: TournamentMatch | null;
    onClose: () => void;
    /** Called after a successful save with every match the server changed (this one plus advanced slots). */
    onSaved?: (changedMatchIds: string[]) => void;
}

function sideInfo(slot: TournamentMatch["home"], numbers: ReadonlyMap<string, number>): ScoreSideInfo {
    const view = describeSlot(slot, { matchNumberById: numbers });
    return { team: view.kind === "team" ? view.team : null, label: view.kind === "team" ? view.team.name : view.text, teamId: slot.teamId };
}

type Confirm = null | "undo" | "force" | "leave";

interface BodyProps extends Omit<ScoreEntrySheetProps, "open"> {
    match: TournamentMatch;
    onResult: (text: string) => void;
}

/** Everything that needs a mounted match. Remounted per match so the form always starts from the saved result. */
function SheetBody({ tournament, match, onClose, onSaved, onResult }: BodyProps) {
    const sport = tournament.sport;
    const bestOf = bestOfFor(tournament, match);
    const knockout = isKnockoutMatch(tournament, match);
    // The sheet follows the live schedule so a newer version (another scorekeeper) shows up before the save is rejected.
    const { matches, reload } = useTournamentSchedule(tournament.id, {}, { live: true });
    const latest = matches.find((m) => m.id === match.id) ?? match;
    const numbers = useMemo(() => matchNumberMap(matches.length ? matches : [match]), [matches, match]);

    const baseline = useRef<ScoreForm>(initScoreForm(match, sport));
    const baseVersion = useRef(match.version);
    const [form, setForm] = useState<ScoreForm>(baseline.current);
    const [showErrors, setShowErrors] = useState(false);
    const [statsOpen, setStatsOpen] = useState(false);
    const [forcePens, setForcePens] = useState(false);
    const [confirm, setConfirm] = useState<Confirm>(null);
    const [conflictDismissed, setConflictDismissed] = useState(false);

    const r = useMatchResult(tournament.id, match.id, latest.version);
    const { submit, rebase, reset, status, saving, conflict, downstream, errorCode } = r;

    const patch = useCallback((p: Partial<ScoreForm>) => setForm((f) => ({ ...f, ...p })), []);

    const home = sideInfo(latest.home, numbers);
    const away = sideInfo(latest.away, numbers);
    const penaltiesShown = needsPenalties(form, sport, knockout, forcePens || errorCode === "NEEDS_PENALTIES");
    const ctx: ScoreFormCtx = { sport, bestOf, knockout, homeTeamId: home.teamId, awayTeamId: away.teamId, penaltiesShown };
    const errors = validateScoreForm(form, ctx);

    const blockedText =
        tournament.status !== "IN_PROGRESS"
            ? "אפשר להזין תוצאות רק כשהטורניר מתקיים"
            : !home.teamId || !away.teamId
              ? "הקבוצות במשחק הזה עוד לא נקבעו"
              : null;

    // A newer version than the one this form started from = someone else saved (spec 12.6), even before we press save.
    const stale = latest.version > baseVersion.current;
    const conflictOpen = !conflictDismissed && (status === "VERSION_CONFLICT" || (stale && status !== "saved"));
    const theirsReady = !conflict?.currentVersion || latest.version >= conflict.currentVersion;
    useEffect(() => {
        if (status === "VERSION_CONFLICT") void reload();
    }, [status, reload]);

    const dirty = scoreFormDirty(form, baseline.current);
    const requestClose = () => (dirty && !saving ? setConfirm("leave") : onClose());

    const finish = useCallback(
        (res: Awaited<ReturnType<typeof submit>>, undo = false) => {
            if (!res) return;
            const ids = res.changedMatchIds ?? [];
            const advanced = ids.some((id) => id !== match.id);
            const winner = res.match.winnerTeamId === res.match.home.teamId ? res.match.home.team : res.match.away.team;
            let text = undo ? "המשחק הוחזר למתוכנן" : "התוצאה נשמרה";
            if (!undo && advanced && winner) text += ` · ${winner.name} עלתה לשלב הבא`;
            if (!undo && res.warnings?.length) text += " · סכום נתוני השחקנים גבוה מהתוצאה";
            onResult(text);
            onSaved?.(ids);
            onClose();
        },
        [match.id, onClose, onResult, onSaved]
    );

    const save = async (opts: { force?: boolean } = {}) => {
        setShowErrors(true);
        if (errors.length || saving) return;
        setConflictDismissed(false);
        finish(await submit(buildResultInput(form, ctx), opts));
    };

    const keepTheirs = () => {
        const next = initScoreForm(latest, sport);
        baseline.current = next;
        baseVersion.current = latest.version;
        setForm(next);
        setConflictDismissed(true);
        rebase(latest.version);
    };
    const keepMine = async () => {
        baseVersion.current = latest.version;
        rebase(latest.version);
        setConflictDismissed(true);
        finish(await submit(buildResultInput(form, ctx)));
    };

    const errorText =
        scoreErrorText(errorCode) ??
        (status === "error" && errorCode && errorCode !== "NEEDS_PENALTIES"
            ? typeof navigator !== "undefined" && navigator.onLine === false
                ? "אין חיבור לאינטרנט. מה שהזנתם נשמר כאן, נסו שוב."
                : "לא הצלחנו לשמור. נסו שוב."
            : null);

    const downstreamNumber = downstream?.matchId ? numbers.get(downstream.matchId) : undefined;
    const canUndo = latest.status === "LIVE" || latest.status === "FINISHED" || latest.status === "FORFEIT";

    return (
        <>
            <ScoreEntryView
                sport={sport}
                title={`#${match.number}`}
                home={home}
                away={away}
                form={form}
                onChange={(p) => {
                    if (downstream || status === "error") reset();
                    patch(p);
                }}
                bestOf={bestOf}
                penaltiesShown={penaltiesShown}
                errors={errors}
                showErrors={showErrors}
                saving={saving}
                errorText={errorText}
                conflict={conflictOpen ? { theirs: theirsReady ? { homeScore: latest.homeScore, awayScore: latest.awayScore, sets: latest.details?.sets ?? null } : null } : null}
                onKeepTheirs={keepTheirs}
                onKeepMine={keepMine}
                downstream={downstream ? { number: downstreamNumber, canForce: downstream.canForce } : null}
                onForce={() => setConfirm("force")}
                blockedText={blockedText}
                canUndo={canUndo}
                onUndo={() => setConfirm("undo")}
                onSave={() => void save()}
                onClose={requestClose}
                statsOpen={statsOpen}
                onToggleStats={() => setStatsOpen((v) => !v)}
                statsSlot={
                    sport === "TENNIS" ? undefined : (
                        <ScoreStatsSection
                            tournamentId={tournament.id}
                            match={latest}
                            sport={sport}
                            stats={form.stats}
                            onChange={(stats) => patch({ stats })}
                            homeScore={form.home}
                            awayScore={form.away}
                            disabled={saving}
                        />
                    )
                }
            />
            <Dialog open={confirm !== null} onClose={() => setConfirm(null)} dir="rtl" maxWidth="xs" fullWidth>
                <DialogTitle>
                    {confirm === "undo" ? "להחזיר למתוכנן?" : confirm === "force" ? "לשנות בכל זאת?" : "לצאת בלי לשמור?"}
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2">
                        {confirm === "undo"
                            ? "למחוק את התוצאה ולהחזיר את המשחק למתוכנן? קבוצות שעלו בזכות המשחק הזה יחזרו למקום פנוי."
                            : confirm === "force"
                              ? `התוצאה של ${downstreamNumber !== undefined ? `#${downstreamNumber}` : "המשחק הבא"} תישאר, אבל הקבוצה בו תוחלף. בדקו אותו אחר כך.`
                              : "השינויים שהזנתם לא יישמרו."}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirm(null)}>{confirm === "leave" ? "המשך עריכה" : "ביטול"}</Button>
                    <Button
                        color={confirm === "force" ? "warning" : "error"}
                        variant="contained"
                        data-testid="score-confirm"
                        onClick={async () => {
                            const c = confirm;
                            setConfirm(null);
                            if (c === "leave") onClose();
                            else if (c === "force") await save({ force: true });
                            else if (c === "undo") finish(await submit({ status: "SCHEDULED" }), true);
                        }}
                    >
                        {confirm === "undo" ? "החזרה" : confirm === "force" ? "שינוי בכל זאת" : "יציאה"}
                    </Button>
                </DialogActions>
            </Dialog>
            {errorCode === "NEEDS_PENALTIES" && !forcePens && <PenaltiesNudge onShow={() => setForcePens(true)} />}
        </>
    );
}

/** NEEDS_PENALTIES race: the server wants penalties although the client did not expect a draw. */
function PenaltiesNudge({ onShow }: { onShow: () => void }) {
    useEffect(onShow, [onShow]);
    return <Alert severity="info" sx={{ display: "none" }}>פנדלים</Alert>;
}

/**
 * Score entry for one tournament match (spec 12): a bottom sheet on phones, a dialog on desktop.
 * Thin container: fetching/saving via `useMatchResult`, all layout in `score/ScoreEntryView`.
 */
export default function ScoreEntrySheet({ open, tournament, match, onClose, onSaved }: ScoreEntrySheetProps) {
    const theme = useTheme();
    const phone = useMediaQuery(theme.breakpoints.down("sm"));
    const [toast, setToast] = useState<string | null>(null);
    const body =
        open && match ? (
            <SheetBody key={match.id} tournament={tournament} match={match} onClose={onClose} onSaved={onSaved} onResult={setToast} />
        ) : null;

    return (
        <>
            {phone ? (
                <Drawer
                    anchor="bottom"
                    open={open && !!match}
                    onClose={onClose}
                    PaperProps={{ sx: { height: "85dvh", borderTopLeftRadius: 20, borderTopRightRadius: 20 } }}
                    data-testid="score-sheet-drawer"
                >
                    {body}
                </Drawer>
            ) : (
                <Dialog open={open && !!match} onClose={onClose} maxWidth="sm" fullWidth dir="rtl" PaperProps={{ sx: { height: "min(720px, 90dvh)" } }}>
                    {body}
                </Dialog>
            )}
            <Snackbar
                open={toast !== null}
                autoHideDuration={4000}
                onClose={() => setToast(null)}
                message={toast ?? ""}
                data-testid="score-toast"
            />
        </>
    );
}
