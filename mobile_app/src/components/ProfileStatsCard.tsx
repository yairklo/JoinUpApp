import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { SPORT_EMOJI } from '@joinup/shared/sports';
import { getStatDefs, getSummaryKeys } from '@joinup/shared/matchStats';
import type { UserSportStats } from '@/types/results';
import { getSportTheme } from '@/components/ui/SportCover';
import { formatPerGame, statLabel, toLang } from '@/utils/matchStatsFormat';

export interface ProfileStatsCardProps {
    state: 'loading' | 'error' | 'ready';
    /** Server said the viewer may see stats. When false and not loading/error, nothing is rendered. */
    visible: boolean;
    isOwner: boolean;
    /** Server `ownerHidden`: the owner's stats are hidden from everyone else. */
    ownerHidden?: boolean;
    sports: UserSportStats[];
    selectedSport: string | null;
    onSelectSport: (sport: string) => void;
    onRetry: () => void;
    onOpenSettings?: () => void;
}

const BINARY_KEYS = new Set(['cleanSheet', 'mvp']);
const COLLAPSED_TILES = 4;

const CARD = 'bg-white dark:bg-cyber-card rounded-2xl p-5 border border-gray-100 dark:border-cyber-border mt-4';
const SKELETON = 'bg-gray-100 dark:bg-cyber-border rounded-xl';

function Skeleton() {
    return (
        <View className={CARD} testID="profile-stats" accessibilityState={{ busy: true }}>
            <View className={`${SKELETON} h-5 w-28 mb-4`} />
            <View className="flex-row" style={{ gap: 8 }}>
                {[0, 1, 2, 3].map((i) => <View key={i} className={`${SKELETON} flex-1 h-16`} />)}
            </View>
            <View className="flex-row mt-3" style={{ gap: 8 }}>
                {[0, 1].map((i) => <View key={i} className={`${SKELETON} flex-1 h-16`} />)}
            </View>
        </View>
    );
}

