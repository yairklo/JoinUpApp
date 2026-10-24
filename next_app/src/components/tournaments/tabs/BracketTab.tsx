"use client";

import { useState } from "react";
import Stack from "@mui/material/Stack";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import BracketView, { type BracketMode } from "../BracketView";
import UpdatedCue from "../UpdatedCue";
import { TabEmpty, TabError, TabSkeleton } from "./TabStates";
import { useBracket, useTournament, useTournamentSchedule } from "@/hooks/tournaments";
import type { TournamentMatch } from "@/types/tournament";

export interface BracketTabProps {
    tournamentId: string;
    /** Unused here (kept so every tab shares one props shape). */
    canScore?: boolean;
    onScoreMatch?: (match: TournamentMatch) => void;
}

/** Bracket tab (spec 9): tree on desktop, round-by-round on phones; shows the knockout stage(s) only. */
export default function BracketTab({ tournamentId }: BracketTabProps) {
    const theme = useTheme();
    const wide = useMediaQuery(theme.breakpoints.up("md"));
    const { tournament } = useTournament(tournamentId);
    const { stages, loading, error, reload, updated, changedMatchIds } = useBracket(tournamentId);
    // match numbers for placeholders ("Winner of match 5") come from the schedule payload
    const { matchNumberById, groupNameById } = useTournamentSchedule(tournamentId, {}, { live: false });
    const [override, setOverride] = useState<BracketMode | null>(null);

    if (loading && stages.length === 0) return <div data-testid="bracket-tab"><TabSkeleton rows={wide ? 3 : 4} height={wide ? 240 : 96} /></div>;
    if (error && stages.length === 0) return <div data-testid="bracket-tab"><TabError error={error} onRetry={reload} /></div>;
    const knockout = stages.filter((s) => s.rounds.some((r) => r.matches.length > 0));
    if (knockout.length === 0) {
        const groups = tournament?.format === "GROUPS_KNOCKOUT";
        return (
            <div data-testid="bracket-tab">
                <TabEmpty>{groups ? "העץ ייקבע אחרי שלב הבתים" : "העץ יופיע אחרי בניית לוח המשחקים"}</TabEmpty>
            </div>
        );
    }

    const mode: BracketMode = override ?? (wide ? "tree" : "rounds");
    const context = { matchNumberById, groupNameById, locale: "he" as const };
    return (
        <Stack spacing={2} data-testid="bracket-tab">
            <UpdatedCue show={updated} />
            {knockout.map((s) => (
                <BracketView
                    key={s.stageId}
                    stage={s}
                    sport={tournament?.sport}
                    myTeamId={tournament?.myTeam?.id ?? null}
                    highlightTeamId={tournament?.myTeam?.id ?? null}
                    mode={mode}
                    onModeChange={setOverride}
                    context={context}
                    changedMatchIds={changedMatchIds}
                    completed={tournament?.status === "COMPLETED"}
                    hrefFor={(m) => `/tournaments/${tournamentId}/matches/${m.id}`}
                />
            ))}
        </Stack>
    );
}
