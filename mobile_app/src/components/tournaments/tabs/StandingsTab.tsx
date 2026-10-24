import React, { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTournament } from '@/hooks/useTournament';
import { useStandingsOverride } from '@/hooks/useTournamentMutations';
import { useStandings } from '@/hooks/useTournamentViews';
import { tournamentErrorKey } from '@/utils/tournamentErrors';
import { displayStageName } from '../matchFormat';
import StandingsTable from '../StandingsTable';
import StandingsOverrideSheet from '../StandingsOverrideSheet';
import { EmptyState, ErrorState, Pill, SkeletonList } from './TabState';
import type { StandingsOverrideInput, StandingsTable as StandingsTableData } from '@/types/tournament';
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
    const { t, i18n } = useTranslation();
    const lang = i18n.language?.startsWith('en') ? 'en' : 'he';
    const { tournament } = useTournament(tournamentId);
    const { tables, loading, error, refetch } = useStandings(tournamentId);
    const override = useStandingsOverride(tournamentId);
    const [group, setGroup] = useState<string | null>(null);
    const [editing, setEditing] = useState<StandingsTableData | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const myTeamId = tournament?.myTeam?.id ?? null;
    const canManage = !!tournament?.capabilities?.canManage;

    const failText = (err: unknown) => {
        const key = tournamentErrorKey(err as { code?: string });
        return key ? t(key) : t('tournaments.standings.override.saveFailed');
    };
    const saveOverride = async (input: StandingsOverrideInput) => {
        try {
            await override.save(input);
            setEditing(null);
            setSaveError(null);
            void refetch();
        } catch (err) {
            setSaveError(failText(err));
        }
    };
    const resetOverride = (table: StandingsTableData) => {
        Alert.alert(t('tournaments.standings.override.resetTitle'), t('tournaments.standings.override.resetBody'), [
            { text: t('tournaments.standings.override.cancel'), style: 'cancel' },
            {
                text: t('tournaments.standings.override.resetConfirm'),
                style: 'destructive',
                onPress: () => {
                    void (async () => {
                        try {
                            await override.reset({ stageId: table.stageId, groupId: table.groupId });
                            setEditing(null);
                            setSaveError(null);
                            void refetch();
                        } catch (err) {
                            setSaveError(failText(err));
                            setEditing(table);
                        }
                    })();
                },
            },
        ]);
    };

    if (loading && tables.length === 0) return <View testID="standings-tab"><SkeletonList count={7} height={48} /></View>;
    if (error && tables.length === 0) return <View testID="standings-tab"><ErrorState onRetry={refetch} error={error} /></View>;
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
                            label={x.groupName ?? displayStageName(x.stageName, lang)}
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
                    onEditStandings={canManage ? () => { setSaveError(null); setEditing(table); } : undefined}
                    onResetStandings={canManage && table.manualOrder ? () => resetOverride(table) : undefined}
                />
            ))}
            <StandingsOverrideSheet
                open={!!editing}
                table={editing}
                busy={override.pending}
                errorText={saveError}
                onClose={() => { if (!override.pending) setEditing(null); }}
                onSave={(input) => { void saveOverride(input); }}
                onReset={editing?.manualOrder ? () => resetOverride(editing) : undefined}
            />
        </View>
    );
}
