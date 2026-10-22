"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import ScoreboardRoundedIcon from "@mui/icons-material/ScoreboardRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import OutlinedFlagRoundedIcon from "@mui/icons-material/OutlinedFlagRounded";
import Avatar from "@/components/Avatar";
import { getSportTheme } from "@/utils/sports";
import { OUTCOME_LABEL_HE, formatStatParts, groupStatsBySide, scoreAriaLabel } from "@/utils/matchResultFormat";
import type { GameResultData, GameResultRosterPlayer, GameResultSide } from "@/types/matchResult";
import { outcomeSx, swatchSx } from "./outcomeSx";

export interface ResultTeam {
  id: string;
  color: string;
}

export interface GameResultPanelProps {
  sport: string;
  result: GameResultData | null;
  roster: GameResultRosterPlayer[];
  teams?: ResultTeam[];
  /** Game finished and can take a result. */
  eligible: boolean;
  canEdit: boolean;
  locked: boolean;
  viewerCanDispute: boolean;
  /** Dispute already sent this session (local state). */
  disputed?: boolean;
  state: "loading" | "error" | "ready";
  onEdit: () => void;
  onDispute: () => void;
  onRetry: () => void;
}

const LOCK_HINT = "אפשר לערוך תוצאה עד 7 ימים אחרי שהוזנה. לתיקון פנו לתמיכה.";
const COLLAPSED_ROWS = 6;

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("he-IL");
  } catch {
    return "";
  }
}

function Shell({ sport, children, testId }: { sport: string; children: React.ReactNode; testId: string }) {
  const theme = getSportTheme(sport);
  return (
    <Card
      variant="outlined"
      dir="rtl"
      data-testid={testId}
      sx={(t) => ({
        borderRadius: 2.5,
        borderTop: `4px solid ${theme.base}`,
        bgcolor: "background.paper",
        boxShadow: t.shadows[2],
        overflow: "hidden",
      })}
    >
      <CardContent sx={{ p: { xs: 2.25, sm: 3 }, "&:last-child": { pb: { xs: 2.25, sm: 3 } } }}>{children}</CardContent>
    </Card>
  );
}

function Title({ children }: { children?: React.ReactNode }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1.25} sx={{ minWidth: 0 }}>
      <Box
        sx={(t) => ({
          width: 34,
          height: 34,
          borderRadius: 1.75,
          display: "grid",
          placeItems: "center",
          bgcolor: alpha(t.palette.primary.main, 0.12),
          color: "primary.main",
          flexShrink: 0,
        })}
      >
        <ScoreboardRoundedIcon fontSize="small" />
      </Box>
      <Typography variant="h6" fontWeight={800} sx={{ letterSpacing: "-0.02em" }}>
        תוצאת המשחק
      </Typography>
      {children}
    </Stack>
  );
}

function SideLabel({ side, color, testId, align }: { side: GameResultSide; color?: string; testId: string; align: "start" | "end" }) {
  return (
    <Stack
      data-testid={testId}
      spacing={0.75}
      sx={{ minWidth: 0, alignItems: align === "start" ? "flex-start" : "flex-end", textAlign: align === "start" ? "start" : "end" }}
    >
      <Box sx={swatchSx(color, side.order === 0 ? "accent" : "neutral")} />
      <Typography
        variant="subtitle1"
        fontWeight={700}
        title={side.label}
        sx={{
          fontSize: { xs: 14, sm: 16 },
          lineHeight: 1.3,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflowWrap: "anywhere",
        }}
      >
        {side.label}
      </Typography>
    </Stack>
  );
}

function Score({ side, win, testId }: { side: GameResultSide; win: boolean | null; testId: string }) {
  return (
    <Box
      component="span"
      aria-hidden
      data-testid={testId}
      sx={{
        fontSize: { xs: 38, sm: 50 },
        fontWeight: win === false ? 700 : 800,
        lineHeight: 1,
        letterSpacing: "-0.03em",
        fontVariantNumeric: "tabular-nums",
        color: win === false ? "text.secondary" : "text.primary",
      }}
    >
      {side.score}
    </Box>
  );
}

