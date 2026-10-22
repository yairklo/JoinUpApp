"use client";

import { useState, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import RemoveRoundedIcon from "@mui/icons-material/RemoveRounded";
import ReportProblemRoundedIcon from "@mui/icons-material/ReportProblemRounded";
import TeamBadge from "../TeamBadge";
import ScoreCluster from "../ScoreCluster";
import {
    SCORE_ERROR_HE,
    clampScore,
    maxScoreFor,
    saveLabel,
    tennisCheck,
    type ScoreForm,
    type ScoreFormError,
    type ScoreStatus,
} from "@/utils/tournamentManage";
import type { TeamLite } from "@/types/tournament";

export interface ScoreSideInfo {
    team: TeamLite | null;
    /** Name, or the placeholder text. */
    label: string;
    teamId: string | null;
}

export interface ScoreConflictView {
    /** Newer saved values. `null` while the refetch is in flight. */
    theirs: { homeScore: number | null; awayScore: number | null; sets?: ReadonlyArray<readonly [number, number]> | null } | null;
}

export interface ScoreEntryViewProps {
    sport: string;
    title: string;
    home: ScoreSideInfo;
    away: ScoreSideInfo;
    form: ScoreForm;
    onChange: (patch: Partial<ScoreForm>) => void;
    bestOf: number;
    penaltiesShown: boolean;
    errors: ScoreFormError[];
    showErrors: boolean;
    saving: boolean;
    /** Top alert (validation, offline, not-in-progress...). */
    errorText?: string | null;
    /** Soft warning lines (PLAYER_SUM_EXCEEDS_SCORE). */
    warningTexts?: string[];
    conflict?: ScoreConflictView | null;
    onKeepTheirs?: () => void;
    onKeepMine?: () => void;
    downstream?: { number?: number; canForce: boolean } | null;
    onForce?: () => void;
    /** Info instead of controls: unknown teams / not in progress. */
    blockedText?: string | null;
    canUndo: boolean;
    onUndo: () => void;
    onSave: () => void;
    onClose: () => void;
    /** Stats section (collapsed by default) rendered by the container. */
    statsSlot?: ReactNode;
    statsOpen: boolean;
    onToggleStats: () => void;
}

const BTN = 56;
const STATUS_LABEL: Record<ScoreStatus, string> = { LIVE: "חי", FINISHED: "הסתיים", FORFEIT: "טכני" };

function BigStepper({
    side,
    sport,
    value,
    onChange,
    disabled,
    label,
}: {
    side: "home" | "away";
    sport: string;
    value: number;
    onChange: (n: number) => void;
    disabled: boolean;
    label: string;
}) {
    const [typing, setTyping] = useState(false);
    const noun = sport === "SOCCER" ? "שער" : "נקודה";
    const max = maxScoreFor(sport);
    const sx = { width: BTN, height: BTN, border: "1px solid", borderColor: "divider" } as const;
    return (
        <Stack alignItems="center" spacing={1} sx={{ flex: 1, minWidth: 0 }}>
            <IconButton
                aria-label={`הוספת ${noun} ל${label}`}
                disabled={disabled || value >= max}
                onClick={() => onChange(clampScore(sport, value + 1))}
                data-testid={`score-inc-${side}`}
                sx={sx}
            >
                <AddRoundedIcon />
            </IconButton>
            {typing ? (
                <InputBase
                    autoFocus
                    type="number"
                    value={value}
                    onChange={(e) => onChange(clampScore(sport, parseInt(e.target.value || "0", 10) || 0))}
                    onBlur={() => setTyping(false)}
                    onKeyDown={(e) => e.key === "Enter" && setTyping(false)}
                    inputProps={{ inputMode: "numeric", min: 0, max, "aria-label": `${noun} ${label}`, style: { textAlign: "center" } }}
                    sx={{ width: 80, fontSize: 40, fontWeight: 800 }}
                />
            ) : (
                <Box
                    component="button"
                    type="button"
                    onClick={() => !disabled && setTyping(true)}
                    aria-label={`${label}: ${value}. לחיצה להקלדה`}
                    data-testid={`score-${side}`}
                    sx={{
                        all: "unset",
                        cursor: "text",
                        fontSize: 40,
                        lineHeight: 1.2,
                        fontWeight: 800,
                        fontVariantNumeric: "tabular-nums",
                        minWidth: 56,
                        textAlign: "center",
                    }}
                >
                    {value}
                </Box>
            )}
            <IconButton
                aria-label={`הפחתת ${noun} ל${label}`}
                disabled={disabled || value <= 0}
                onClick={() => onChange(clampScore(sport, value - 1))}
                data-testid={`score-dec-${side}`}
                sx={sx}
            >
                <RemoveRoundedIcon />
            </IconButton>
            {sport === "BASKETBALL" && (
                <Stack direction="row" spacing={0.75}>
                    {[2, 3].map((n) => (
                        <Chip
                            key={n}
                            size="small"
                            label={`+${n}`}
                            disabled={disabled}
                            onClick={() => onChange(clampScore(sport, value + n))}
                            data-testid={`score-quick-${n}-${side}`}
                            sx={{ height: 36, minWidth: 44 }}
                        />
                    ))}
                </Stack>
            )}
        </Stack>
    );
}

export function SmallStepper({
    value,
    onChange,
    disabled,
    incLabel,
    decLabel,
    testId,
}: {
    value: number;
    onChange: (n: number) => void;
    disabled: boolean;
    incLabel: string;
    decLabel: string;
    testId: string;
}) {
    const sx = { width: 44, height: 44, border: "1px solid", borderColor: "divider" } as const;
    return (
        <Stack direction="row" alignItems="center" spacing={1}>
            <IconButton aria-label={decLabel} disabled={disabled || value <= 0} onClick={() => onChange(Math.max(0, value - 1))} sx={sx} data-testid={`${testId}-dec`}>
                <RemoveRoundedIcon fontSize="small" />
            </IconButton>
            <Typography sx={{ minWidth: 28, textAlign: "center", fontWeight: 800, fontVariantNumeric: "tabular-nums" }} data-testid={testId}>
                {value}
            </Typography>
            <IconButton aria-label={incLabel} disabled={disabled || value >= 99} onClick={() => onChange(Math.min(99, value + 1))} sx={sx} data-testid={`${testId}-inc`}>
                <AddRoundedIcon fontSize="small" />
            </IconButton>
        </Stack>
    );
}

/** Presentational body of the score sheet: header, scrollable content and the sticky save bar (spec 12.2). */
export default function ScoreEntryView(p: ScoreEntryViewProps) {
    const { form, sport, saving, home, away } = p;
    const tennis = sport === "TENNIS" ? tennisCheck(form.sets, p.bestOf) : null;
    const has = (e: ScoreFormError) => p.showErrors && p.errors.includes(e);
    const controlsHidden = !!p.blockedText;
    const forfeitWinnerLabel = form.forfeitBy === home.teamId ? away.label : form.forfeitBy === away.teamId ? home.label : null;

    const sideHead = (s: ScoreSideInfo, testId: string) => (
        <Box sx={{ flex: 1, minWidth: 0 }} data-testid={testId}>
            <TeamBadge team={s.team} fallbackName={s.label} lines={2} placeholder={!s.team} />
        </Box>
    );

    const setRows = tennis && (
        <Box>
            {form.sets.map((s, i) => {
                const err = tennis.rows[i];
                return (
                    <Box key={i} sx={{ mb: 1 }}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                            <Typography variant="body2" color="text.secondary" sx={{ width: 64 }}>
                                {`מערכה ${i + 1}`}
                            </Typography>
                            {(["home", "away"] as const).map((side, o) => (
                                <TextField
                                    key={side}
                                    type="number"
                                    disabled={saving}
                                    value={s[o]}
                                    error={!!err}
                                    onChange={(e) => {
                                        const n = Math.max(0, Math.min(99, parseInt(e.target.value || "0", 10) || 0));
                                        p.onChange({
                                            sets: form.sets.map((row, j) =>
                                                j === i ? (o === 0 ? [n, row[1]] : [row[0], n]) : row
                                            ) as Array<[number, number]>,
                                        });
                                    }}
                                    inputProps={{
                                        inputMode: "numeric",
                                        min: 0,
                                        "aria-label": `${side === "home" ? home.label : away.label} מערכה ${i + 1}`,
                                        "data-testid": `score-set-${i}-${side}`,
                                        style: { textAlign: "center", height: 48, padding: "0 8px" },
                                    }}
                                    sx={{ width: 84 }}
                                />
                            ))}
                            {i > 0 && (
                                <IconButton
                                    aria-label={`הסרת מערכה ${i + 1}`}
                                    disabled={saving}
                                    onClick={() => p.onChange({ sets: form.sets.filter((_, j) => j !== i) })}
                                >
                                    <CloseRoundedIcon fontSize="small" />
                                </IconButton>
                            )}
                        </Stack>
                        {err && <Typography variant="caption" color="error.main">תוצאת מערכה לא תקינה (לדוגמה 6–4, 7–5, 7–6)</Typography>}
                    </Box>
                );
            })}
            {form.sets.length < p.bestOf && (
                <Button size="small" variant="outlined" startIcon={<AddRoundedIcon />} disabled={saving} onClick={() => p.onChange({ sets: [...form.sets, [0, 0]] })} sx={{ borderRadius: 999 }} data-testid="score-set-add">
                    הוספת מערכה
                </Button>
            )}
            {tennis.winner !== null && (
                <Typography variant="body2" fontWeight={700} sx={{ mt: 1 }} data-testid="score-tennis-winner">
                    {`מנצחת: ${tennis.winner === 0 ? home.label : away.label} (${tennis.setsWon[0]}–${tennis.setsWon[1]} במערכות)`}
                </Typography>
            )}
            {has("TENNIS_SETS") && <Typography variant="caption" color="error.main" display="block" data-testid="score-error-tennis">{SCORE_ERROR_HE.TENNIS_SETS}</Typography>}
        </Box>
    );

    return (
        <Box data-testid="score-sheet" dir="rtl" sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
            <Stack direction="row" alignItems="center" sx={{ px: 1, py: 0.5, borderBottom: 1, borderColor: "divider" }}>
                <IconButton aria-label="סגירה" onClick={p.onClose} disabled={saving} data-testid="score-sheet-close" edge="start" sx={{ width: 44, height: 44 }}>
                    <CloseRoundedIcon />
                </IconButton>
                <Typography variant="subtitle1" fontWeight={800} sx={{ flex: 1, textAlign: "center", pe: 5.5 }} noWrap>
                    {p.title}
                </Typography>
            </Stack>

            <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 2, py: 1.5 }}>
                {p.blockedText ? (
                    <Alert severity="info" data-testid="score-blocked">{p.blockedText}</Alert>
                ) : null}

                {p.errorText && !controlsHidden && (
                    <Alert severity="error" sx={{ mb: 1.5 }} data-testid="score-error">{p.errorText}</Alert>
                )}

                {p.conflict && !controlsHidden && (
                    <Box role="alert" data-testid="score-conflict" sx={{ mb: 1.5, p: 1.5, borderRadius: 3, bgcolor: "warning.light", color: "warning.contrastText" }}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                            <ReportProblemRoundedIcon fontSize="small" />
                            <Typography variant="subtitle2" fontWeight={800}>מישהו אחר עדכן את התוצאה</Typography>
                        </Stack>
                        {p.conflict.theirs ? (
                            <Stack spacing={0.5} sx={{ mb: 1 }}>
                                <Stack direction="row" alignItems="center" spacing={1}>
                                    <Typography variant="caption" sx={{ width: 44 }}>עכשיו:</Typography>
                                    <ScoreCluster homeScore={p.conflict.theirs.homeScore} awayScore={p.conflict.theirs.awayScore} sets={p.conflict.theirs.sets} size="sm" testId="score-conflict-theirs" />
                                </Stack>
                                <Stack direction="row" alignItems="center" spacing={1}>
                                    <Typography variant="caption" sx={{ width: 44 }}>שלך:</Typography>
                                    <ScoreCluster homeScore={form.home} awayScore={form.away} sets={sport === "TENNIS" ? form.sets : null} size="sm" testId="score-conflict-mine" />
                                </Stack>
                            </Stack>
                        ) : (
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                                <CircularProgress size={14} color="inherit" />
                                <Typography variant="caption">טוענים את הערכים העדכניים…</Typography>
                            </Stack>
                        )}
                        <Stack direction="row" spacing={1}>
                            <Button size="small" variant="outlined" color="inherit" onClick={p.onKeepTheirs} disabled={!p.conflict.theirs || saving} data-testid="score-conflict-keep-theirs">
                                להשאיר את שלהם
                            </Button>
                            <Button size="small" variant="contained" color="inherit" onClick={p.onKeepMine} disabled={!p.conflict.theirs || saving} data-testid="score-conflict-keep-mine" sx={{ color: "text.primary" }}>
                                לשמור את שלי
                            </Button>
                        </Stack>
                    </Box>
                )}

                {!controlsHidden && (
                    <>
                        <Stack direction="row" spacing={2} sx={{ mb: 1.5 }}>
                            {sideHead(home, "score-team-home")}
                            {sideHead(away, "score-team-away")}
                        </Stack>

                        {form.status === "FORFEIT" ? (
                            <Box sx={{ mb: 2 }} data-testid="score-forfeit">
                                <Typography variant="body2" fontWeight={700} sx={{ mb: 0.75 }}>מי הפסידה טכנית?</Typography>
                                <ToggleButtonGroup
                                    exclusive
                                    fullWidth
                                    value={form.forfeitBy}
                                    onChange={(_, v) => v && p.onChange({ forfeitBy: v })}
                                    aria-label="מי הפסידה טכנית"
                                >
                                    {[home, away].map((s) => (
                                        <ToggleButton key={s.teamId ?? s.label} value={s.teamId ?? ""} disabled={saving || !s.teamId} data-testid={`score-forfeit-by-${s.teamId}`} sx={{ minHeight: 48 }}>
                                            <Typography variant="body2" noWrap>{s.label}</Typography>
                                        </ToggleButton>
                                    ))}
                                </ToggleButtonGroup>
                                {forfeitWinnerLabel && (
                                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.75 }}>
                                        ניצחון טכני ל{forfeitWinnerLabel}
                                    </Typography>
                                )}
                                {has("FORFEIT_TEAM") && <Typography variant="caption" color="error.main">{SCORE_ERROR_HE.FORFEIT_TEAM}</Typography>}
                            </Box>
                        ) : sport === "TENNIS" ? (
                            <Box sx={{ mb: 2 }}>{setRows}</Box>
                        ) : (
                            <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ mb: 2 }}>
                                <BigStepper side="home" sport={sport} value={form.home} onChange={(n) => p.onChange({ home: n })} disabled={saving} label={home.label} />
                                <Typography sx={{ fontSize: 32, fontWeight: 800, pt: 8.5, color: "text.secondary" }} aria-hidden>:</Typography>
                                <BigStepper side="away" sport={sport} value={form.away} onChange={(n) => p.onChange({ away: n })} disabled={saving} label={away.label} />
                            </Stack>
                        )}

                        <ToggleButtonGroup
                            exclusive
                            fullWidth
                            value={form.status}
                            onChange={(_, v) => v && p.onChange({ status: v as ScoreStatus })}
                            aria-label="מצב המשחק"
                            sx={{ mb: 2 }}
                        >
                            {(["LIVE", "FINISHED", "FORFEIT"] as const).map((s) => (
                                <ToggleButton key={s} value={s} disabled={saving} data-testid={`score-status-${s}`} sx={{ minHeight: 48, fontWeight: 700 }}>
                                    {STATUS_LABEL[s]}
                                </ToggleButton>
                            ))}
                        </ToggleButtonGroup>

                        {p.penaltiesShown && form.status === "FINISHED" && (
                            <Box sx={{ mb: 2 }} data-testid="score-penalties">
                                <Typography variant="body2" fontWeight={700}>פנדלים</Typography>
                                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                                    תיקו בנוקאאוט. הזינו פנדלים כדי לקבוע מי עולה.
                                </Typography>
                                <Stack direction="row" justifyContent="space-between">
                                    <SmallStepper value={form.penHome} onChange={(n) => p.onChange({ penHome: n })} disabled={saving} incLabel={`הוספת פנדל ל${home.label}`} decLabel={`הפחתת פנדל ל${home.label}`} testId="score-penalties-home" />
                                    <SmallStepper value={form.penAway} onChange={(n) => p.onChange({ penAway: n })} disabled={saving} incLabel={`הוספת פנדל ל${away.label}`} decLabel={`הפחתת פנדל ל${away.label}`} testId="score-penalties-away" />
                                </Stack>
                                {has("PENALTIES") && <Typography variant="caption" color="error.main">{SCORE_ERROR_HE.PENALTIES}</Typography>}
                            </Box>
                        )}

                        {p.statsSlot && form.status === "FINISHED" && (
                            <Box sx={{ mb: 2 }}>
                                <Button onClick={p.onToggleStats} aria-expanded={p.statsOpen} data-testid="score-stats-toggle" sx={{ px: 0, fontWeight: 700 }}>
                                    {p.statsOpen ? "▾" : "▸"} סטטיסטיקות שחקנים (לא חובה)
                                </Button>
                                {p.statsOpen && p.statsSlot}
                            </Box>
                        )}

                        {p.warningTexts && p.warningTexts.length > 0 && (
                            <Alert severity="warning" sx={{ mb: 1.5 }} data-testid="score-warning">
                                {p.warningTexts.map((t) => <div key={t}>{t}</div>)}
                            </Alert>
                        )}

                        {p.downstream && (
                            <Box role="alert" data-testid="score-downstream-warning" sx={{ mb: 1.5, p: 1.5, borderRadius: 3, bgcolor: "action.hover", border: 1, borderColor: "warning.main" }}>
                                <Typography variant="subtitle2" fontWeight={800}>המשחק הבא כבר הסתיים</Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ my: 0.5 }}>
                                    {p.downstream.number !== undefined
                                        ? `שינוי התוצאה כאן משנה מי עלתה ל-#${p.downstream.number}, שכבר שוחק.`
                                        : "שינוי התוצאה כאן משנה מי עלתה למשחק הבא, שכבר שוחק."}
                                </Typography>
                                {p.downstream.canForce ? (
                                    <Button size="small" variant="outlined" color="warning" onClick={p.onForce} disabled={saving} data-testid="score-force">
                                        שינוי בכל זאת
                                    </Button>
                                ) : (
                                    <Typography variant="caption" color="text.secondary">רק מארגן הטורניר יכול לשנות את זה</Typography>
                                )}
                            </Box>
                        )}

                        {p.canUndo && (
                            <Button color="error" size="small" onClick={p.onUndo} disabled={saving} data-testid="score-undo" sx={{ px: 0 }}>
                                החזרה ל״מתוכנן״
                            </Button>
                        )}
                    </>
                )}
            </Box>

            <Box sx={{ p: 2, pb: "max(16px, env(safe-area-inset-bottom))", borderTop: 1, borderColor: "divider", bgcolor: "background.paper" }}>
                {controlsHidden ? (
                    <Button fullWidth variant="outlined" size="large" onClick={p.onClose} data-testid="score-blocked-close" sx={{ minHeight: 56 }}>סגירה</Button>
                ) : (
                    <Button
                        fullWidth
                        variant="contained"
                        size="large"
                        onClick={p.onSave}
                        disabled={saving}
                        startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined}
                        data-testid="score-save"
                        sx={{ minHeight: 56, fontWeight: 800 }}
                    >
                        {saving ? "שומר…" : saveLabel(form.status)}
                    </Button>
                )}
            </Box>
        </Box>
    );
}
