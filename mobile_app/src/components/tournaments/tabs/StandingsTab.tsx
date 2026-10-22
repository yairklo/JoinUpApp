import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTournament } from '@/hooks/useTournament';
import { useStandings } from '@/hooks/useTournamentViews';
import StandingsTable from '../StandingsTable';
import { EmptyState, ErrorState, Pill, SkeletonList } from './TabState';
import type { TournamentTabProps } from './ScheduleTab';

export interface StandingsTabProps extends TournamentTabProps {
    /** Manager only: opens the manual-rank dialog (manage console). Button hidden when absent. */
    onSetManualRank?: () => void;
}

/**
 * Standings tab (spec 8): one `StandingsTable` per group / league table; with more than 2 groups a
 * pill row selects a single group. Qualification zone comes from `rules.advancePerGroup` (GROUP
 * tables only).
 */
export default function StandingsTab({ tournamentId, onSetManualRank }: StandingsTabProps) {
    const { t } = useTranslation();
    const { tournament } = useTournament(tournamentId);
    const { tables, loading, error, refetch } = useStandings(tournamentId);
    const [group, setGroup] = useState<string | null>(null);
    const myTeamId = tournament?.myTeam?.id ?? null;
    const canManage = !!tournament?.capabilities?.canManage;

    if (loading && tables.length === 0) return <View testID="standings-tab"><SkeletonList count={7} height={48} /></View>;
    if (error && tables.length === 0) return <View testID="standings-tab"><ErrorState onRetry={refetch} /></View>;
    if (tables.length === 0) {
        return (
            <View testID="standings-tab">
                <EmptyState icon="list-outline" text={t('tournaments.standings.empty')} />
            </View>
        );
    }

    const grouped = tables.filter((x) => x.groupId);
    const pills = grouped.length > 2;
    const selected = pills ? (group ?? grouped[0].groupId) : null;
    const shown = pills ? tables.filter((x) => !x.groupId || x.groupId === selected) : tables;

    return (
        <View testID="standings-tab">
            {pills ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
                    {grouped.map((x) => (
                        <Pill
                            key={x.groupId as string}
                            testID={`standings-group-${x.groupId}`}
                            label={x.groupName ?? x.stageName}
                            selected={x.groupId === selected}
                            onPress={() => setGroup(x.groupId)}
                        />
                    ))}
                </ScrollView>
            ) : null}
            {shown.map((table) => (
                <StandingsTable
                    key={`${table.stageId}-${table.groupId ?? 'all'}`}
                    table={table}
                    myTeamId={myTeamId}
                    advanceCount={table.groupId ? tournament?.rules?.advancePerGroup : undefined}
                    tournamentCompleted={tournament?.status === 'COMPLETED'}
                    canManage={canManage}
                    onSetManualRank={onSetManualRank}
                />
            ))}
        </View>
    );
}
