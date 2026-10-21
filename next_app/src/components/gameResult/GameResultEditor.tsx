"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import { getStatDefs, MAX_TEAM_SCORE } from "@joinup/shared/matchStats";
import Avatar from "@/components/Avatar";
import { SPORT_EMOJI } from "@/utils/sports";
import { OUTCOME_LABEL_HE, formatStatParts } from "@/utils/matchResultFormat";
import type { GameResultData, GameResultRosterPlayer, PlayerTotalsWarning, SaveGameResultInput } from "@/types/matchResult";
import Stepper from "./Stepper";
import { outcomeSx, swatchSx } from "./outcomeSx";
import {
  EditorFormState, EditorTeam, MAX_TENNIS_SETS, NOTES_MAX, SIDE_LABEL_MAX, TENNIS_ERROR_HE,
  buildSaveInput, clampScore, initEditorState, isDirty, isFormValid, liveWarnings, tennisErrors,
} from "./resultEditorState";

export interface GameResultEditorProps {
  open: boolean;
  sport: string;
  gameTitle?: string;
  initial: GameResultData | null;
  roster: GameResultRosterPlayer[];
  rosterLoading?: boolean;
  teams: EditorTeam[];
  locked: boolean;
  lockedAt?: string | null;
  isAdmin: boolean;
  saving: boolean;
  /** Server soft warnings from the last save. */
  warnings: PlayerTotalsWarning[];
  /** Server error message / code from the last attempt. */
  error?: string | null;
  errorCode?: string | null;
  onSave: (body: SaveGameResultInput) => void;
  onDelete: () => void;
  onClose: () => void;
}

const SCORE_NOUN: Record<string, string> = { SOCCER: "שער", BASKETBALL: "נקודה", TENNIS: "נקודה" };
const SIDE_NAME = ["א", "ב"];

function outcomeLine(sport: string, form: EditorFormState): { outcome: "WIN" | "DRAW"; text: string } | null {
  if (sport === "TENNIS") {
    const t = tennisErrors(form.sets);
    if (t.winner === null) return null;
    return { outcome: "WIN", text: `מנצח: ${form.labels[t.winner]} (${t.setsWon[0]}–${t.setsWon[1]} במערכות)` };
  }
  const [a, b] = form.scores;
  if (a === b) return { outcome: "DRAW", text: OUTCOME_LABEL_HE.DRAW };
  return { outcome: "WIN", text: `${OUTCOME_LABEL_HE.WIN} ל${form.labels[a > b ? 0 : 1]}` };
}

