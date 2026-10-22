"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import MatchCard from "../MatchCard";
import UpdatedCue from "../UpdatedCue";
import { TabEmpty, TabError, TabSkeleton } from "./TabStates";
import { useTournament, useTournamentSchedule } from "@/hooks/tournaments";
import {
    buildMatchesIcs,
    dayChipLabel,
    defaultDay,
    filterMatches,
    groupMatches,
    matchDays,
    stageCaption,
    type ScheduleFilterState,
    type StatusFilter,
} from "@/utils/tournamentViews";
import type { TournamentMatch as Match } from "@/types/tournament";

export interface ScheduleTabProps {
    tournamentId: string;
    /** Show the score (edit) button on cards. */
    canScore?: boolean;
    onScoreMatch?: (match: Match) => void;
}

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
    { value: "ALL", label: "הכל" },
    { value: "LIVE", label: "חי" },
    { value: "UPCOMING", label: "קרובים" },
    { value: "DONE", label: "הסתיימו" },
];

function downloadIcs(match: Match, title: string) {
    const home = match.home.team?.name ?? "";
    const away = match.away.team?.name ?? "";
    const ics = buildMatchesIcs([
        { id: match.id, scheduledAt: match.scheduledAt, summary: `${title}: ${home} – ${away}`, location: match.courtLabel },
    ]);
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `match-${match.number}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Schedule tab (spec 7): filters, grouped match cards, live updates. */
export default function ScheduleTab({ tournamentId, canScore, onScoreMatch }: ScheduleTabProps) {
    const { tournament } = useTournament(tournamentId);
    const { stages, matches, matchNumberById, groupNameById, loading, error, reload, updated, changedMatchIds } =
        useTournamentSchedule(tournamentId);
    const myTeamId = tournament?.myTeam?.id ?? null;

    const days = useMemo(() => matchDays(matches), [matches]);
    const [filters, setFilters] = useState<ScheduleFilterState | null>(null);
    const [mine, setMine] = useState<boolean | null>(null);

    // Defaults are decided once, when data first arrives (today / first upcoming day; my team when I have one).
    useEffect(() => {
        if (!filters && matches.length > 0) setFilters({ day: defaultDay(days), teamId: null, status: "ALL", stageId: null });
    }, [filters, matches.length, days]);
    const mineOn = mine ?? !!myTeamId;
    const f: ScheduleFilterState = { ...(filters ?? { day: "ALL", teamId: null, status: "ALL", stageId: null }) };
    if (mineOn && myTeamId) f.teamId = myTeamId;
    const patch = useCallback((p: Partial<ScheduleFilterState>) => setFilters((cur) => ({ day: "ALL", teamId: null, status: "ALL", stageId: null, ...cur, ...p })), []);
    const clear = () => {
        setFilters({ day: "ALL", teamId: null, status: "ALL", stageId: null });
        setMine(false);
    };

    const visible = useMemo(() => filterMatches(matches, f), [matches, f.day, f.teamId, f.status, f.stageId]); // eslint-disable-line react-hooks/exhaustive-deps
    const groups = useMemo(() => groupMatches(visible, stages), [visible, stages]);
    const teams = useMemo(() => {
        const m = new Map<string, string>();
        for (const x of matches) for (const s of [x.home, x.away]) if (s.team) m.set(s.team.id, s.team.name);
        return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "he"));
    }, [matches]);

    const scoreVisible = !!canScore && !!onScoreMatch && tournament?.status === "IN_PROGRESS";
    const context = useMemo(() => ({ matchNumberById, groupNameById, locale: "he" as const }), [matchNumberById, groupNameById]);

    if (loading && matches.length === 0) return <div data-testid="schedule-tab"><TabSkeleton rows={4} /></div>;
    if (error && matches.length === 0) return <div data-testid="schedule-tab"><TabError error={error} onRetry={reload} /></div>;

    if (matches.length === 0) {
        return (
            <div data-testid="schedule-tab">
                <TabEmpty
                    testId="schedule-empty"
                    action={
                        tournament?.capabilities.canManage ? (
                            <Button component={Link} href={`/tournaments/${tournamentId}/manage`} variant="contained">
                                בניית לוח משחקים
                            </Button>
                        ) : undefined
                    }
                >
                    {tournament?.status === "CANCELLED"
                        ? "הטורניר בוטל."
                        : "לוח המשחקים עוד לא פורסם. הוא יופיע כאן אחרי סגירת ההרשמה."}
                </TabEmpty>
            </div>
        );
    }

    return (
        <Stack spacing={2} data-testid="schedule-tab">
            <Stack
                spacing={1}
                sx={{ position: "sticky", top: 0, zIndex: 2, bgcolor: "background.default", py: 1 }}
            >
                {days.length > 1 && (
                    <Stack direction="row" spacing={1} sx={{ overflowX: "auto", pb: 0.5 }} role="group" aria-label="סינון לפי יום">
                        <Chip
                            label="הכל"
                            clickable
                            color={f.day === "ALL" ? "primary" : "default"}
                            onClick={() => patch({ day: "ALL" })}
                            data-testid="schedule-day-all"
                        />
                        {days.map((d) => (
                            <Chip
                                key={d}
                                label={dayChipLabel(d)}
                                clickable
                                color={f.day === d ? "primary" : "default"}
                                onClick={() => patch({ day: d })}
                                data-testid={`schedule-day-${d}`}
                                sx={{ flexShrink: 0 }}
                            />
                        ))}
                    </Stack>
                )}
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                    {myTeamId && (
                        <Chip
                            label="הקבוצה שלי"
                            clickable
                            color={mineOn ? "primary" : "default"}
                            variant={mineOn ? "filled" : "outlined"}
                            onClick={() => setMine(!mineOn)}
                            data-testid="schedule-filter-mine"
                        />
                    )}
                    <TextField
                        select
                        size="small"
                        label="קבוצה"
                        value={mineOn && myTeamId ? myTeamId : f.teamId ?? ""}
                        onChange={(e) => {
                            setMine(false);
                            patch({ teamId: e.target.value || null });
                        }}
                        sx={{ minWidth: 130 }}
                        slotProps={{ htmlInput: { "data-testid": "schedule-filter-team" } }}
                    >
                        <MenuItem value="">כל הקבוצות</MenuItem>
                        {teams.map(([id, name]) => (
                            <MenuItem key={id} value={id}>
                                {name}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        select
                        size="small"
                        label="סטטוס"
                        value={f.status}
                        onChange={(e) => patch({ status: e.target.value as StatusFilter })}
                        sx={{ minWidth: 110 }}
                        slotProps={{ htmlInput: { "data-testid": "schedule-filter-status" } }}
                    >
                        {STATUS_OPTIONS.map((o) => (
                            <MenuItem key={o.value} value={o.value}>
                                {o.label}
                            </MenuItem>
                        ))}
                    </TextField>
                    {stages.length > 1 && (
                        <TextField
                            select
                            size="small"
                            label="שלב"
                            value={f.stageId ?? ""}
                            onChange={(e) => patch({ stageId: e.target.value || null })}
                            sx={{ minWidth: 110 }}
                        >
                            <MenuItem value="">כל השלבים</MenuItem>
                            {stages.map((s) => (
                                <MenuItem key={s.id} value={s.id}>
                                    {s.name}
                                </MenuItem>
                            ))}
                        </TextField>
                    )}
                </Stack>
                <UpdatedCue show={updated} />
            </Stack>

            {error && <TabError error={error} onRetry={reload} />}

            {visible.length === 0 ? (
                <TabEmpty
                    testId="schedule-empty"
                    action={<Button onClick={clear}>ניקוי</Button>}
                >
                    אין משחקים שמתאימים לסינון
                </TabEmpty>
            ) : (
                groups.map((g) => (
                    <Box key={g.key} component="section" aria-label={g.title}>
                        <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1 }} data-testid={`schedule-group-${g.key}`}>
                            {g.title}
                        </Typography>
                        <Box
                            sx={{
                                display: "grid",
                                gap: 1.5,
                                gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0, 1fr))" },
                            }}
                        >
                            {g.matches.map((m) => {
                                const mineMatch = !!myTeamId && (m.home.teamId === myTeamId || m.away.teamId === myTeamId);
                                return (
                                    <MatchCard
                                        key={m.id}
                                        match={m}
                                        context={context}
                                        caption={stageCaption(m, stages)}
                                        myTeamId={myTeamId}
                                        href={`/tournaments/${tournamentId}/matches/${m.id}`}
                                        changed={changedMatchIds.includes(m.id)}
                                        canScore={scoreVisible}
                                        onScore={onScoreMatch}
                                        onAddToCalendar={
                                            mineMatch && m.scheduledAt
                                                ? (match) => downloadIcs(match, tournament?.title ?? "טורניר")
                                                : undefined
                                        }
                                    />
                                );
                            })}
                        </Box>
                    </Box>
                ))
            )}
        </Stack>
    );
}
