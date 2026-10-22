import React, { useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useColorMode } from '@/theme/ColorModeContext';
import { useTournament } from '@/hooks/useTournament';
import { useLeaders } from '@/hooks/useTournamentViews';
import { tabular } from '@/components/results/resultUtils';
import { statLabel } from '@/utils/matchStatsFormat';
import { EmptyState, ErrorState, Pill, SkeletonList } from './TabState';
import type { TournamentTabProps } from './ScheduleTab';

const TOP = 10;
const MAX = 25;

/**
 * Top players tab (spec 13). Neutral wording and no medals: it must not read as an official
 * ranking. Key pills switch the stat; 10 rows, then "Show more" (25).
 */
export default function TopPlayersTab({ tournamentId }: TournamentTabProps) {
    const { t, i18n } = useTranslation();
    const { colorMode } = useColorMode();
    const lang = i18n.language?.startsWith('en') ? 'en' : 'he';
    const { tournament } = useTournament(tournamentId);
    const [key, setKey] = useState<string | undefined>(undefined);
    const [more, setMore] = useState(false);
    const { leaders, keys, key: activeKey, label, loading, error, refetch } = useLeaders(tournamentId, key, MAX);
    const sport = tournament?.sport ?? 'SOCCER';
    const myTeamId = tournament?.myTeam?.id ?? null;
    const dark = colorMode === 'dark';

    if (loading && leaders.length === 0 && keys.length === 0) return <View testID="leaders-tab"><SkeletonList count={5} height={56} /></View>;
    if (error && leaders.length === 0) return <View testID="leaders-tab"><ErrorState onRetry={refetch} /></View>;

    const labelText = label ? (lang === 'he' ? label.he : label.en) : activeKey ? statLabel(sport, activeKey, lang) : '';
    const shown = more ? leaders : leaders.slice(0, TOP);
    const ties = new Set(leaders.filter((l, i) => leaders.some((o, j) => j !== i && o.rank === l.rank)).map((l) => l.userId));

    return (
        <View testID="leaders-tab" className="self-center w-full" style={{ maxWidth: 640 }}>
            <Text accessibilityRole="header" className="text-lg font-extrabold text-gray-900 dark:text-cyber-text">{t('tournaments.leaders.title')}</Text>
            <View className="flex-row items-start mt-1 mb-3">
                <Ionicons name="information-circle-outline" size={14} color={dark ? '#9ca3af' : '#6b7280'} style={{ marginTop: 2, marginEnd: 4 }} />
                <Text className="text-xs text-gray-500 dark:text-cyber-muted flex-1">{t('tournaments.leaders.note')}</Text>
            </View>

            {keys.length > 1 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
                    {keys.map((k) => (
                        <Pill
                            key={k}
                            testID={`leaders-key-${k}`}
                            label={statLabel(sport, k, lang)}
                            selected={k === activeKey}
                            onPress={() => {
                                setKey(k);
                                setMore(false);
                            }}
                        />
                    ))}
                </ScrollView>
            ) : null}

            {leaders.length === 0 ? (
                <EmptyState
                    testID="leaders-empty"
                    icon="stats-chart-outline"
                    text={keys.length > 1 && labelText ? t('tournaments.leaders.emptyKey', { label: labelText }) : t('tournaments.leaders.empty')}
                />
            ) : (
                shown.map((l) => {
                    const mine = !!myTeamId && l.teamId === myTeamId;
                    return (
                        <View
                            key={l.userId}
                            testID={`leaders-row-${l.userId}`}
                            accessible
                            accessibilityLabel={`${l.rank}. ${l.name}, ${l.teamName}, ${l.value} ${labelText}`}
                            className={`flex-row items-center rounded-xl px-2 ${mine ? 'bg-brand-mist dark:bg-brand-ink' : ''}`}
                            style={{ height: 56 }}
                        >
                            <Text className="text-[13px] text-gray-500 dark:text-cyber-muted text-center" style={[tabular, { width: 28 }]}>
                                {ties.has(l.userId) ? '=' : ''}
                                {l.rank}
                            </Text>
                            {l.imageUrl ? (
                                <Image source={{ uri: l.imageUrl }} accessibilityIgnoresInvertColors className="rounded-full bg-gray-100 dark:bg-cyber-border" style={{ width: 40, height: 40 }} />
                            ) : (
                                <View className="rounded-full bg-gray-100 dark:bg-cyber-border items-center justify-center" style={{ width: 40, height: 40 }}>
                                    <Text className="text-[15px] font-bold text-gray-600 dark:text-cyber-muted">{l.name.slice(0, 1)}</Text>
                                </View>
                            )}
                            <View className="flex-1 ms-3" style={{ minWidth: 0 }}>
                                <Text numberOfLines={1} className={`text-[14px] text-gray-900 dark:text-cyber-text ${mine ? 'font-extrabold' : 'font-semibold'}`}>{l.name}</Text>
                                <Text numberOfLines={1} className="text-xs text-gray-500 dark:text-cyber-muted">{l.teamName}</Text>
                            </View>
                            <View className="items-end ms-2">
                                <Text className="text-[20px] font-extrabold text-gray-900 dark:text-cyber-text" style={tabular}>{l.value}</Text>
                                <Text className="text-[11px] text-gray-500 dark:text-cyber-muted">{t('tournaments.leaders.inMatches', { count: l.matches })}</Text>
                            </View>
                        </View>
                    );
                })
            )}

            {!more && leaders.length > TOP ? (
                <Pill testID="leaders-more" label={t('tournaments.leaders.more')} selected={false} onPress={() => setMore(true)} />
            ) : null}
        </View>
    );
}