export default function ProfileStatsCard(props: ProfileStatsCardProps) {
    const { state, visible, isOwner, ownerHidden, sports, selectedSport, onSelectSport, onRetry, onOpenSettings } = props;
    const { t, i18n } = useTranslation();
    const lang = toLang(i18n.language);
    const [showAll, setShowAll] = useState(false);

    if (state === 'loading') return <Skeleton />;

    const title = isOwner ? t('stats.titleOwner') : t('stats.title');

    if (state === 'error') {
        return (
            <View className={CARD} testID="profile-stats-error">
                <Text className="text-lg font-bold text-gray-900 dark:text-cyber-text mb-2">{title}</Text>
                <Text className="text-gray-500 dark:text-cyber-muted">{t('stats.loadFailed')}</Text>
                <TouchableOpacity onPress={onRetry} className="min-h-[44px] justify-center" accessibilityRole="button">
                    <Text className="text-brand font-bold">{t('common.retry', 'נסו שוב')}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // Hidden or private profile: render nothing so a viewer cannot tell it from a profile without stats.
    if (!visible) return null;

    const hiddenBanner = isOwner && ownerHidden ? (
        <View testID="profile-stats-hidden-owner" className="flex-row items-center bg-gray-50 dark:bg-cyber-bg rounded-xl px-3 py-2 mb-3">
            <Ionicons name="eye-off-outline" size={16} color="#6b7280" />
            <Text className="text-xs text-gray-500 dark:text-cyber-muted flex-1 mx-2">{t('stats.hiddenOwner')}</Text>
            {onOpenSettings ? (
                <TouchableOpacity onPress={onOpenSettings} accessibilityRole="link" className="min-h-[44px] justify-center">
                    <Text className="text-xs font-bold text-brand">{t('stats.changeInSettings')}</Text>
                </TouchableOpacity>
            ) : null}
        </View>
    ) : null;

    if (sports.length === 0) {
        return (
            <View className={CARD} testID="profile-stats-empty">
                <Text className="text-lg font-bold text-gray-900 dark:text-cyber-text mb-3">{title}</Text>
                {hiddenBanner}
                {isOwner ? (
                    <View className="items-center py-3">
                        <Text style={{ fontSize: 32 }}>⚽🏀🎾</Text>
                        <Text className="font-bold text-gray-900 dark:text-cyber-text mt-2">{t('stats.emptyOwnerTitle')}</Text>
                        <Text className="text-center text-gray-500 dark:text-cyber-muted mt-1">{t('stats.emptyOwnerBody')}</Text>
                    </View>
                ) : (
                    <Text className="text-gray-500 dark:text-cyber-muted">{t('stats.emptyViewer')}</Text>
                )}
            </View>
        );
    }

    const ordered = [...sports].sort((a, b) => b.games - a.games);
    const current = ordered.find((s) => s.sport === selectedSport) ?? ordered[0];
    const theme = getSportTheme(current.sport);
    const decided = current.wins + current.draws + current.losses;
    const winPct = decided > 0 ? Math.round((current.wins / decided) * 100) : null;

    const summary = new Set<string>(getSummaryKeys(current.sport));
    const keys = (getStatDefs(current.sport) as { key: string }[])
        .map((d) => d.key)
        .filter((k) => (current.totals[k] ?? 0) > 0);
    const statKeys = [...keys.filter((k) => summary.has(k)), ...keys.filter((k) => !summary.has(k))];
    const visibleKeys = showAll ? statKeys : statKeys.slice(0, COLLAPSED_TILES);

    const tiles = [
        { id: 'games', value: current.games, label: t('stats.games'), tone: 'text-gray-900 dark:text-cyber-text' },
        { id: 'wins', value: current.wins, label: t('stats.wins'), tone: 'text-brand-dark dark:text-brand-light' },
        { id: 'draws', value: current.draws, label: t('stats.draws'), tone: 'text-indigo-700 dark:text-indigo-300' },
        { id: 'losses', value: current.losses, label: t('stats.losses'), tone: 'text-gray-600 dark:text-cyber-muted' },
    ];

    return (
        <View className={CARD} testID="profile-stats">
            <View className="flex-row items-center justify-between mb-3">
                <View className="flex-row items-center flex-1">
                    <Ionicons name="stats-chart-outline" size={18} color={theme.base} />
                    <Text className="text-lg font-bold text-gray-900 dark:text-cyber-text mx-2" numberOfLines={1}>{title}</Text>
                </View>
                <TouchableOpacity
                    onPress={() => Alert.alert('', t('stats.sourceHint'))}
                    accessibilityRole="button"
                    accessibilityLabel={t('stats.sourceHint')}
                    className="flex-row items-center min-h-[44px]"
                >
                    <Ionicons name="information-circle-outline" size={14} color="#6b7280" />
                    <Text className="text-xs text-gray-500 dark:text-cyber-muted ms-1">{t('stats.source')}</Text>
                </TouchableOpacity>
            </View>

            {hiddenBanner}

            {ordered.length > 1 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3" contentContainerStyle={{ gap: 8 }}>
                    {ordered.map((s) => {
                        const st = getSportTheme(s.sport);
                        const selected = s.sport === current.sport;
                        return (
                            <TouchableOpacity
                                key={s.sport}
                                testID={`profile-stats-sport-${s.sport}`}
                                onPress={() => { setShowAll(false); onSelectSport(s.sport); }}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                                className={`px-3 min-h-[44px] justify-center rounded-full ${selected ? '' : 'bg-gray-100 dark:bg-cyber-border'}`}
                                style={selected ? { backgroundColor: st.base } : undefined}
                            >
                                <Text
                                    className={`text-sm font-semibold ${selected ? '' : 'text-gray-700 dark:text-cyber-text'}`}
                                    style={selected ? { color: st.ink } : undefined}
                                >
                                    {(SPORT_EMOJI as Record<string, string>)[s.sport] || '🏅'} {t(`sports.${s.sport.toLowerCase()}`, s.sport)} · {s.games}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            )}

            <View className="flex-row" style={{ gap: 8 }}>
                {tiles.map((tile) => (
                    <View
                        key={tile.id}
                        testID={`profile-stats-tile-${tile.id}`}
                        className="flex-1 items-center bg-gray-50 dark:bg-cyber-bg rounded-xl py-3"
                    >
                        <Text className={`text-[22px] font-extrabold ${tile.tone}`} style={{ fontVariant: ['tabular-nums'] }}>{tile.value}</Text>
                        <Text className="text-xs text-gray-500 dark:text-cyber-muted" numberOfLines={1}>{tile.label}</Text>
                    </View>
                ))}
            </View>

            {decided > 0 && (
                <View className="mt-3">
                    <View
                        accessible
                        accessibilityRole="image"
                        accessibilityLabel={`${current.wins} ${t('stats.wins')}, ${current.draws} ${t('stats.draws')}, ${current.losses} ${t('stats.losses')}`}
                        className="flex-row h-2 rounded-full overflow-hidden"
                    >
                        {current.wins > 0 && <View className="bg-brand" style={{ flex: current.wins }} />}
                        {current.draws > 0 && <View className="bg-indigo-500" style={{ flex: current.draws }} />}
                        {current.losses > 0 && <View className="bg-gray-300 dark:bg-cyber-border" style={{ flex: current.losses }} />}
                    </View>
                    {winPct != null && (
                        <Text className="text-xs text-gray-500 dark:text-cyber-muted mt-1">{t('stats.winRate', { pct: winPct })}</Text>
                    )}
                </View>
            )}

            {visibleKeys.length > 0 && (
                <View className="flex-row flex-wrap mt-3" style={{ gap: 8 }}>
                    {visibleKeys.map((k) => {
                        const total = current.totals[k];
                        const per = current.perGame?.[k];
                        const binary = BINARY_KEYS.has(k);
                        return (
                            <View
                                key={k}
                                testID={`profile-stats-stat-${k}`}
                                className="rounded-xl p-3 overflow-hidden"
                                style={{ width: '48.5%' }}
                            >
                                {/* tint in light mode; deep at 35% in dark mode (no hex concatenation) */}
                                <View pointerEvents="none" className="dark:hidden" style={[StyleSheet.absoluteFill, { backgroundColor: theme.tint }]} />
                                <View pointerEvents="none" className="hidden dark:flex" style={[StyleSheet.absoluteFill, { backgroundColor: theme.deep, opacity: 0.35 }]} />
                                <Text className="text-[22px] font-extrabold text-gray-900 dark:text-cyber-text" style={{ fontVariant: ['tabular-nums'] }}>
                                    {binary ? `×${total}` : total}
                                </Text>
                                <Text className="text-xs text-gray-600 dark:text-cyber-muted" numberOfLines={1}>
                                    {statLabel(current.sport, k, lang, total)}
                                </Text>
                                {!binary && per != null && (
                                    <Text className="text-xs text-gray-500 dark:text-cyber-muted">
                                        {t('stats.perGame', { value: formatPerGame(per, lang) })}
                                    </Text>
                                )}
                            </View>
                        );
                    })}
                </View>
            )}

            {!showAll && statKeys.length > COLLAPSED_TILES && (
                <TouchableOpacity
                    testID="profile-stats-show-all"
                    onPress={() => setShowAll(true)}
                    accessibilityRole="button"
                    className="mt-3 min-h-[44px] items-center justify-center"
                >
                    <Text className="text-brand font-bold">{t('stats.showAll')}</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}
