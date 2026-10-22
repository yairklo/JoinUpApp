"use client";

import { useState } from "react";
import ScoreEntrySheet from "./ScoreEntrySheet";
import TournamentMatchDetail from "./TournamentMatchDetail";
import { useTournament } from "@/hooks/tournaments";
import type { TournamentMatch } from "@/types/tournament";

/**
 * Match route. The detail view only renders "הזנת תוצאה" when this screen passes `onScoreMatch`
 * and mounts the sheet. Scorekeepers see it once the tournament is IN_PROGRESS.
 */
export default function TournamentMatchScreen({ tournamentId, matchId }: { tournamentId: string; matchId: string }) {
    const { tournament, reload } = useTournament(tournamentId);
    const [scoring, setScoring] = useState<TournamentMatch | null>(null);
    const canScore = !!tournament?.capabilities.canScore;

    return (
        <>
            <TournamentMatchDetail
                tournamentId={tournamentId}
                matchId={matchId}
                onScoreMatch={canScore ? setScoring : undefined}
            />
            {canScore && tournament && (
                <ScoreEntrySheet
                    open={!!scoring}
                    tournament={tournament}
                    match={scoring}
                    onClose={() => setScoring(null)}
                    onSaved={() => void reload()}
                />
            )}
        </>
    );
}
