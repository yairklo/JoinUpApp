"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import StandingsTable from "../StandingsTable";
import UpdatedCue from "../UpdatedCue";
import { TabEmpty, TabError, TabSkeleton } from "./TabStates";
import { useStandings, useTournament } from "@/hooks/tournaments";
import type { TournamentMatch } from "@/types/tournament";

export interface StandingsTabProps {
    tournamentId: string;
    /** Unused here (kept so every tab shares one props shape). */
    canScore?: boolean;
    onScoreMatch?: (match: TournamentMatch) => void;
}

/** Standings tab (spec 8): one table per stage/group, compact on phones, full from 600px. */
export default function StandingsTab({ tournamentId }: StandingsTabProps) {
    const router = useRouter();
    const theme = useTheme();
    const wide = useMediaQuery(theme.breakpoints.up("sm"));
    const { tournament } = useTournament(tournamentId);
    const { tables, loading, error, reload, updated } = useStandings(tournamentId);
    const [full, setFull] = useState(false);
    const [group, setGroup] = useState<string | null>(null);

    if (loading && tables.length === 0) return <div data-testid="standings-tab"><TabSkeleton rows={7} height={48} /></div>;
    if (error && tables.length === 0) return <div data-testid="standings-tab"><TabError error={error} onRetry={reload} /></div>;
    if (tables.length === 0) return <div data-testid="standings-tab"><TabEmpty>הטבלה תופיע אחרי שייבנה לוח המשחקים</TabEmpty></div>;

    const mode = wide || full ? "full" : "compact";
    const advance = tournament?.rules?.advancePerGroup ?? null;
    const manyGroups = !wide && tables.length > 2;
    const keyOf = (t: (typeof tables)[number]) => `${t.stageId}-${t.groupId ?? "all"}`;
    const selected = manyGroups ? tables.find((t) => keyOf(t) === group) ?? tables[0] : null;
    const shown = selected ? [selected] : tables;

    return (
        <Stack spacing={2.5} data-testid="standings-tab">
            <UpdatedCue show={updated} />
            {error && <TabError error={error} onRetry={reload} />}
            {manyGroups && (
                <Stack direction="row" spacing={1} sx={{ overflowX: "auto", pb: 0.5 }} role="group" aria-label="בחירת בית">
                    {tables.map((t) => (
                        <Chip
                            key={keyOf(t)}
                            label={t.groupName ? `בית ${t.groupName}` : t.stageName}
                            clickable
                            color={selected && keyOf(selected) === keyOf(t) ? "primary" : "default"}
                            onClick={() => setGroup(keyOf(t))}
                            data-testid={`standings-group-${t.groupId ?? t.stageId}`}
                            sx={{ flexShrink: 0 }}
                        />
                    ))}
                </Stack>
            )}
            {shown.map((t) => (
                <StandingsTable
                    key={keyOf(t)}
                    table={t}
                    myTeamId={tournament?.myTeam?.id ?? null}
                    advanceCount={t.groupId ? advance : null}
                    mode={mode}
                    sport={tournament?.sport}
                    tournamentCompleted={tournament?.status === "COMPLETED"}
                    canManage={!!tournament?.capabilities.canManage}
                    onSetManualRank={() => router.push(`/tournaments/${tournamentId}/manage`)}
                />
            ))}
            {!wide && (
                <FormControlLabel
                    sx={{ alignSelf: "flex-start" }}
                    control={<Switch checked={full} onChange={(e) => setFull(e.target.checked)} inputProps={{ "aria-label": "כל העמודות" }} data-testid="standings-mode-toggle" />}
                    label={<Typography variant="body2">כל העמודות</Typography>}
                />
            )}
        </Stack>
    );
}
