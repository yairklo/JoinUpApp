"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { MAX_TEAM_SCORE } from "@joinup/shared/matchStats";
import {
  appendEveningRound,
  eveningFormErrors,
  removeEveningRound,
  rosterFromTeams,
  setEveningLineupMode,
  summarizeEvening,
  toEveningResultBody,
  type EveningForm,
  type ResultLineupMode,
} from "@joinup/shared/eveningSummary";
import EveningSummaryLines from "./EveningSummaryLines";
import Stepper from "./Stepper";
import type { EditorTeam } from "./resultEditorState";

export interface EveningRosterPlayer {
  userId: string;
  name: string;
  teamId?: string | null;
}

interface Props {
  form: EveningForm;
  teams: EditorTeam[];
  roster: EveningRosterPlayer[];
  sport: string;
  disabled?: boolean;
  showErrors?: boolean;
  onChange: (next: EveningForm) => void;
}

const MODE_LABEL: Record<ResultLineupMode, string> = {
  FIXED_TEAMS: "קבוצות קבועות",
  ROTATING_LINEUPS: "הרכבים מתחלפים",
};

export default function EveningRoundsEditor({ form, teams, roster, sport, disabled, showErrors, onChange }: Props) {
  const [openScorers, setOpenScorers] = useState<number | null>(0);
  const max = (MAX_TEAM_SCORE as Record<string, number>)[sport] ?? 99;
  const errors = showErrors ? eveningFormErrors(form) : [];
  const people = rosterFromTeams(roster, teams);
  const summary = summarizeEvening({
    lineupMode: form.lineupMode,
    rounds: toEveningResultBody(form).rounds,
    roster: people,
  });
  const nameOf = (id: string) => roster.find((p) => p.userId === id)?.name || "שחקן";

  const patchSide = (ri: number, si: number, patch: Partial<EveningForm["rounds"][number]["sides"][number]>) => {
    onChange({
      ...form,
      rounds: form.rounds.map((round, i) =>
        i !== ri
          ? round
          : { sides: round.sides.map((side, j) => (j === si ? { ...side, ...patch } : side)) },
      ),
    });
  };

  const pickTeam = (ri: number, si: number, teamId: string) => {
    const team = teams.find((t) => t.id === teamId);
    if (!team) return;
    const other = form.rounds[ri].sides[si === 0 ? 1 : 0];
    if (other.teamId === teamId) return;
    patchSide(ri, si, { teamId, label: team.name, goals: {} });
  };

  const togglePlayer = (ri: number, si: number, userId: string) => {
    const round = form.rounds[ri];
    const mine = new Set(round.sides[si].playerIds);
    if (mine.has(userId)) mine.delete(userId);
    else mine.add(userId);
    onChange({
      ...form,
      rounds: form.rounds.map((item, i) => {
        if (i !== ri) return item;
        return {
          sides: item.sides.map((side, j) => {
            if (j === si) return { ...side, playerIds: [...mine] };
            return { ...side, playerIds: side.playerIds.filter((id) => id !== userId) };
          }),
        };
      }),
    });
  };

  const addGoal = (ri: number, si: number, userId: string) => {
    const side = form.rounds[ri].sides[si];
    const next = Math.min(max, (side.goals[userId] || 0) + 1);
    patchSide(ri, si, { goals: { ...side.goals, [userId]: next } });
  };

  const candidates = (si: number, sideTeamId: string | null) => {
    if (form.lineupMode === "FIXED_TEAMS" && sideTeamId) {
      return roster.filter((p) => people.find((r) => r.userId === p.userId)?.teamId === sideTeamId);
    }
    return roster;
  };

  return (
    <Stack spacing={1.5} data-testid="evening-rounds">
      <Typography variant="body2" color="text.secondary">
        כמה משחקים באותו ערב. הוספה מהירה משאירה את המנצח ומכניסה את הקבוצה שחיכתה. ערב כזה נספר כמשחק אחד בפרופיל.
      </Typography>
      <ToggleButtonGroup
        exclusive
        fullWidth
        size="small"
        value={form.lineupMode}
        disabled={disabled}
        onChange={(_, mode: ResultLineupMode | null) => {
          if (mode) onChange(setEveningLineupMode(form, mode, teams, people));
        }}
        aria-label="איך מסדרים את הצדדים"
      >
        {(Object.keys(MODE_LABEL) as ResultLineupMode[]).map((mode) => (
          <ToggleButton key={mode} value={mode} sx={{ minHeight: 44, fontWeight: 700 }}>
            {MODE_LABEL[mode]}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <Typography variant="caption" color="text.secondary">
        {form.lineupMode === "FIXED_TEAMS"
          ? "הקבוצות נשארות. רק מי נגד מי משתנה."
          : "כל משחק מתחיל מההרכב הקודם, ואפשר להזיז שחקנים."}
      </Typography>

      {form.rounds.map((round, ri) => {
        const roundErrors = errors.filter((e) => e.index === ri).map((e) => e.code);
        return (
          <Box
            key={ri}
            data-testid={`evening-round-${ri}`}
            sx={{ p: 1.5, borderRadius: 2, border: "1px solid", borderColor: roundErrors.length ? "error.main" : "divider" }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
              <Typography variant="subtitle2" fontWeight={800}>משחק {ri + 1}</Typography>
              {form.rounds.length > 1 && (
                <IconButton aria-label={`מחיקת משחק ${ri + 1}`} disabled={disabled} onClick={() => onChange(removeEveningRound(form, ri))} size="small">
                  <CloseRoundedIcon fontSize="small" />
                </IconButton>
              )}
            </Stack>
            <Stack spacing={1.25}>
              {round.sides.map((side, si) => (
                <Box key={si}>
                  {form.lineupMode === "FIXED_TEAMS" && teams.length >= 2 ? (
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap mb={0.75}>
                      {teams.map((team) => {
                        const taken = round.sides[si === 0 ? 1 : 0].teamId === team.id;
                        const selected = side.teamId === team.id;
                        return (
                          <Button
                            key={team.id}
                            size="small"
                            variant={selected ? "contained" : "outlined"}
                            disabled={disabled || taken}
                            onClick={() => pickTeam(ri, si, team.id)}
                            sx={{ minHeight: 36, borderColor: team.color, ...(selected ? { bgcolor: team.color } : { color: team.color }) }}
                          >
                            {team.name}
                          </Button>
                        );
                      })}
                    </Stack>
                  ) : (
                    <Typography variant="body2" fontWeight={700} mb={0.5}>{side.label}</Typography>
                  )}
                  <Stepper
                    value={side.score}
                    max={max}
                    disabled={disabled}
                    onChange={(score) => patchSide(ri, si, { score })}
                    incLabel={`הוספת שער ל${side.label}`}
                    decLabel={`הפחתת שער ל${side.label}`}
                    testIds={{
                      inc: `evening-score-${ri}-${si}-inc`,
                      dec: `evening-score-${ri}-${si}-dec`,
                      value: `evening-score-${ri}-${si}`,
                    }}
                    size={44}
                    valueFontSize={22}
                  />
                </Box>
              ))}
            </Stack>
            <Button size="small" sx={{ mt: 1, minHeight: 44 }} disabled={disabled} onClick={() => setOpenScorers(openScorers === ri ? null : ri)}>
              {openScorers === ri ? "הסתרת שחקנים" : "שחקנים וכובשים"}
            </Button>
            {openScorers === ri && (
              <Stack spacing={1} mt={0.5}>
                {round.sides.map((side, si) => (
                  <Box key={si}>
                    <Typography variant="caption" fontWeight={700}>{side.label}</Typography>
                    <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.75} mt={0.5}>
                      {candidates(si, side.teamId).map((p) => {
                        const onSide = form.lineupMode !== "ROTATING_LINEUPS" || side.playerIds.includes(p.userId);
                        const goals = side.goals[p.userId] || 0;
                        return (
                          <Stack key={p.userId} direction="row" spacing={0.25} alignItems="center">
                            <Button
                              size="small"
                              variant={onSide ? "contained" : "outlined"}
                              disabled={disabled}
                              onClick={() => (form.lineupMode === "ROTATING_LINEUPS" ? togglePlayer(ri, si, p.userId) : addGoal(ri, si, p.userId))}
                              sx={{ minHeight: 40 }}
                            >
                              {p.name}{goals > 0 ? ` · ${goals}` : ""}
                            </Button>
                            {form.lineupMode === "ROTATING_LINEUPS" && onSide && (
                              <IconButton aria-label={`שער ל${p.name}`} disabled={disabled} onClick={() => addGoal(ri, si, p.userId)} size="small">
                                <AddRoundedIcon fontSize="small" />
                              </IconButton>
                            )}
                          </Stack>
                        );
                      })}
                      {candidates(si, side.teamId).length === 0 && (
                        <Typography variant="caption" color="text.secondary">אין שחקנים לצד הזה</Typography>
                      )}
                    </Stack>
                  </Box>
                ))}
                <Typography variant="caption" color="text.secondary">
                  {form.lineupMode === "ROTATING_LINEUPS"
                    ? "לחיצה על שם משייכת לצד ומורידה מהצד השני. + מוסיף שער."
                    : "לחיצה על שם מוסיפה שער. מי שלא כבש עדיין נספר לפי הקבוצה שלו."}
                </Typography>
              </Stack>
            )}
            {roundErrors.length > 0 && (
              <Typography variant="caption" color="error" display="block" mt={0.5}>
                {roundErrors.includes("EMPTY_SIDE") ? "בחרו לפחות שחקן אחד בכל צד. " : ""}
                {roundErrors.includes("DUPLICATE_PLAYER") ? "שחקן לא יכול להיות בשני הצדדים. " : ""}
                {roundErrors.includes("SAME_TEAM") ? "קבוצה לא משחקת נגד עצמה." : ""}
              </Typography>
            )}
          </Box>
        );
      })}

      <Button
        variant="outlined"
        startIcon={<AddRoundedIcon />}
        disabled={disabled || form.rounds.length >= 24}
        onClick={() => onChange(appendEveningRound(form, teams))}
        data-testid="evening-add-round"
        sx={{ minHeight: 48 }}
      >
        הוספת משחק
      </Button>

      {(summary.teams.length > 0 || summary.players.length > 0) && (
        <EveningSummaryLines
          testId="evening-summary-preview"
          summary={summary}
          sport={sport}
          nameOf={nameOf}
        />
      )}
    </Stack>
  );
}
