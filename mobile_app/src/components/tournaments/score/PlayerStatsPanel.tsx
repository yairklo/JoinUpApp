import React from 'react';
import { Image, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { getStatDefs, getStatLabel, getSummaryKeys } from '@joinup/shared/matchStats';
import ResultStepper from '@/components/results/ResultStepper';
import TeamBadge from '../TeamBadge';

export interface StatsRosterPlayer {
    userId: string;
    name: string;
    imageUrl?: string | null;
}
export interface StatsRosterGroup {
    teamId: string;
    teamName: string;
    color?: string | null;
    logoUrl?: string | null;
    players: StatsRosterPlayer[];
}

interface Props {
    sport: string;
    lang: 'he' | 'en';
    groups: StatsRosterGroup[];
    /** userId -> stat key -> value. */
    values: Record<string, Record<string, number>>;
    onChange: (userId: string, key: string, value: number) => void;
    /** Soft warnings already rendered by the sheet (full sentences). */
    warnings?: string[];
    disabled?: boolean;
}

/** Optional per-player stats (F1 3.4 quick stat inline stepper), grouped by team. Props only. */
export default function PlayerStatsPanel({ sport, lang, groups, values, onChange, warnings, disabled }: Props) {
    const { t } = useTranslation();
    const quickKey = getSummaryKeys(sport)[0];
    const def = getStatDefs(sport).find((d) => d.key === quickKey);
    if (!quickKey || !def) return null;
    const label = getStatLabel(sport, quickKey, lang);
    return (
        <View testID="score-stats">
            {groups.map((g) => (
                <View key={g.teamId} className="mb-3">
                    <TeamBadge name={g.teamName} color={g.color} logoUrl={g.logoUrl} bold />
                    {g.players.length === 0 ? (
                        <Text className="mt-1 text-sm text-gray-500 dark:text-cyber-muted">{t('resultEditor.noPlayers')}</Text>
                    ) : (
                        g.players.map((p) => (
                            <View
                                key={p.userId}
                                testID={`score-stat-player-${p.userId}`}
                                className="flex-row items-center border-b border-gray-100 dark:border-cyber-border"
                                style={{ minHeight: 56 }}
                            >
                                {p.imageUrl ? (
                                    <Image source={{ uri: p.imageUrl }} className="w-9 h-9 rounded-full bg-gray-200" />
                                ) : (
                                    <View className="w-9 h-9 rounded-full bg-gray-200 dark:bg-cyber-border" />
                                )}
                                <Text numberOfLines={2} className="ms-3 flex-1 font-semibold text-gray-900 dark:text-cyber-text" style={{ minWidth: 0 }}>
                                    {p.name}
                                </Text>
                                <View style={{ width: 132 }}>
                                    <ResultStepper
                                        size={44}
                                        valueClassName="text-[18px]"
                                        value={values[p.userId]?.[quickKey] ?? 0}
                                        max={def.max}
                                        onChange={(v) => onChange(p.userId, quickKey, v)}
                                        disabled={disabled}
                                        repeat={sport === 'BASKETBALL'}
                                        incLabel={`+ ${label}: ${p.name}`}
                                        decLabel={`- ${label}: ${p.name}`}
                                        testIDBase={`score-stat-${p.userId}-${quickKey}`}
                                    />
                                </View>
                            </View>
                        ))
                    )}
                </View>
            ))}
            {warnings?.map((w, i) => (
                <Text key={i} className="text-xs text-amber-700 dark:text-amber-300 mb-1">
                    {w}
                </Text>
            ))}
        </View>
    );
}
