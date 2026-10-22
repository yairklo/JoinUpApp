import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { toLang } from '@/components/results/resultUtils';
import type { MatchSlot, MatchStatus } from '@/types/tournament';
import SlotLabel from '../SlotLabel';
import MatchStatusChip from '../MatchStatusChip';
import { israelDateKey, israelDay, israelTime } from './manageUtils';

export interface ScheduleRow {
    /** Match id (committed) or preview key. Used in `schedule-match-block-{key}`. */
    key: string;
    number: number;
    home: Pick<MatchSlot, 'team' | 'source'>;
    away: Pick<MatchSlot, 'team' | 'source'>;
    scheduledAt: string | null;
    courtLabel?: string | null;
    hasConflict?: boolean;
    status?: MatchStatus;
    stageName?: string;
}

interface Props {
    rows: ScheduleRow[];
    numberById?: Record<string, number>;
    groupNames?: Record<string, string>;
    /** Row number to highlight (conflict chip tap). */
    highlightNumber?: number | null;
    /** When set the rows are tappable (edit sheet). */
    onPressRow?: (row: ScheduleRow) => void;
    /** Reports each row's y offset inside this list so the parent can scroll to it. */
    onRowLayout?: (number: number, y: number) => void;
}

/** "By day" view (spec 11.2): day header, then "18:30 · Court 2 · #12 Blue – Red". Presentational. */
export default function SchedulePreviewList({ rows, numberById, groupNames, highlightNumber, onPressRow, onRowLayout }: Props) {
    const { t, i18n } = useTranslation();
    const lang = toLang(i18n.language);
    const days = new Map<string, ScheduleRow[]>();
    const unscheduled: ScheduleRow[] = [];
    [...rows]
        .sort((a, b) => (a.scheduledAt ?? '9').localeCompare(b.scheduledAt ?? '9') || a.number - b.number)
        .forEach((r) => {
            if (!r.scheduledAt) unscheduled.push(r);
            else {
                const k = israelDateKey(r.scheduledAt);
                days.set(k, [...(days.get(k) ?? []), r]);
            }
        });

    const renderRow = (r: ScheduleRow) => {
        const hl = highlightNumber === r.number;
        const body = (
            <View
                onLayout={(e) => onRowLayout?.(r.number, e.nativeEvent.layout.y)}
                className={`rounded-xl px-3 py-2 mb-2 border ${hl ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40' : r.hasConflict ? 'border-amber-400 dark:border-amber-700 bg-white dark:bg-cyber-card' : 'border-gray-200 dark:border-cyber-border bg-white dark:bg-cyber-card'}`}
            >
                <View className="flex-row items-center">
                    <Text className="font-bold text-gray-900 dark:text-cyber-text" style={{ fontVariant: ['tabular-nums'] }}>
                        {r.scheduledAt ? israelTime(r.scheduledAt, lang) : '–'}
                    </Text>
                    {r.courtLabel ? (
                        <>
                            <Ionicons name="location-outline" size={13} color="#6b7280" style={{ marginStart: 8 }} />
                            <Text className="ms-1 text-xs text-gray-600 dark:text-cyber-muted">{r.courtLabel}</Text>
                        </>
                    ) : null}
                    <View className="flex-1" />
                    {r.hasConflict ? <Ionicons name="alert-circle-outline" size={16} color="#b45309" /> : null}
                    <Text className="ms-2 text-xs font-bold text-gray-500 dark:text-cyber-muted">#{r.number}</Text>
                    {r.status && r.status !== 'SCHEDULED' ? (
                        <View className="ms-2">
                            <MatchStatusChip status={r.status} />
                        </View>
                    ) : null}
                </View>
                <View className="mt-1">
                    <SlotLabel slot={r.home} numberById={numberById} groupNames={groupNames} />
                    <View className="mt-1">
                        <SlotLabel slot={r.away} numberById={numberById} groupNames={groupNames} />
                    </View>
                </View>
            </View>
        );
        return onPressRow ? (
            <Pressable
                key={r.key}
                testID={`schedule-match-block-${r.key}`}
                onPress={() => onPressRow(r)}
                accessibilityRole="button"
                accessibilityLabel={`#${r.number}`}
                accessibilityHint={t('tournaments.manage.sched.tapToEdit') as string}
            >
                {body}
            </Pressable>
        ) : (
            <View key={r.key} testID={`schedule-match-block-${r.key}`}>
                {body}
            </View>
        );
    };

    return (
        <View testID="schedule-view-day">
            {[...days.entries()].map(([k, list]) => (
                <View key={k} className="mb-2">
                    <Text className="font-extrabold text-gray-900 dark:text-cyber-text mb-2 mt-2">{israelDay(list[0].scheduledAt as string, lang)}</Text>
                    {list.map(renderRow)}
                </View>
            ))}
            {unscheduled.length ? (
                <View>
                    <Text className="font-extrabold text-gray-900 dark:text-cyber-text mb-2 mt-2">{t('tournaments.manage.sched.unscheduled')}</Text>
                    {unscheduled.map(renderRow)}
                </View>
            ) : null}
        </View>
    );
}
