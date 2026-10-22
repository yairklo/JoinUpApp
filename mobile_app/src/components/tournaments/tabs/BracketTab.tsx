import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTournament } from '@/hooks/useTournament';
import { useBracket, useTournamentSchedule } from '@/hooks/useTournamentViews';
import type { TournamentMatch } from '@/types/tournament';
import BracketView from '../BracketView';
import type { Lang } from '../matchFormat';
import { EmptyState, ErrorState, Pill, SkeletonList } from './TabState';
import type { TournamentTabProps } from './ScheduleTab';

/**
 * Bracket tab (spec 9): the knockout stage as round-by-round pages (default) or the whole tree,
 * plus a "my team's path" filter. Placeholders ("2 in group A") show before the groups finish.
 */
export default function BracketTab({ tournamentId }: TournamentTabProps) {
    const { t, i18n } = useTranslation();
    const router = useRouter();
    const lang: Lang = i18n.language?.startsWith('en') ? 'en' : 'he';
    const { tournament } = useTournament(tournamentId);
    const { stages, loading, error, refetch, changedMatchIds } = useBracket(tournamentId);
    const { stages: scheduleStages, numberById } = useTournamentSchedule(tournamentId);
    const [tree, setTree] = useState(false);
    const [path, setPath] = useState(false);
    const myTeamId = tournament?.myTeam?.id ?? null;

    if (loading && stages.length === 0) return <View testID="bracket-tab"><SkeletonList count={4} height={96} /></View>;
    if (error && stages.length === 0) return <View testID="bracket-tab"><ErrorState onRetry={refetch} /></View>;

    // GROUPS_KNOCKOUT: only the knockout stage; take the last stage that has rounds.
    const stage = [...stages].reverse().find((s) => s.rounds.some((r) => r.matches.length > 0));
    if (!stage) {
        const key = tournament?.format === 'GROUPS_KNOCKOUT' ? 'tournaments.bracket.afterGroups' : 'tournaments.bracket.afterSchedule';
        return (
            <View testID="bracket-tab">
                <EmptyState icon="git-network-outline" text={t(key)} />
            </View>
        );
    }

    const groupNames: Record<string, string> = {};
    for (const s of scheduleStages) for (const g of s.groups) groupNames[g.id] = g.name;
    const open = (m: TournamentMatch) => router.push(`/tournaments/${tournamentId}/matches/${m.id}` as any);

    return (
        <View testID="bracket-tab">
            <View className="flex-row items-center mb-2">
                <Pill testID="bracket-mode-toggle" label={tree ? t('tournaments.bracket.roundView') : t('tournaments.bracket.treeView')} selected={false} onPress={() => setTree((v) => !v)} />
                {myTeamId && !tree ? (
                    <Pill testID="bracket-my-path" label={t('tournaments.bracket.myPath')} selected={path} onPress={() => setPath((v) => !v)} />
                ) : null}
            </View>
            <BracketView
                stage={stage}
                numberById={numberById}
                groupNames={groupNames}
                myTeamId={myTeamId}
                sport={tournament?.sport}
                lang={lang}
                mode={tree ? 'tree' : 'rounds'}
                onlyTeamId={path && !tree ? myTeamId : null}
                completed={tournament?.status === 'COMPLETED'}
                changedMatchIds={changedMatchIds}
                onOpenMatch={open}
            />
        </View>
    );
}
