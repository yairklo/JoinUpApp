"use client";

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import { checkPlayerTotals, getStatDefs } from "@joinup/shared/matchStats";
import Avatar from "@/components/Avatar";
import TeamBadge from "../TeamBadge";
import { useTournamentTeams } from "@/hooks/tournaments";
import type { StatsForm } from "@/utils/tournamentManage";
import type { TournamentMatch, TournamentTeam } from "@/types/tournament";
import { SmallStepper } from "./ScoreEntryView";

export interface ScoreStatsSectionProps {
    tournamentId: string;
    match: Pick<TournamentMatch, "home" | "away">;
    sport: string;
    stats: StatsForm;
    onChange: (next: StatsForm) => void;
    homeScore: number;
    awayScore: number;
    disabled: boolean;
}

/** Soft warning lines per team (F1 3.6): a team's player totals are higher than its score. */
export function statsWarningLines(
    sport: string,
    teams: ReadonlyArray<{ name: string; score: number; userIds: string[] }>,
    stats: StatsForm
): string[] {
    const defs = getStatDefs(sport);
    const out: string[] = [];
    for (const t of teams) {
        const rows = t.userIds.map((id) => stats[id] ?? {});
        for (const w of checkPlayerTotals(sport, t.score, rows)) {
            const label = defs.find((d) => d.key === w.key)?.he ?? "";
            out.push(`סכום ה${label} של שחקני ${t.name} (${w.sum}) גבוה מהתוצאה (${w.teamScore}). אפשר לשמור בכל זאת.`);
        }
    }
    return out;
}

/** Optional per-player stats for both rosters (accepted members), mounted only when expanded (spec 12.2). */
export default function ScoreStatsSection({ tournamentId, match, sport, stats, onChange, homeScore, awayScore, disabled }: ScoreStatsSectionProps) {
    const { teams, loading } = useTournamentTeams(tournamentId, { live: false });
    const [open, setOpen] = useState<string | null>(null);
    const defs = getStatDefs(sport);
    const quick = defs[0];

    const sides = useMemo(() => {
        const find = (id: string | null): TournamentTeam | null => teams.find((t) => t.id === id) ?? null;
        return [
            { key: "home", team: find(match.home.teamId) },
            { key: "away", team: find(match.away.teamId) },
        ] as const;
    }, [teams, match.home.teamId, match.away.teamId]);

    const setStat = (userId: string, key: string, value: number) =>
        onChange({ ...stats, [userId]: { ...(stats[userId] ?? {}), [key]: value } });

    if (loading) return <Skeleton variant="rounded" height={120} data-testid="score-stats-loading" />;
    if (!quick) return null;

    const warnings = statsWarningLines(
        sport,
        sides.map((s, i) => ({
            name: s.team?.name ?? "",
            score: i === 0 ? homeScore : awayScore,
            userIds: (s.team?.members ?? []).filter((m) => m.status === "ACCEPTED").map((m) => m.userId),
        })),
        stats
    );

    return (
        <Box data-testid="score-stats">
            {sides.map(({ key, team }) => {
                const members = (team?.members ?? []).filter((m) => m.status === "ACCEPTED");
                if (!team) return null;
                return (
                    <Box key={key} sx={{ mb: 1.5 }}>
                        <Box sx={{ position: "sticky", top: 0, bgcolor: "background.paper", zIndex: 1, py: 0.5 }}>
                            <TeamBadge team={team} size={24} />
                        </Box>
                        {members.length === 0 && (
                            <Typography variant="body2" color="text.secondary">אין שחקנים מאושרים בקבוצה.</Typography>
                        )}
                        {members.map((m) => {
                            const vals = stats[m.userId] ?? {};
                            const expanded = open === m.userId;
                            return (
                                <Box key={m.userId} data-testid={`score-player-${m.userId}`} sx={{ borderBottom: 1, borderColor: "divider", py: 1 }}>
                                    <Stack direction="row" alignItems="center" spacing={1.25}>
                                        <Avatar src={m.imageUrl ?? undefined} alt={m.name} name={m.name} size="md" />
                                        <Typography variant="body2" fontWeight={600} sx={{ flex: 1, minWidth: 0 }} noWrap title={m.name}>
                                            {m.name}
                                        </Typography>
                                        <SmallStepper
                                            value={vals[quick.key] ?? 0}
                                            onChange={(n) => setStat(m.userId, quick.key, n)}
                                            disabled={disabled}
                                            incLabel={`הוספת ${quick.he} ל${m.name}`}
                                            decLabel={`הפחתת ${quick.he} מ${m.name}`}
                                            testId={`score-stat-${m.userId}-${quick.key}`}
                                        />
                                        {defs.length > 1 && (
                                            <IconButton
                                                aria-label={expanded ? "סגירה" : "פתיחת סטטיסטיקות"}
                                                aria-expanded={expanded}
                                                onClick={() => setOpen(expanded ? null : m.userId)}
                                                sx={{ transform: expanded ? "rotate(180deg)" : "none" }}
                                            >
                                                <ExpandMoreRoundedIcon />
                                            </IconButton>
                                        )}
                                    </Stack>
                                    <Collapse in={expanded} unmountOnExit>
                                        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mt: 1.5 }}>
                                            {defs.slice(1).map((d) =>
                                                d.max === 1 ? (
                                                    <Box key={d.key} sx={{ gridColumn: "1 / -1" }}>
                                                        <Chip
                                                            clickable
                                                            disabled={disabled}
                                                            color={(vals[d.key] ?? 0) > 0 ? "primary" : "default"}
                                                            label={d.he}
                                                            onClick={() => setStat(m.userId, d.key, (vals[d.key] ?? 0) > 0 ? 0 : 1)}
                                                            data-testid={`score-stat-${m.userId}-${d.key}`}
                                                        />
                                                    </Box>
                                                ) : (
                                                    <Box key={d.key}>
                                                        <Typography variant="caption" color="text.secondary">{d.he}</Typography>
                                                        <SmallStepper
                                                            value={vals[d.key] ?? 0}
                                                            onChange={(n) => setStat(m.userId, d.key, n)}
                                                            disabled={disabled}
                                                            incLabel={`הוספת ${d.he} ל${m.name}`}
                                                            decLabel={`הפחתת ${d.he} מ${m.name}`}
                                                            testId={`score-stat-${m.userId}-${d.key}`}
                                                        />
                                                    </Box>
                                                )
                                            )}
                                        </Box>
                                    </Collapse>
                                </Box>
                            );
                        })}
                    </Box>
                );
            })}
            {warnings.length > 0 && (
                <Typography variant="caption" color="warning.main" display="block" data-testid="score-stats-warning">
                    {warnings[0]}
                </Typography>
            )}
        </Box>
    );
}
