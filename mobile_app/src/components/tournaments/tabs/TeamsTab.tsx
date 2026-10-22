import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTournament } from '@/hooks/useTournament';
import { useTournamentSchedule, useTournamentTeams } from '@/hooks/useTournamentViews';
import type { TournamentTeam } from '@/types/tournament';
import TeamBadge from '../TeamBadge';
import TeamSheet from '../team/TeamSheet';
import { fmtShortDate } from '../shellUtils';
import type { Lang } from '../matchFormat';
import { EmptyState, ErrorState, SkeletonList } from './TabState';
import type { TournamentTabProps } from './ScheduleTab';

/**
 * Teams tab (spec 6): rows of 64px (badge 32, 2-line name, count, chevron), my team first with a chip,
 * group sections once groups exist, withdrawn teams muted at the end. Row tap opens the team sheet.
 */
export default function TeamsTab({ tournamentId }: TournamentTabProps) {
    const { t, i18n } = useTranslation();
    const router = useRouter();
    const lang: Lang = i18n.language?.startsWith('en') ? 'en' : 'he';
    const { tournament } = useTournament(tournamentId);
    const { teams, loading, error, refetch } = useTournamentTeams(tournamentId);
    const { stages, matches, numberById } = useTournamentSchedule(tournamentId);
    const [selected, setSelected] = useState<TournamentTeam | null>(null);

    const groupNames = useMemo(() => {
        const o: Record<string, string> = {};
        for (const s of stages) for (const g of s.groups) o[g.id] = g.name;
        return o;
    }, [stages]);

    const { active, withdrawn } = useMemo(() => {
        const sorted = [...teams].sort((a, b) => Number(!!b.isMine) - Number(!!a.isMine) || a.name.localeCompare(b.name));
        return {
            active: sorted.filter((x) => x.status !== 'WITHDRAWN' && x.status !== 'REJECTED'),
            withdrawn: sorted.filter((x) => x.status === 'WITHDRAWN'),
        };
    }, [teams]);

    const grouped = useMemo(() => {
        if (!active.some((x) => x.groupId && groupNames[x.groupId])) return null;
        const by = new Map<string, TournamentTeam[]>();
        for (const x of active) {
            const k = x.groupId ?? '';
            by.set(k, [...(by.get(k) ?? []), x]);
        }
        return [...by.entries()].sort(([a], [b]) => (groupNames[a] ?? '').localeCompare(groupNames[b] ?? ''));
    }, [active, groupNames]);

    if (loading && teams.length === 0) return <View testID="teams-tab"><SkeletonList count={6} height={64} /></View>;
    if (error && teams.length === 0) return <View testID="teams-tab"><ErrorState onRetry={refetch} /></View>;

    if (active.length === 0 && withdrawn.length === 0) {
        const opensAt = tournament?.registrationOpensAt;
        const before = tournament?.status === 'DRAFT' || (!!opensAt && new Date(opensAt).getTime() > Date.now());
        const canRegister = !!tournament?.capabilities?.canRegisterTeam && tournament.status === 'REGISTRATION_OPEN';
        return (
            <View testID="teams-tab">
                <EmptyState
                    testID="teams-empty"
                    icon="people-outline"
                    text={before && opensAt ? t('tournaments.teams.emptyBefore', { date: fmtShortDate(opensAt, lang) }) : t('tournaments.teams.emptyOpen')}
                    actionLabel={canRegister ? t('tournaments.cta.register') : undefined}
                    onAction={canRegister ? () => router.push(`/tournaments/${tournamentId}/team/new` as any) : undefined}
                />
            </View>
        );
    }

    const row = (x: TournamentTeam, muted = false) => (
        <Pressable
            key={x.id}
            testID={`team-card-${x.id}`}
            onPress={() => setSelected(x)}
            accessibilityRole="button"
            accessibilityLabel={`${x.name}, ${t('tournaments.team.playersCount', { count: x.memberCount })}`}
            className="flex-row items-center rounded-2xl bg-white dark:bg-cyber-card border border-gray-100 dark:border-cyber-border px-3 mb-2"
            style={{ minHeight: 64, opacity: muted ? 0.6 : 1 }}
        >
            <View className="flex-1 me-2">
                <TeamBadge name={x.name} color={x.color} logoUrl={x.logoUrl} size={32} lines={2} strike={muted} bold={!!x.isMine} />
                {x.isMine ? (
                    <Text className="self-start mt-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 border border-emerald-600 dark:border-emerald-500 rounded-full px-2">
                        {t('tournaments.teams.yourTeam')}
                    </Text>
                ) : null}
            </View>
            <Text className="text-[12px] text-gray-500 dark:text-cyber-muted me-1" style={{ fontVariant: ['tabular-nums'] }}>
                {t('tournaments.team.playersCount', { count: x.memberCount })}
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" style={{ transform: [{ scaleX: i18n.language?.startsWith('he') ? -1 : 1 }] }} />
        </Pressable>
    );

    return (
        <View testID="teams-tab">
            {grouped
                ? grouped.map(([gid, list]) => (
                      <View key={gid || 'none'}>
                          {gid && groupNames[gid] ? (
                              <Text accessibilityRole="header" className="text-[14px] font-extrabold text-gray-900 dark:text-cyber-text mt-2 mb-2">
                                  {t('tournaments.team.group', { name: groupNames[gid] })}
                              </Text>
                          ) : null}
                          {list.map((x) => row(x))}
                      </View>
                  ))
                : active.map((x) => row(x))}
            {withdrawn.length > 0 ? (
                <View>
                    <Text accessibilityRole="header" className="text-[14px] font-extrabold text-gray-500 dark:text-cyber-muted mt-4 mb-2">
                        {t('tournaments.team.withdrawn')}
                    </Text>
                    {withdrawn.map((x) => row(x, true))}
                </View>
            ) : null}
            <TeamSheet tournamentId={tournamentId} team={selected} matches={matches} numberById={numberById} lang={lang} onClose={() => setSelected(null)} />
        </View>
    );
}