function Scoreboard({ sides, teams }: { sides: GameResultSide[]; teams?: ResultTeam[] }) {
  const [a, b] = [...sides].sort((x, y) => x.order - y.order);
  if (!a || !b) return null;
  const colorOf = (s: GameResultSide) => teams?.find((t) => t.id === s.teamId)?.color;
  const draw = a.outcome === "DRAW";
  const winnerSide = a.outcome === "WIN" ? a : b.outcome === "WIN" ? b : null;
  const aWin = draw ? null : a.outcome === "WIN";
  const bWin = draw ? null : b.outcome === "WIN";
  return (
    <Box
      sx={(t) => ({
        p: { xs: 2, sm: 2.5 },
        borderRadius: 2.5,
        bgcolor: alpha(t.palette.text.primary, t.palette.mode === "dark" ? 0.04 : 0.025),
        border: "1px solid",
        borderColor: "divider",
      })}
    >
      <Box
        role="img"
        aria-label={scoreAriaLabel(sides)}
        sx={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", columnGap: { xs: 1.5, sm: 2.5 } }}
      >
        <SideLabel side={a} color={colorOf(a)} testId="game-result-side-0" align="start" />
        {/* Separate flex children, never a "3-2" string: bidi would flip the order (spec 1.1). */}
        <Stack
          direction="row"
          alignItems="center"
          spacing={{ xs: 1, sm: 1.75 }}
          sx={(t) => ({
            px: { xs: 1.5, sm: 2.25 },
            py: { xs: 0.75, sm: 1 },
            borderRadius: 2,
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            boxShadow: t.shadows[1],
          })}
        >
          <Score side={a} win={aWin} testId="game-result-score-0" />
          <Box component="span" aria-hidden sx={{ fontSize: { xs: 30, sm: 40 }, fontWeight: 700, lineHeight: 1, color: "text.disabled" }}>
            :
          </Box>
          <Score side={b} win={bWin} testId="game-result-score-1" />
        </Stack>
        <SideLabel side={b} color={colorOf(b)} testId="game-result-side-1" align="end" />
      </Box>
      <Stack alignItems="center" mt={1.75} data-testid="game-result-outcome">
        {draw ? (
          <Chip size="small" label={OUTCOME_LABEL_HE.DRAW} sx={[{ fontWeight: 700, px: 0.5 }, outcomeSx("DRAW")]} />
        ) : winnerSide ? (
          <Chip
            size="small"
            icon={<EmojiEventsRoundedIcon sx={{ fontSize: 16, color: "inherit !important" }} />}
            label={`${OUTCOME_LABEL_HE.WIN} ${winnerSide.label}`}
            sx={[{ fontWeight: 700, px: 0.5, maxWidth: "100%" }, outcomeSx("WIN")]}
          />
        ) : null}
      </Stack>
    </Box>
  );
}

function TennisGrid({ sides }: { sides: GameResultSide[] }) {
  const ordered = [...sides].sort((x, y) => x.order - y.order);
  const [a, b] = ordered;
  if (!a?.sets?.length || !b) return null;
  const setCount = a.sets.length;
  const cell = { width: 42, textAlign: "center" as const, fontVariantNumeric: "tabular-nums", p: 0.75 };
  return (
    <Box
      data-testid="game-result-sets"
      sx={{
        mt: 2,
        p: 1.5,
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        overflowX: "auto",
      }}
    >
      <Box component="table" sx={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <Box component="th" scope="col" sx={{ textAlign: "start", width: "45%", pb: 0.5, borderBottom: "1px solid", borderColor: "divider" }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary">מערכות</Typography>
            </Box>
            {a.sets.map((_, i) => {
              const tiebreak = i === 2 && setCount === 3 && Math.max(...a.sets![i]) >= 10;
              return (
                <Box component="th" scope="col" key={i} sx={{ ...cell, borderBottom: "1px solid", borderColor: "divider" }} title={tiebreak ? "שובר שוויון" : undefined}>
                  <Typography variant="caption" fontWeight={700} color="text.secondary">
                    {tiebreak ? "ש״ש" : `מע׳ ${i + 1}`}
                  </Typography>
                </Box>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {ordered.map((side, idx) => (
            <tr key={side.id}>
              <Box
                component="th"
                scope="row"
                sx={{
                  textAlign: "start",
                  py: 0.75,
                  fontWeight: side.outcome === "WIN" ? 800 : 500,
                  borderBottom: idx === 0 ? "1px solid" : "none",
                  borderColor: "divider",
                }}
              >
                <Typography variant="body2" fontWeight="inherit" sx={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                  {side.label}
                </Typography>
              </Box>
              {(side.sets || []).map(([own, other], i) => (
                <Box
                  component="td"
                  key={i}
                  sx={{
                    ...cell,
                    fontSize: 18,
                    fontWeight: own > other ? 800 : 600,
                    color: own > other ? "text.primary" : "text.secondary",
                    borderBottom: idx === 0 ? "1px solid" : "none",
                    borderColor: "divider",
                  }}
                >
                  {own}
                </Box>
              ))}
            </tr>
          ))}
        </tbody>
      </Box>
    </Box>
  );
}

function StatsBlock({ result, roster, teams }: { result: GameResultData; roster: GameResultRosterPlayer[]; teams?: ResultTeam[] }) {
  const groups = groupStatsBySide(result).map((g) => {
    const extra = roster.filter((p) => p.sideId === g.key && !g.rows.some((r) => r.userId === p.userId));
    if (!extra.length) return g;
    return {
      ...g,
      rows: [...g.rows, ...extra.map((p) => ({ userId: p.userId, sideId: p.sideId, values: {} }))],
    };
  });
  const [expanded, setExpanded] = useState(false);
  if (!groups.length) return null;
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  const collapse = total > COLLAPSED_ROWS && !expanded;
  let budget = collapse ? COLLAPSED_ROWS : Infinity;
  return (
    <Box data-testid="game-result-stats" sx={{ mt: 2.5 }}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: groups.length > 1 ? "1fr 1fr" : "1fr" }, gap: 2 }}>
        {groups.map((g) => {
          const rows = g.rows.slice(0, Math.max(0, budget));
          budget -= rows.length;
          if (!rows.length) return null;
          const color = g.side ? teams?.find((t) => t.id === g.side?.teamId)?.color : undefined;
          return (
            <Box
              key={g.key}
              sx={(t) => ({
                minWidth: 0,
                p: 1.75,
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: alpha(t.palette.text.primary, t.palette.mode === "dark" ? 0.025 : 0.015),
              })}
            >
              <Stack direction="row" alignItems="center" spacing={1} mb={1} pb={0.75} sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
                <Box sx={swatchSx(color, g.side?.order === 0 ? "accent" : "neutral")} />
                <Typography variant="subtitle2" fontWeight={800} noWrap>
                  {g.side ? g.side.label : "ללא שיבוץ"} ({g.rows.length})
                </Typography>
              </Stack>
              <Stack spacing={0.5}>
                {rows.map((r) => {
                  const p = roster.find((x) => x.userId === r.userId);
                  const name = p?.name || "שחקן";
                  return (
                    <Stack key={r.userId} direction="row" alignItems="center" spacing={1.25} sx={{ minHeight: 44, py: 0.25 }}>
                      <Avatar src={p?.imageUrl} alt={name} name={name} size="md" />
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="body2" fontWeight={700} noWrap title={name}>{name}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", overflowWrap: "anywhere", fontWeight: 500 }}>
                          {formatStatParts(result.sport, r.values).join(" · ")}
                        </Typography>
                      </Box>
                    </Stack>
                  );
                })}
              </Stack>
            </Box>
          );
        })}
      </Box>
      {total > COLLAPSED_ROWS && (
        <Button size="small" onClick={() => setExpanded((v) => !v)} sx={{ mt: 1.5 }}>
          {expanded ? "הצגת פחות" : `הצגת כל השחקנים (${total})`}
        </Button>
      )}
    </Box>
  );
}

function ManagerCta({ onEdit }: { onEdit: () => void }) {
  return (
    <Card
      variant="outlined"
      dir="rtl"
      data-testid="game-result-cta"
      sx={(t) => ({
        borderRadius: 2.5,
        bgcolor: "background.paper",
        boxShadow: t.shadows[1],
      })}
    >
      <CardContent sx={{ p: { xs: 2.25, sm: 3 } }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "stretch", sm: "center" }}>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
            <Box
              sx={(t) => ({ width: 42, height: 42, borderRadius: 2, display: "grid", placeItems: "center", flexShrink: 0, color: "primary.main", bgcolor: alpha(t.palette.primary.main, 0.12) })}
            >
              <ScoreboardRoundedIcon fontSize="small" />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" fontWeight={800} sx={{ letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                המשחק הסתיים, איך נגמר?
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                הזינו תוצאה וסטטיסטיקות לשחקנים. אפשר לערוך עד 7 ימים.
              </Typography>
            </Box>
          </Stack>
          <Button variant="contained" onClick={onEdit} sx={{ minHeight: 42, px: 3 }}>
            הזנת תוצאה
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function GameResultPanel(props: GameResultPanelProps) {
  const { sport, result, roster, teams, eligible, canEdit, locked, viewerCanDispute, disputed, state, onEdit, onDispute, onRetry } = props;

  if (state === "loading") {
    return (
      <Shell sport={sport} testId="game-result-panel">
        <Skeleton variant="rounded" width={120} height={20} />
        <Stack direction="row" justifyContent="space-between" alignItems="center" mt={3} mb={3}>
          <Skeleton variant="rounded" width={80} height={16} />
          <Skeleton variant="rounded" width={40} height={40} />
          <Skeleton variant="rounded" width={40} height={40} />
          <Skeleton variant="rounded" width={80} height={16} />
        </Stack>
        <Skeleton variant="rounded" height={16} sx={{ mb: 1 }} />
        <Skeleton variant="rounded" height={16} />
      </Shell>
    );
  }

  if (state === "error") {
    return (
      <Shell sport={sport} testId="game-result-panel">
        <Title />
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={1.5}
          mt={2}
          data-testid="game-result-error"
          sx={(t) => ({
            p: 1.5,
            px: 2,
            borderRadius: 2,
            bgcolor: alpha(t.palette.error.main, 0.06),
            border: "1px solid",
            borderColor: alpha(t.palette.error.main, 0.2),
          })}
        >
          <Typography variant="body2" color="text.secondary" fontWeight={600}>
            לא הצלחנו לטעון את התוצאה
          </Typography>
          <Button size="small" variant="outlined" onClick={onRetry}>
            נסו שוב
          </Button>
        </Stack>
      </Shell>
    );
  }

  if (!result) {
    return eligible && canEdit ? <ManagerCta onEdit={onEdit} /> : null;
  }

  const showLock = locked && !canEdit;
  const recorder = result.recordedBy?.name;
  return (
    <Shell sport={sport} testId="game-result-panel">
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} mb={2.5}>
        <Title />
        <Stack direction="row" alignItems="center" spacing={0.75}>
          {canEdit && (
            <Button size="small" variant="outlined" startIcon={<EditRoundedIcon />} onClick={onEdit} data-testid="game-result-edit">
              עריכה
            </Button>
          )}
          {locked && (
            <Tooltip title={LOCK_HINT}>
              <Chip size="small" icon={<LockRoundedIcon />} label="נעול" data-testid="game-result-locked" />
            </Tooltip>
          )}
        </Stack>
      </Stack>

      <Scoreboard sides={result.sides} teams={teams} />
      {sport === "TENNIS" && <TennisGrid sides={result.sides} />}
      <StatsBlock result={result} roster={roster} teams={teams} />

      {result.notes && (
        <Typography
          data-testid="game-result-notes"
          variant="body2"
          sx={(t) => ({
            mt: 2,
            p: 1.5,
            borderRadius: 1.5,
            bgcolor: alpha(t.palette.text.primary, 0.03),
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            borderInlineStart: "3px solid",
            borderColor: "primary.main",
            ps: 1.5,
          })}
        >
          {result.notes}
        </Typography>
      )}

      <Divider sx={{ mt: 2.5, mb: 1.5 }} />

      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} spacing={0.5}>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }} data-testid="game-result-recorded-by">
          <InfoOutlinedIcon sx={{ fontSize: 15, color: "text.secondary" }} />
          <Typography variant="caption" color="text.secondary">
            {recorder ? `נרשם ע״י ${recorder} · ` : ""}דיווח עצמי של מנהלי המשחק
            {result.editedAt ? ` · עודכן ${formatDate(result.editedAt)}` : ""}
          </Typography>
        </Stack>
        {viewerCanDispute && !showLock &&
          (disputed ? (
            <Typography variant="caption" color="text.secondary">דיווחת על התוצאה</Typography>
          ) : (
            <Button
              size="small"
              variant="text"
              color="inherit"
              startIcon={<OutlinedFlagRoundedIcon />}
              onClick={onDispute}
              data-testid="game-result-dispute"
              sx={{ color: "text.secondary" }}
            >
              התוצאה לא נכונה?
            </Button>
          ))}
      </Stack>
    </Shell>
  );
}