export default function GameResultEditor(props: GameResultEditorProps) {
  const { open, sport, gameTitle, initial, roster, rosterLoading, teams, locked, lockedAt, isAdmin, saving, warnings, error, errorCode, onSave, onDelete, onClose } = props;
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const baseline = useRef<EditorFormState>(initEditorState(sport, initial, roster, teams));
  const [form, setForm] = useState<EditorFormState>(baseline.current);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "delete" | "leave">(null);
  const [showErrors, setShowErrors] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  // Re-seed whenever the editor is (re)opened, or the roster arrives while pristine.
  useEffect(() => {
    if (!open) return;
    const next = initEditorState(sport, initial, roster, teams);
    setForm((prev) => (isDirty(prev, baseline.current) ? prev : next));
    baseline.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, roster]);
  useEffect(() => {
    if (open) {
      setShowErrors(false);
      setExpanded(null);
    }
  }, [open]);
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [error]);

  const dirty = isDirty(form, baseline.current);
  const raced = errorCode === "RESULT_LOCKED" || (locked && !isAdmin);
  const defs = getStatDefs(sport);
  const quickKey = defs[0]?.key;
  const noun = SCORE_NOUN[sport] || "נקודה";
  const outcome = useMemo(() => outcomeLine(sport, form), [sport, form]);
  const warn = useMemo(() => liveWarnings(sport, form), [sport, form]);
  const tennis = useMemo(() => (sport === "TENNIS" ? tennisErrors(form.sets) : null), [sport, form.sets]);
  const valid = isFormValid(sport, form);

  const set = (patch: Partial<EditorFormState>) => setForm((f) => ({ ...f, ...patch }));
  const setPlayer = (userId: string, patch: Partial<EditorFormState["players"][string]>) =>
    setForm((f) => ({ ...f, players: { ...f.players, [userId]: { ...f.players[userId], ...patch } } }));
  const setStat = (userId: string, key: string, v: number, unique?: boolean) =>
    setForm((f) => {
      const players = { ...f.players };
      if (unique && v > 0) for (const id of Object.keys(players)) players[id] = { ...players[id], values: { ...players[id].values, [key]: 0 } };
      players[userId] = { ...players[userId], values: { ...players[userId].values, [key]: v } };
      return { ...f, players };
    });

  const requestClose = () => (dirty && !saving ? setConfirm("leave") : onClose());
  const submit = () => {
    setShowErrors(true);
    if (!valid || saving) return;
    onSave(buildSaveInput(sport, form));
  };

  const maxScore = (MAX_TEAM_SCORE as Record<string, number>)[sport] ?? 99;
  const sideLabel = (i: 0 | 1) => form.labels[i];

  const sideHeader = (i: 0 | 1) => {
    const team = teams.find((t) => t.id === form.teamIds[i]);
    return (
      <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
        <Box sx={swatchSx(team?.color, i === 0 ? "accent" : "neutral")} />
        {form.teamIds[i] ? (
          <Typography variant="subtitle1" fontWeight={600} data-testid={`result-editor-side-label-${i}`} sx={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}>
            {form.labels[i]}
          </Typography>
        ) : (
          <InputBase
            value={form.labels[i]}
            disabled={saving}
            placeholder="שם הצד"
            onChange={(e) => set({ labels: i === 0 ? [e.target.value, form.labels[1]] : [form.labels[0], e.target.value] })}
            inputProps={{ maxLength: SIDE_LABEL_MAX, "aria-label": "שם הצד", "data-testid": `result-editor-side-label-${i}` }}
            error={showErrors && !form.labels[i].trim()}
            sx={{ flex: 1, minWidth: 0, fontWeight: 600, borderBottom: "1px dashed", borderColor: "divider" }}
          />
        )}
      </Stack>
    );
  };

  const tennisSection = tennis && (
    <Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 72px 72px 40px", gap: 1, alignItems: "center", mb: 1 }}>
        <span />
        <Box>{sideHeader(0)}</Box>
        <Box>{sideHeader(1)}</Box>
        <span />
      </Box>
      {form.sets.map((s, i) => {
        const tiebreak = i === 2 && Math.max(s[0], s[1]) >= 10;
        const err = tennis.rows[i];
        return (
          <Box key={i} data-testid={`result-editor-set-row-${i}`} sx={{ mb: 1 }}>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 72px 72px 40px", gap: 1, alignItems: "center" }}>
              <Typography variant="body2" color="text.secondary">
                {`מערכה ${i + 1}${tiebreak ? " · שובר שוויון" : ""}`}
              </Typography>
              {([0, 1] as const).map((o) => (
                <TextField
                  key={o}
                  size="small"
                  type="number"
                  disabled={saving}
                  value={s[o]}
                  error={!!err}
                  onChange={(e) => {
                    const n = Math.max(0, Math.min(99, parseInt(e.target.value || "0", 10) || 0));
                    set({ sets: form.sets.map((row, j) => (j === i ? (o === 0 ? [n, row[1]] : [row[0], n]) : row)) as Array<[number, number]> });
                  }}
                  inputProps={{ inputMode: "numeric", min: 0, "aria-label": `${sideLabel(o)} מערכה ${i + 1}`, "data-testid": `result-editor-set-${i}-${o}`, style: { textAlign: "center" } }}
                />
              ))}
              {i > 0 ? (
                <IconButton size="small" aria-label={`הסרת מערכה ${i + 1}`} disabled={saving} data-testid={`result-editor-set-remove-${i}`} onClick={() => set({ sets: form.sets.filter((_, j) => j !== i) })}>
                  <CloseRoundedIcon fontSize="small" />
                </IconButton>
              ) : <span />}
            </Box>
            {err && <Typography variant="caption" color="error.main">{TENNIS_ERROR_HE[err]}</Typography>}
          </Box>
        );
      })}
      {tennis.match && showErrors && <Typography variant="caption" color="error.main" display="block">{TENNIS_ERROR_HE[tennis.match]}</Typography>}
      <Button
        size="small" variant="outlined" startIcon={<AddRoundedIcon />} sx={{ borderRadius: 999, mt: 0.5 }}
        disabled={saving || form.sets.length >= MAX_TENNIS_SETS} data-testid="result-editor-set-add"
        onClick={() => set({ sets: [...form.sets, [0, 0]] })}
      >
        הוספת מערכה
      </Button>
    </Box>
  );

  const teamSection = (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
      {([0, 1] as const).map((i) => (
        <Box key={i} sx={{ bgcolor: "action.hover", borderRadius: 4, p: 1.5 }}>
          {sideHeader(i)}
          <Box mt={1}>
            <Stepper
              value={form.scores[i]} max={maxScore} disabled={saving} repeat={sport === "BASKETBALL"} editable={sport === "BASKETBALL"}
              onChange={(n) => set({ scores: i === 0 ? [clampScore(sport, n), form.scores[1]] : [form.scores[0], clampScore(sport, n)] })}
              incLabel={`הוספת ${noun} ל${sideLabel(i)}`} decLabel={`הפחתת ${noun} ל${sideLabel(i)}`}
              testIds={{ inc: `result-editor-score-inc-${i}`, dec: `result-editor-score-dec-${i}`, value: `result-editor-score-${i}` }}
            />
            {sport === "BASKETBALL" && (
              <Stack direction="row" spacing={1} justifyContent="center" mt={1}>
                {[2, 3].map((n) => (
                  <Chip key={n} size="small" label={`+${n}`} disabled={saving} onClick={() => set({ scores: i === 0 ? [clampScore(sport, form.scores[0] + n), form.scores[1]] : [form.scores[0], clampScore(sport, form.scores[1] + n)] })} />
                ))}
              </Stack>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );

  const groups: Array<{ key: string; order: 0 | 1 | null; players: GameResultRosterPlayer[] }> = [0, 1, null].map((o) => ({
    key: String(o),
    order: o as 0 | 1 | null,
    players: roster.filter((p) => (form.players[p.userId]?.sideOrder ?? null) === o),
  }));

  const playerRow = (p: GameResultRosterPlayer) => {
    const st = form.players[p.userId] || { sideOrder: null, values: {} };
    const open = expanded === p.userId;
    const rest = defs.filter((d) => d.key !== quickKey);
    const summary = formatStatParts(sport, Object.fromEntries(Object.entries(st.values).filter(([k]) => k !== quickKey)));
    const quick = defs[0];
    return (
      <Box key={p.userId} data-testid={`result-editor-player-${p.userId}`} sx={{ borderBottom: 1, borderColor: "divider", py: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1.25}>
          <Avatar src={p.imageUrl} alt={p.name} name={p.name} size="md" />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="body2" fontWeight={600} title={p.name} sx={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}>{p.name}</Typography>
            {!open && summary.length > 0 && <Typography variant="caption" color="text.secondary">{summary.join(" · ")}</Typography>}
          </Box>
          {quick && (
            <Stepper
              size={36} valueFontSize={18} max={quick.max} value={st.values[quick.key] ?? 0} disabled={saving} repeat={sport === "BASKETBALL"}
              onChange={(n) => setStat(p.userId, quick.key, n)}
              incLabel={`הוספת ${quick.he} ל${p.name}`} decLabel={`הפחתת ${quick.he} מ${p.name}`}
              testIds={{ inc: `result-editor-stat-inc-${p.userId}-${quick.key}`, dec: `result-editor-stat-dec-${p.userId}-${quick.key}`, value: `result-editor-stat-${p.userId}-${quick.key}` }}
            />
          )}
          <IconButton aria-label={open ? "סגירה" : "פתיחת סטטיסטיקות"} aria-expanded={open} onClick={() => setExpanded(open ? null : p.userId)} sx={{ transform: open ? "rotate(180deg)" : "none" }}>
            <ExpandMoreRoundedIcon />
          </IconButton>
        </Stack>
        <ToggleButtonGroup
          size="small" exclusive disabled={saving} value={st.sideOrder} sx={{ mt: 0.75 }}
          onChange={(_, v) => v !== null && setPlayer(p.userId, { sideOrder: v })}
          aria-label={`שיבוץ ${p.name}`}
        >
          {([0, 1] as const).map((o) => (
            <ToggleButton key={o} value={o} data-testid={`result-editor-player-side-${p.userId}-${o}`} sx={{ maxWidth: 120, py: 0.25 }}>
              <Typography variant="caption" noWrap>{form.labels[o] || `צד ${SIDE_NAME[o]}`}</Typography>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {open && (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "1fr 1fr 1fr" }, gap: 1.5, mt: 1.5 }}>
            {rest.map((d) =>
              d.max === 1 ? (
                <Box key={d.key} sx={{ gridColumn: "1 / -1" }}>
                  <Chip
                    clickable disabled={saving}
                    color={(st.values[d.key] ?? 0) > 0 ? "primary" : "default"}
                    icon={d.key === "mvp" ? <StarRoundedIcon /> : undefined}
                    label={d.he}
                    data-testid={`result-editor-stat-${p.userId}-${d.key}`}
                    onClick={() => setStat(p.userId, d.key, (st.values[d.key] ?? 0) > 0 ? 0 : 1, d.key === "mvp")}
                  />
                </Box>
              ) : (
                <Box key={d.key}>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    {(d.key === "yellowCards" || d.key === "redCards") && (
                      <Box aria-hidden sx={{ width: 8, height: 11, borderRadius: 0.5, bgcolor: d.key === "yellowCards" ? "warning.main" : "error.main" }} />
                    )}
                    <Typography variant="caption" color="text.secondary">{d.he}</Typography>
                  </Stack>
                  <Stepper
                    size={36} valueFontSize={18} max={d.max} value={st.values[d.key] ?? 0} disabled={saving}
                    onChange={(n) => setStat(p.userId, d.key, n)}
                    incLabel={`הוספת ${d.he} ל${p.name}`} decLabel={`הפחתת ${d.he} מ${p.name}`}
                    testIds={{ inc: `result-editor-stat-inc-${p.userId}-${d.key}`, dec: `result-editor-stat-dec-${p.userId}-${d.key}`, value: `result-editor-stat-${p.userId}-${d.key}` }}
                  />
                </Box>
              )
            )}
          </Box>
        )}
      </Box>
    );
  };

  const warningTexts = [
    ...warn.map((w) => `סכום ה${defs.find((d) => d.key === w.key)?.he ?? ""} של שחקני ${form.labels[w.sideOrder]} (${w.sum}) גבוה מהתוצאה (${w.teamScore}). אפשר לשמור בכל זאת.`),
    ...(warn.length === 0
      ? warnings.map((w) => `סכום ה${defs.find((d) => d.key === w.key)?.he ?? ""} של שחקני ${form.labels[w.sideOrder] ?? ""} (${w.sum}) גבוה מהתוצאה (${w.teamScore}). אפשר לשמור בכל זאת.`)
      : []),
  ];
  const warningAlert = warningTexts.length > 0 && (
    <Alert severity="warning" variant="standard" data-testid="result-editor-warning" sx={{ mb: 1.5 }}>
      {warningTexts.map((t) => <div key={t}>{t}</div>)}
    </Alert>
  );

  const editableUntil = lockedAt ? `אפשר לערוך עד ${new Date(lockedAt).toLocaleDateString("he-IL")}` : "אפשר לערוך 7 ימים מהשמירה";
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const errorText = error
    ? offline ? "אין חיבור לאינטרנט. מה שהזנתם נשמר כאן, נסו שוב." : "לא הצלחנו לשמור. בדקו את השדות המסומנים."
    : null;

  return (
    <>
      <Dialog
        open={open}
        onClose={saving ? undefined : requestClose}
        disableEscapeKeyDown={saving}
        fullScreen={fullScreen}
        maxWidth="sm"
        fullWidth
        dir="rtl"
        data-testid="result-editor"
        aria-labelledby="result-editor-title"
      >
        <DialogTitle id="result-editor-title" component="div" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <IconButton aria-label="סגירה" onClick={requestClose} disabled={saving} data-testid="result-editor-close" edge="start">
            <CloseRoundedIcon />
          </IconButton>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" fontWeight={800} component="h2">תוצאת המשחק</Typography>
            <Typography variant="caption" color="text.secondary" noWrap display="block">
              {SPORT_EMOJI[sport as keyof typeof SPORT_EMOJI] ?? ""} {gameTitle}
            </Typography>
          </Box>
        </DialogTitle>

        <DialogContent dividers>
          {isAdmin && locked && <Alert severity="info" sx={{ mb: 1.5 }}>עריכה כמנהל מערכת. התוצאה נעולה למנהלי המשחק.</Alert>}
          {errorText && (
            <Alert ref={errorRef} severity="error" sx={{ mb: 1.5 }} data-testid="result-editor-error">
              {errorText}
            </Alert>
          )}

          <Box sx={{ mb: 2 }}>{sport === "TENNIS" ? tennisSection : teamSection}</Box>
          {outcome && (
            <Stack alignItems="center" mb={2}>
              <Chip size="small" label={outcome.text} sx={[{ fontWeight: 700, maxWidth: "100%" }, outcomeSx(outcome.outcome)]} />
            </Stack>
          )}

          <Typography variant="subtitle1" fontWeight={800}>שחקנים וסטטיסטיקות</Typography>
          <Typography variant="caption" color="text.secondary" display="block" mb={1}>לא חובה. מלאו רק מה שזוכרים.</Typography>
          {warningAlert}
          {rosterLoading ? (
            [0, 1, 2, 3].map((k) => <Skeleton key={k} variant="rounded" height={56} sx={{ mb: 1 }} />)
          ) : roster.length === 0 ? (
            <Typography variant="body2" color="text.secondary">אין שחקנים מאושרים במשחק הזה. אפשר לשמור רק את התוצאה.</Typography>
          ) : (
            groups.map((g) =>
              g.players.length === 0 ? null : (
                <Box key={g.key} mb={1.5}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ position: "sticky", top: 0, bgcolor: "background.paper", zIndex: 1, py: 0.5 }}>
                    <Box sx={swatchSx(g.order === null ? null : teams.find((t) => t.id === form.teamIds[g.order as 0 | 1])?.color, g.order === 0 ? "accent" : "neutral")} />
                    <Typography variant="subtitle2" fontWeight={700}>
                      {g.order === null ? "ללא שיבוץ" : form.labels[g.order]} ({g.players.length})
                    </Typography>
                  </Stack>
                  {g.players.map(playerRow)}
                </Box>
              )
            )
          )}

          <TextField
            fullWidth multiline minRows={3} sx={{ mt: 2 }} disabled={saving}
            label="הערות (לא חובה)" placeholder="משהו שקרה במשחק ששווה לזכור"
            value={form.notes} onChange={(e) => set({ notes: e.target.value.slice(0, NOTES_MAX) })}
            inputProps={{ maxLength: NOTES_MAX, "data-testid": "result-editor-notes" }}
            helperText={`${form.notes.length}/${NOTES_MAX}`}
            FormHelperTextProps={{ sx: { textAlign: "end" } }}
          />

          {initial && !raced && (
            <Button color="error" startIcon={<DeleteOutlineRoundedIcon />} disabled={saving} onClick={() => setConfirm("delete")} data-testid="result-editor-delete" sx={{ mt: 2 }}>
              מחיקת התוצאה
            </Button>
          )}
        </DialogContent>

        <DialogActions sx={{ flexDirection: "column", alignItems: "stretch", gap: 0.5, p: 2 }}>
          {raced ? (
            <Alert severity="info" data-testid="result-editor-locked" action={<Button color="inherit" size="small" onClick={onClose}>סגירה</Button>}>
              העריכה נסגרה. עברו 7 ימים מאז שהתוצאה הוזנה.
            </Alert>
          ) : (
            <>
              {warningTexts.length > 0 && <Typography variant="caption" color="warning.main">{warningTexts[0]}</Typography>}
              <Button
                variant="contained" size="large" onClick={submit} disabled={saving || (showErrors && !valid)}
                startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined}
                data-testid="result-editor-save"
              >
                {saving ? "שומר…" : "שמירת תוצאה"}
              </Button>
              <Typography variant="caption" color="text.secondary" textAlign="center">{editableUntil}</Typography>
            </>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} dir="rtl" maxWidth="xs" fullWidth>
        <DialogTitle>{confirm === "delete" ? "למחוק את התוצאה?" : "לצאת בלי לשמור?"}</DialogTitle>
        {confirm === "delete" && (
          <DialogContent>
            <Typography variant="body2">התוצאה והסטטיסטיקות של כל השחקנים במשחק יימחקו. אי אפשר לשחזר.</Typography>
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>{confirm === "delete" ? "ביטול" : "המשך עריכה"}</Button>
          <Button
            color="error" variant="contained"
            onClick={() => {
              const c = confirm;
              setConfirm(null);
              if (c === "delete") onDelete();
              else onClose();
            }}
          >
            {confirm === "delete" ? "מחיקה" : "יציאה"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
