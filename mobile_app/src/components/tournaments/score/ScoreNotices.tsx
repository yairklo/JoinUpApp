import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import ScoreCluster from '../ScoreCluster';

interface Snapshot {
    home: number | null;
    away: number | null;
    sets?: [number, number][];
}

interface ConflictProps {
    homeName: string;
    awayName: string;
    theirs: Snapshot;
    mine: Snapshot;
    onKeepTheirs: () => void;
    onKeepMine: () => void;
    busy?: boolean;
}

/** VERSION_CONFLICT card (spec 12.6): newer saved score vs my unsaved values. Presentational. */
export function ConflictCard({ homeName, awayName, theirs, mine, onKeepTheirs, onKeepMine, busy }: ConflictProps) {
    const { t } = useTranslation();
    const rows: { id: string; label: string; v: Snapshot }[] = [
        { id: 'now', label: t('tournaments.score.conflictNow') as string, v: theirs },
        { id: 'mine', label: t('tournaments.score.conflictMine') as string, v: mine },
    ];
    return (
        <View
            testID="score-conflict"
            accessibilityRole="alert"
            className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 mb-3"
        >
            <View className="flex-row items-center">
                <Ionicons name="alert-circle-outline" size={18} color="#b45309" />
                <Text className="ms-2 flex-1 font-bold text-amber-800 dark:text-amber-200">{t('tournaments.score.conflictTitle')}</Text>
            </View>
            {rows.map((row) => (
                <View key={row.id} className="flex-row items-center mt-2">
                    <Text className="w-16 text-xs font-semibold text-gray-600 dark:text-cyber-muted">{row.label}</Text>
                    <Text numberOfLines={1} className="flex-1 text-xs text-gray-700 dark:text-cyber-text text-end" style={{ minWidth: 0 }}>
                        {homeName}
                    </Text>
                    <View className="mx-2">
                        <ScoreCluster home={row.v.home} away={row.v.away} sets={row.v.sets} size="sm" testID={`score-conflict-${row.id}`} />
                    </View>
                    <Text numberOfLines={1} className="flex-1 text-xs text-gray-700 dark:text-cyber-text" style={{ minWidth: 0 }}>
                        {awayName}
                    </Text>
                </View>
            ))}
            <View className="flex-row mt-3" style={{ gap: 8 }}>
                <Pressable
                    testID="score-conflict-keep-theirs"
                    onPress={onKeepTheirs}
                    disabled={busy}
                    accessibilityRole="button"
                    style={{ minHeight: 44 }}
                    className="flex-1 items-center justify-center rounded-xl border border-gray-300 dark:border-cyber-border"
                >
                    <Text className="font-bold text-gray-800 dark:text-cyber-text">{t('tournaments.score.keepTheirs')}</Text>
                </Pressable>
                <Pressable
                    testID="score-conflict-keep-mine"
                    onPress={onKeepMine}
                    disabled={busy}
                    accessibilityRole="button"
                    style={{ minHeight: 44 }}
                    className="flex-1 items-center justify-center rounded-xl bg-amber-600"
                >
                    <Text className="font-bold text-white">{t('tournaments.score.keepMine')}</Text>
                </Pressable>
            </View>
        </View>
    );
}

interface DownstreamProps {
    number: number | null;
    canForce: boolean;
    onForce: () => void;
    busy?: boolean;
}

/** DOWNSTREAM_FINISHED card (spec 12.5). The organizer may force; others only see the caption. */
export function DownstreamCard({ number, canForce, onForce, busy }: DownstreamProps) {
    const { t } = useTranslation();
    return (
        <View
            testID="score-downstream-warning"
            accessibilityRole="alert"
            className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 mb-3"
        >
            <Text className="font-bold text-amber-800 dark:text-amber-200">{t('tournaments.score.downstreamTitle')}</Text>
            <Text className="mt-1 text-sm text-gray-700 dark:text-cyber-text">{t('tournaments.score.downstreamBody', { n: number ?? '' })}</Text>
            {canForce ? (
                <Pressable
                    testID="score-force"
                    onPress={onForce}
                    disabled={busy}
                    accessibilityRole="button"
                    style={{ minHeight: 44 }}
                    className="mt-3 items-center justify-center rounded-xl border border-amber-500"
                >
                    <Text className="font-bold text-amber-700 dark:text-amber-300">{t('tournaments.score.downstreamForce')}</Text>
                </Pressable>
            ) : (
                <Text className="mt-2 text-xs text-gray-500 dark:text-cyber-muted">{t('tournaments.score.downstreamOrganizerOnly')}</Text>
            )}
        </View>
    );
}
